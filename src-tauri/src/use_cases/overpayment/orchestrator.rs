use std::sync::Arc;

use anyhow::Context;
use chrono::Local;

use crate::context::bank::{
    BankAccountService, BankEntry, BankEntryLinkRepository, BankEntryService, BankEntryType,
};
use crate::context::fund::{
    FundPaymentGroup, FundPaymentGroupStatus, FundPaymentLine, FundPaymentService,
};
use crate::context::procedure::{
    PaymentMethod, Procedure, ProcedureRefund, ProcedureRefundRepository, ProcedureService,
    ProcedureStatus,
};

use super::domain::{CreateOverpaymentRequest, ProcedureRefundInfo};

/// Orchestrator for the overpayment refund feature (REF).
/// Cross-context: coordinates Procedure, Fund, and Bank bounded contexts.
pub struct OverpaymentOrchestrator {
    procedure_service: Arc<ProcedureService>,
    fund_payment_service: Arc<FundPaymentService>,
    bank_transfer_service: Arc<BankEntryService>,
    bank_account_service: Arc<BankAccountService>,
    transfer_link_repo: Arc<dyn BankEntryLinkRepository>,
    procedure_refund_repo: Arc<dyn ProcedureRefundRepository>,
}

impl OverpaymentOrchestrator {
    pub fn new(
        procedure_service: Arc<ProcedureService>,
        fund_payment_service: Arc<FundPaymentService>,
        bank_transfer_service: Arc<BankEntryService>,
        bank_account_service: Arc<BankAccountService>,
        transfer_link_repo: Arc<dyn BankEntryLinkRepository>,
        procedure_refund_repo: Arc<dyn ProcedureRefundRepository>,
    ) -> Self {
        Self {
            procedure_service,
            fund_payment_service,
            bank_transfer_service,
            bank_account_service,
            transfer_link_repo,
            procedure_refund_repo,
        }
    }

    /// Create an overpayment refund record (REF-050 to REF-160).
    ///
    /// Executes the full creation cascade. Each step is sequential;
    /// on any failure the caller is responsible for returning the error.
    /// Partial state can occur if the process fails mid-way — this is an accepted
    /// trade-off consistent with the rest of the codebase which does not use
    /// a distributed transaction manager. Each record ID is persisted into
    /// `ProcedureRefund` only after all records are created (REF-130).
    pub async fn create_overpayment(&self, req: CreateOverpaymentRequest) -> anyhow::Result<()> {
        tracing::info!(
            source_procedure_id = %req.source_procedure_id,
            refund_date = %req.refund_date,
            "Creating overpayment refund"
        );

        // Step 1 — Load source procedure, verify eligibility (REF-010)
        let source = self
            .procedure_service
            .read_procedure(&req.source_procedure_id)
            .await?
            .ok_or_else(|| {
                anyhow::anyhow!("Source procedure not found: {}", req.source_procedure_id)
            })?;

        anyhow::ensure!(
            matches!(
                source.payment_status,
                ProcedureStatus::FundPaid | ProcedureStatus::PartiallyFundPaid
            ),
            "REF-010: procedure {} is not eligible for a refund (status: {:?})",
            source.id,
            source.payment_status
        );

        // Step 2 — Full refund only: amount must equal source amount (REF-020)
        let source_amount = source
            .billed_amount
            .ok_or_else(|| anyhow::anyhow!("Source procedure {} has no amount set", source.id))?;

        // Step 3 — Validate refund_date (REF-030)
        let refund_date =
            chrono::NaiveDate::parse_from_str(&req.refund_date, "%Y-%m-%d").map_err(|_| {
                anyhow::anyhow!(
                    "REF-030: invalid refund_date format: {} (expected YYYY-MM-DD)",
                    req.refund_date
                )
            })?;

        let today = Local::now().date_naive();
        anyhow::ensure!(
            refund_date <= today,
            "REF-030: refund_date {} is in the future",
            refund_date
        );

        if let Some(confirmed) = source.confirmed_payment_date {
            anyhow::ensure!(
                refund_date >= confirmed,
                "REF-030: refund_date {} is before source confirmed_payment_date {}",
                refund_date,
                confirmed
            );
        }

        // Step 4 — Validate reason max 255 chars (REF-040)
        if let Some(ref reason) = req.reason {
            anyhow::ensure!(
                reason.len() <= 255,
                "REF-040: reason must not exceed 255 characters (got {})",
                reason.len()
            );
        }

        // Step 5 — Validate transfer type (REF-060)
        let transfer_type = parse_transfer_type(&req.transfer_type)?;

        // Step 6 — Validate bank account is provided (REF-070)
        anyhow::ensure!(
            !req.bank_account_id.is_empty(),
            "REF-070: bank_account_id is required"
        );
        let bank_account = self
            .bank_account_service
            .read_account(&req.bank_account_id)
            .await
            .with_context(|| format!("REF-070: bank account not found: {}", req.bank_account_id))?;

        let previous_payment_status = source.payment_status;

        // Step 7 — Create refund Procedure (REF-090)
        // Direct assignment of OverpaymentRefund status — bypasses lifecycle transitions.
        // Uses the ProcedureService.create_procedure which calls Procedure::new() internally.
        // Negative billed_amount is allowed (no amount validation in Procedure).
        // payment_method is mapped from the user-selected transfer_type so it appears in the
        // procedure list column. confirmed_payment_date is set to refund_date because the
        // refund is considered executed at that date.
        let refund_payment_method = match transfer_type {
            BankEntryType::PatientCheck => PaymentMethod::Check,
            BankEntryType::PatientCreditCard => PaymentMethod::BankCard,
            BankEntryType::FundOutgoingWire => PaymentMethod::BankTransfer,
            _ => PaymentMethod::None,
        };
        let refund_procedure = self
            .procedure_service
            .create_procedure(
                source.patient_id.clone(),
                source.fund_id.clone(),
                source.procedure_type_id.clone(),
                req.refund_date.clone(),
                Some(-source_amount),
                refund_payment_method,
                Some(req.refund_date.clone()),
                Some(-source_amount),
                ProcedureStatus::OverpaymentRefund,
            )
            .await?;

        // Step 8 — Create refund FundPaymentGroup (REF-100)
        // BankPaid status and negative total_amount bypass normal validation.
        // Build the group with a known ID so we can set the line's group_id.
        let group_id = uuid::Uuid::new_v4().to_string();
        let refund_line = FundPaymentLine::new(group_id.clone(), refund_procedure.id.clone())?;

        let fund_id = source.fund_id.clone().ok_or_else(|| {
            anyhow::anyhow!(
                "Source procedure {} has no fund_id — cannot create refund group",
                source.id
            )
        })?;

        let refund_group = FundPaymentGroup::restore(
            group_id,
            fund_id,
            refund_date,
            -source_amount,
            vec![refund_line],
            FundPaymentGroupStatus::BankPaid,
        );

        let refund_group = self
            .fund_payment_service
            .persist_refund_group(refund_group)
            .await?;

        // Step 9 — Create refund BankEntry (REF-110)
        // Uses BankEntry::restore() via persist_refund_transfer to bypass positive-amount check.
        let transfer_id = uuid::Uuid::new_v4().to_string();
        let refund_transfer = BankEntry::restore(
            transfer_id,
            req.refund_date.clone(),
            -source_amount,
            transfer_type,
            bank_account,
        );

        let refund_transfer = self
            .bank_transfer_service
            .persist_refund_transfer(refund_transfer, true)
            .await?;

        // Step 10 — Create BankTransferLink (REF-120)
        self.transfer_link_repo
            .link_fund_groups(&refund_transfer.id, std::slice::from_ref(&refund_group.id))
            .await?;

        // Step 11 — Create ProcedureRefund record (REF-130)
        let procedure_refund = ProcedureRefund::new(
            source.id.clone(),
            refund_procedure.id.clone(),
            refund_group.id.clone(),
            refund_transfer.id.clone(),
            req.refund_date.clone(),
            req.reason.clone(),
            previous_payment_status,
        )?;

        self.procedure_refund_repo
            .create_procedure_refund(&procedure_refund)
            .await?;

        // Step 12 — Update source procedure status to Overpaid (REF-160)
        let updated_source = Procedure::restore(
            source.id.clone(),
            source.patient_id,
            source.fund_id,
            source.procedure_type_id,
            source.procedure_date,
            source.billed_amount,
            source.payment_method,
            source.confirmed_payment_date,
            source.paid_amount,
            ProcedureStatus::Overpaid,
        );

        self.procedure_service
            .update_procedure(updated_source)
            .await?;

        tracing::info!(
            source_procedure_id = %req.source_procedure_id,
            refund_procedure_id = %refund_procedure.id,
            "Overpayment refund created successfully"
        );

        Ok(())
    }

    /// Cancel an overpayment refund, reversing the full creation cascade (REF-210).
    /// Always receives `source_procedure_id` as identifier.
    pub async fn cancel_overpayment(&self, source_procedure_id: &str) -> anyhow::Result<()> {
        tracing::info!(
            source_procedure_id = %source_procedure_id,
            "Cancelling overpayment refund"
        );

        // Look up the ProcedureRefund record
        let refund_record = self
            .procedure_refund_repo
            .find_by_source_procedure_id(source_procedure_id)
            .await?
            .ok_or_else(|| {
                anyhow::anyhow!(
                    "No overpayment record found for source procedure: {}",
                    source_procedure_id
                )
            })?;

        // 1. Revert source procedure status to previous_payment_status
        let source = self
            .procedure_service
            .read_procedure(source_procedure_id)
            .await?
            .ok_or_else(|| {
                anyhow::anyhow!("Source procedure not found: {}", source_procedure_id)
            })?;

        let reverted_source = Procedure::restore(
            source.id.clone(),
            source.patient_id,
            source.fund_id,
            source.procedure_type_id,
            source.procedure_date,
            source.billed_amount,
            source.payment_method,
            source.confirmed_payment_date,
            source.paid_amount,
            refund_record.previous_payment_status,
        );
        self.procedure_service
            .update_procedure(reverted_source)
            .await?;

        // 2. Delete ProcedureRefund link
        self.procedure_refund_repo
            .delete_procedure_refund(&refund_record.id)
            .await?;

        // 3. Delete BankTransferLink
        self.transfer_link_repo
            .unlink_all_fund_groups(&refund_record.refund_bank_transfer_id)
            .await?;

        // 4. Delete refund BankEntry
        self.bank_transfer_service
            .delete_transfer(&refund_record.refund_bank_transfer_id)
            .await?;

        // 5. Delete refund FundPaymentGroup (and its lines)
        self.fund_payment_service
            .delete_lines_by_group(&refund_record.refund_fund_payment_group_id)
            .await?;
        self.fund_payment_service
            .delete_group(refund_record.refund_fund_payment_group_id.clone())
            .await?;

        // 6. Delete refund Procedure (soft delete)
        self.procedure_service
            .delete_procedure(&refund_record.refund_procedure_id)
            .await?;

        tracing::info!(
            source_procedure_id = %source_procedure_id,
            "Overpayment refund cancelled successfully"
        );

        Ok(())
    }

    /// Fetch a ProcedureRefund by source_procedure_id.
    /// Used by the frontend to resolve source_procedure_id from the OverpaymentRefund modal (REF-200).
    pub async fn get_procedure_refund_by_source(
        &self,
        source_procedure_id: &str,
    ) -> anyhow::Result<Option<ProcedureRefundInfo>> {
        let record = self
            .procedure_refund_repo
            .find_by_source_procedure_id(source_procedure_id)
            .await?;

        Ok(record.map(|r| ProcedureRefundInfo {
            id: r.id,
            source_procedure_id: r.source_procedure_id,
            refund_procedure_id: r.refund_procedure_id,
            refund_date: r.refund_date.format("%Y-%m-%d").to_string(),
            reason: r.reason,
            previous_payment_status: r.previous_payment_status,
        }))
    }

    /// Fetch a ProcedureRefund by refund_procedure_id.
    /// Used by the frontend when cancelling from the OverpaymentRefund modal (REF-200):
    /// the modal only has the refund procedure's ID and must resolve source_procedure_id.
    pub async fn get_procedure_refund_by_refund_procedure(
        &self,
        refund_procedure_id: &str,
    ) -> anyhow::Result<Option<ProcedureRefundInfo>> {
        let record = self
            .procedure_refund_repo
            .find_by_refund_procedure_id(refund_procedure_id)
            .await?;

        Ok(record.map(|r| ProcedureRefundInfo {
            id: r.id,
            source_procedure_id: r.source_procedure_id,
            refund_procedure_id: r.refund_procedure_id,
            refund_date: r.refund_date.format("%Y-%m-%d").to_string(),
            reason: r.reason,
            previous_payment_status: r.previous_payment_status,
        }))
    }

    /// Check whether a fund payment group belongs to a refund (REF-240 guard).
    /// Used by `delete_fund_payment_group` to prevent direct deletion.
    pub async fn is_refund_fund_payment_group(&self, group_id: &str) -> anyhow::Result<bool> {
        self.procedure_refund_repo
            .is_refund_fund_payment_group(group_id)
            .await
    }
}

/// Parse a transfer_type string from the frontend into a `BankEntryType`.
/// Accepted values: "CreditCard", "Check", "OutgoingWire" (REF-060).
/// "Cash" and "Fund" are explicitly rejected.
fn parse_transfer_type(s: &str) -> anyhow::Result<BankEntryType> {
    match s {
        "CreditCard" => Ok(BankEntryType::PatientCreditCard),
        "Check" => Ok(BankEntryType::PatientCheck),
        "OutgoingWire" => Ok(BankEntryType::FundOutgoingWire),
        "Cash" => anyhow::bail!("REF-060: 'Cash' is not an accepted refund payment method"),
        "Fund" => anyhow::bail!(
            "REF-060: 'Fund' is not an accepted refund payment method (it is an incoming type)"
        ),
        other => anyhow::bail!(
            "REF-060: unknown transfer_type '{}'. Accepted: CreditCard, Check, OutgoingWire",
            other
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::context::bank::{
        BankAccount, BankAccountRepository, BankEntry, MockBankAccountRepository,
        MockBankEntryLinkRepository, MockBankEntryRepository,
    };
    use crate::context::fund::MockFundPaymentRepository;
    use crate::context::procedure::{
        MockProcedureRefundRepository, MockProcedureRepository, ProcedureRefund,
    };
    use crate::core::event_bus::EventBus;
    use chrono::NaiveDate;
    use std::sync::Arc;

    // --- Mock repository builders ---
    //
    // Helpers replacing previously hand-rolled trait impls. mockall panics on
    // an unconfigured method call — that matches the previous `unimplemented!()`
    // semantics, so "must-not-be-called" methods are intentionally left out of
    // the builder configuration.

    /// `read_procedure` returns the captured option; mutating CRUD methods
    /// echo their input. Other repo methods panic on call (matches the
    /// previous ProcRepoReturns mock).
    fn proc_repo_returns(proc_result: Option<Procedure>) -> MockProcedureRepository {
        let mut mock = MockProcedureRepository::new();
        mock.expect_read_all_procedures().returning(|| Ok(vec![]));
        mock.expect_read_procedure()
            .returning(move |_| Ok(proc_result.clone()));
        mock.expect_update_procedure().returning(Ok);
        mock.expect_delete_procedure().returning(|_| Ok(()));
        mock.expect_create_batch().returning(Ok);
        mock
    }

    fn fund_payment_repo_unimplemented() -> MockFundPaymentRepository {
        MockFundPaymentRepository::new()
    }

    fn bank_entry_repo_unimplemented() -> MockBankEntryRepository {
        MockBankEntryRepository::new()
    }

    fn bank_account_repo_unimplemented() -> MockBankAccountRepository {
        let mut mock = MockBankAccountRepository::new();
        // The bank-account service queries find_by_iban_including_deleted during
        // account update — match the previous mock's only non-unimplemented path.
        mock.expect_find_by_iban_including_deleted()
            .returning(|_| Ok(None));
        mock
    }

    fn bank_entry_link_repo_unimplemented() -> MockBankEntryLinkRepository {
        MockBankEntryLinkRepository::new()
    }

    fn procedure_refund_repo_noop() -> MockProcedureRefundRepository {
        let mut mock = MockProcedureRefundRepository::new();
        mock.expect_create_procedure_refund().returning(|_| Ok(()));
        mock.expect_find_by_source_procedure_id()
            .returning(|_| Ok(None));
        mock.expect_find_by_refund_procedure_id()
            .returning(|_| Ok(None));
        mock.expect_delete_procedure_refund().returning(|_| Ok(()));
        mock.expect_is_refund_fund_payment_group()
            .returning(|_| Ok(false));
        mock
    }

    // --- Full-success mock builders (for steps 7-12) ---

    /// Procedure repo for the success-path tests: `create_procedure` returns
    /// the constructed procedure with a fixed id `refund-proc-1`; `read_procedure`
    /// returns the canonical fund-paid source procedure; other queries return
    /// empty/None defaults.
    fn proc_repo_for_success() -> MockProcedureRepository {
        let mut mock = MockProcedureRepository::new();
        mock.expect_create_procedure().returning(
            |patient_id,
             fund_id,
             procedure_type_id,
             procedure_date,
             billed_amount,
             payment_method,
             confirmed_payment_date,
             paid_amount,
             payment_status| {
                let date = chrono::NaiveDate::parse_from_str(&procedure_date, "%Y-%m-%d")
                    .unwrap_or_default();
                Ok(Procedure::restore(
                    "refund-proc-1".to_string(),
                    patient_id,
                    fund_id,
                    procedure_type_id,
                    date,
                    billed_amount,
                    payment_method,
                    confirmed_payment_date
                        .as_deref()
                        .and_then(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok()),
                    paid_amount,
                    payment_status,
                ))
            },
        );
        mock.expect_read_all_procedures().returning(|| Ok(vec![]));
        mock.expect_read_procedure()
            .returning(|_| Ok(Some(fund_paid_procedure())));
        mock.expect_read_procedures_by_ids()
            .returning(|_| Ok(vec![]));
        mock.expect_read_procedures_by_patient_id()
            .returning(|_| Ok(vec![]));
        mock.expect_update_procedure().returning(Ok);
        mock.expect_delete_procedure().returning(|_| Ok(()));
        mock.expect_find_procedures_by_ssn_and_date_range()
            .returning(|_, _, _| Ok(vec![]));
        mock.expect_find_procedures_by_ssns_and_date_range()
            .returning(|_, _, _| Ok(vec![]));
        mock.expect_find_procedures_by_ssns_and_date_range_with_ssn()
            .returning(|_, _, _| Ok(vec![]));
        mock.expect_find_procedure_exact()
            .returning(|_, _, _, _| Ok(None));
        mock.expect_create_batch().returning(Ok);
        mock.expect_update_batch().returning(Ok);
        mock.expect_find_unpaid_by_fund().returning(|_| Ok(vec![]));
        mock.expect_has_blocking_procedures_in_month()
            .returning(|_| Ok(false));
        mock.expect_delete_procedures_by_month()
            .returning(|_| Ok(0));
        mock.expect_find_unreconciled_by_date_range()
            .returning(|_, _| Ok(vec![]));
        mock.expect_find_created_in_date_range()
            .returning(|_, _| Ok(vec![]));
        mock.expect_find_created_by_fund_before_date()
            .returning(|_, _| Ok(vec![]));
        mock
    }

    /// Fund-payment repo that echoes all writes and returns empty for reads.
    /// `create_group` and `create_batch_groups` deliberately unconfigured —
    /// they must not be called on this path.
    fn fund_payment_repo_persist_ok() -> MockFundPaymentRepository {
        let mut mock = MockFundPaymentRepository::new();
        mock.expect_create_lines().returning(Ok);
        mock.expect_read_group().returning(|_| Ok(None));
        mock.expect_read_lines_by_group().returning(|_| Ok(vec![]));
        mock.expect_read_all_groups().returning(|| Ok(vec![]));
        mock.expect_update_group().returning(Ok);
        mock.expect_update_group_status().returning(|_, _| Ok(()));
        mock.expect_delete_lines_by_group().returning(|_| Ok(()));
        mock.expect_delete_group().returning(|_| Ok(()));
        mock.expect_exists_group().returning(|_, _, _| Ok(false));
        mock.expect_persist_group().returning(Ok);
        mock
    }

    fn bank_account_repo_returns_account() -> MockBankAccountRepository {
        let mut mock = MockBankAccountRepository::new();
        mock.expect_create_account().returning(Ok);
        mock.expect_read_all_accounts().returning(|| Ok(vec![]));
        mock.expect_read_account().returning(|id| {
            Ok(Some(BankAccount::restore(
                id.to_string(),
                "Test Account".to_string(),
                None,
            )))
        });
        mock.expect_find_by_iban().returning(|_| Ok(None));
        mock.expect_find_by_iban_including_deleted()
            .returning(|_| Ok(None));
        mock.expect_update_account().returning(Ok);
        mock.expect_delete_account().returning(|_| Ok(()));
        mock
    }

    /// `read_transfer` returns a canned negative-amount PatientCheck entry;
    /// `update`/`delete`/`persist` echo their input. `create_transfer` is
    /// deliberately unconfigured — must not be called on this path.
    fn bank_entry_repo_persist_ok() -> MockBankEntryRepository {
        let mut mock = MockBankEntryRepository::new();
        mock.expect_read_transfer().returning(|id| {
            Ok(Some(BankEntry::restore(
                id.to_string(),
                "2024-03-01".to_string(),
                -100_000,
                BankEntryType::PatientCheck,
                BankAccount::restore("account-1".to_string(), "Test Account".to_string(), None),
            )))
        });
        mock.expect_read_all_transfers().returning(|| Ok(vec![]));
        mock.expect_update_transfer().returning(Ok);
        mock.expect_delete_transfer().returning(|_| Ok(()));
        mock.expect_persist_transfer().returning(Ok);
        mock
    }

    fn bank_entry_link_repo_noop() -> MockBankEntryLinkRepository {
        let mut mock = MockBankEntryLinkRepository::new();
        mock.expect_link_fund_groups().returning(|_, _| Ok(()));
        mock.expect_get_fund_group_ids().returning(|_| Ok(vec![]));
        mock.expect_unlink_all_fund_groups().returning(|_| Ok(()));
        mock.expect_get_transfer_for_fund_group()
            .returning(|_| Ok(None));
        mock.expect_link_procedures().returning(|_, _| Ok(()));
        mock.expect_get_procedure_ids().returning(|_| Ok(vec![]));
        mock.expect_unlink_all_procedures().returning(|_| Ok(()));
        mock
    }

    /// Refund-repo that surfaces `record` from both `find_by_source_procedure_id`
    /// and `find_by_refund_procedure_id`, and reports refund-group as true.
    fn procedure_refund_repo_with_record(record: ProcedureRefund) -> MockProcedureRefundRepository {
        let mut mock = MockProcedureRefundRepository::new();
        let record_for_source = record.clone();
        mock.expect_create_procedure_refund().returning(|_| Ok(()));
        mock.expect_find_by_source_procedure_id()
            .returning(move |_| Ok(Some(record_for_source.clone())));
        mock.expect_find_by_refund_procedure_id()
            .returning(move |_| Ok(Some(record.clone())));
        mock.expect_delete_procedure_refund().returning(|_| Ok(()));
        mock.expect_is_refund_fund_payment_group()
            .returning(|_| Ok(true));
        mock
    }

    fn make_success_orchestrator() -> OverpaymentOrchestrator {
        let event_bus = Arc::new(EventBus::new());
        let procedure_service = Arc::new(ProcedureService::new(
            Arc::new(proc_repo_for_success()),
            event_bus.clone(),
        ));
        let fund_payment_service = Arc::new(FundPaymentService::new(
            Arc::new(fund_payment_repo_persist_ok()),
            event_bus.clone(),
        ));
        let bank_account_repo: Arc<dyn BankAccountRepository> =
            Arc::new(bank_account_repo_returns_account());
        let bank_transfer_service = Arc::new(BankEntryService::new(
            Arc::new(bank_entry_repo_persist_ok()),
            bank_account_repo.clone(),
            event_bus.clone(),
        ));
        let bank_account_service = Arc::new(BankAccountService::new(
            bank_account_repo,
            event_bus.clone(),
        ));
        OverpaymentOrchestrator::new(
            procedure_service,
            fund_payment_service,
            bank_transfer_service,
            bank_account_service,
            Arc::new(bank_entry_link_repo_noop()),
            Arc::new(procedure_refund_repo_noop()),
        )
    }

    fn make_cancel_orchestrator() -> OverpaymentOrchestrator {
        let refund_record = crate::context::procedure::ProcedureRefund::restore(
            "refund-id-1".to_string(),
            "source-proc-1".to_string(),
            "refund-proc-1".to_string(),
            "group-1".to_string(),
            "transfer-1".to_string(),
            NaiveDate::from_ymd_opt(2024, 3, 1).unwrap(),
            None,
            ProcedureStatus::FundPaid,
        );
        let event_bus = Arc::new(EventBus::new());
        let procedure_service = Arc::new(ProcedureService::new(
            Arc::new(proc_repo_for_success()),
            event_bus.clone(),
        ));
        let fund_payment_service = Arc::new(FundPaymentService::new(
            Arc::new(fund_payment_repo_persist_ok()),
            event_bus.clone(),
        ));
        let bank_account_repo: Arc<dyn BankAccountRepository> =
            Arc::new(bank_account_repo_returns_account());
        let bank_transfer_service = Arc::new(BankEntryService::new(
            Arc::new(bank_entry_repo_persist_ok()),
            bank_account_repo.clone(),
            event_bus.clone(),
        ));
        let bank_account_service = Arc::new(BankAccountService::new(
            bank_account_repo,
            event_bus.clone(),
        ));
        OverpaymentOrchestrator::new(
            procedure_service,
            fund_payment_service,
            bank_transfer_service,
            bank_account_service,
            Arc::new(bank_entry_link_repo_noop()),
            Arc::new(procedure_refund_repo_with_record(refund_record)),
        )
    }

    fn make_orchestrator(proc_result: Option<Procedure>) -> OverpaymentOrchestrator {
        let event_bus = Arc::new(EventBus::new());
        let procedure_service = Arc::new(ProcedureService::new(
            Arc::new(proc_repo_returns(proc_result)),
            event_bus.clone(),
        ));
        let fund_payment_service = Arc::new(FundPaymentService::new(
            Arc::new(fund_payment_repo_unimplemented()),
            event_bus.clone(),
        ));
        let bank_account_repo: Arc<dyn BankAccountRepository> =
            Arc::new(bank_account_repo_unimplemented());
        let bank_transfer_service = Arc::new(BankEntryService::new(
            Arc::new(bank_entry_repo_unimplemented()),
            bank_account_repo.clone(),
            event_bus.clone(),
        ));
        let bank_account_service = Arc::new(BankAccountService::new(
            bank_account_repo,
            event_bus.clone(),
        ));
        OverpaymentOrchestrator::new(
            procedure_service,
            fund_payment_service,
            bank_transfer_service,
            bank_account_service,
            Arc::new(bank_entry_link_repo_unimplemented()),
            Arc::new(procedure_refund_repo_noop()),
        )
    }

    fn fund_paid_procedure() -> Procedure {
        Procedure::restore(
            "source-proc-1".to_string(),
            "patient-1".to_string(),
            Some("fund-1".to_string()),
            "type-1".to_string(),
            NaiveDate::from_ymd_opt(2024, 1, 15).unwrap(),
            Some(100_000),
            PaymentMethod::None,
            Some(NaiveDate::from_ymd_opt(2024, 1, 10).unwrap()),
            Some(100_000),
            ProcedureStatus::FundPaid,
        )
    }

    fn base_request() -> CreateOverpaymentRequest {
        CreateOverpaymentRequest {
            source_procedure_id: "source-proc-1".to_string(),
            refund_date: "2024-03-01".to_string(),
            transfer_type: "Check".to_string(),
            bank_account_id: "account-1".to_string(),
            reason: None,
        }
    }

    // --- create_overpayment validation tests ---

    #[tokio::test]
    async fn create_overpayment_source_procedure_not_found_returns_error() {
        let orchestrator = make_orchestrator(None);
        let result = orchestrator.create_overpayment(base_request()).await;
        let err = result.unwrap_err().to_string();
        assert!(err.contains("not found"));
    }

    #[tokio::test]
    async fn create_overpayment_wrong_status_returns_ref_010() {
        let created_proc = Procedure::restore(
            "source-proc-1".to_string(),
            "patient-1".to_string(),
            None,
            "type-1".to_string(),
            NaiveDate::from_ymd_opt(2024, 1, 15).unwrap(),
            Some(100_000),
            PaymentMethod::None,
            None,
            None,
            ProcedureStatus::Created,
        );
        let orchestrator = make_orchestrator(Some(created_proc));
        let result = orchestrator.create_overpayment(base_request()).await;
        let err = result.unwrap_err().to_string();
        assert!(err.contains("REF-010"));
    }

    #[tokio::test]
    async fn create_overpayment_no_billed_amount_returns_error() {
        let proc = Procedure::restore(
            "source-proc-1".to_string(),
            "patient-1".to_string(),
            Some("fund-1".to_string()),
            "type-1".to_string(),
            NaiveDate::from_ymd_opt(2024, 1, 15).unwrap(),
            None, // no billed_amount
            PaymentMethod::None,
            None,
            None,
            ProcedureStatus::FundPaid,
        );
        let orchestrator = make_orchestrator(Some(proc));
        let result = orchestrator.create_overpayment(base_request()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("no amount set"));
    }

    #[tokio::test]
    async fn create_overpayment_invalid_date_format_returns_ref_030() {
        let orchestrator = make_orchestrator(Some(fund_paid_procedure()));
        let mut req = base_request();
        req.refund_date = "not-a-date".to_string();
        let result = orchestrator.create_overpayment(req).await;
        let err = result.unwrap_err().to_string();
        assert!(err.contains("REF-030"));
    }

    #[tokio::test]
    async fn create_overpayment_future_date_returns_ref_030() {
        let orchestrator = make_orchestrator(Some(fund_paid_procedure()));
        let mut req = base_request();
        req.refund_date = "2099-01-01".to_string();
        let result = orchestrator.create_overpayment(req).await;
        let err = result.unwrap_err().to_string();
        assert!(err.contains("REF-030"));
    }

    #[tokio::test]
    async fn create_overpayment_date_before_confirmed_payment_returns_ref_030() {
        let orchestrator = make_orchestrator(Some(fund_paid_procedure()));
        let mut req = base_request();
        req.refund_date = "2024-01-05".to_string(); // before confirmed_payment_date 2024-01-10
        let result = orchestrator.create_overpayment(req).await;
        let err = result.unwrap_err().to_string();
        assert!(err.contains("REF-030"));
    }

    #[tokio::test]
    async fn create_overpayment_reason_too_long_returns_ref_040() {
        let orchestrator = make_orchestrator(Some(fund_paid_procedure()));
        let mut req = base_request();
        req.reason = Some("x".repeat(256));
        let result = orchestrator.create_overpayment(req).await;
        let err = result.unwrap_err().to_string();
        assert!(err.contains("REF-040"));
    }

    #[tokio::test]
    async fn create_overpayment_invalid_transfer_type_returns_ref_060() {
        let orchestrator = make_orchestrator(Some(fund_paid_procedure()));
        let mut req = base_request();
        req.transfer_type = "Cash".to_string();
        let result = orchestrator.create_overpayment(req).await;
        let err = result.unwrap_err().to_string();
        assert!(err.contains("REF-060"));
    }

    #[tokio::test]
    async fn create_overpayment_empty_bank_account_id_returns_ref_070() {
        let orchestrator = make_orchestrator(Some(fund_paid_procedure()));
        let mut req = base_request();
        req.bank_account_id = String::new();
        let result = orchestrator.create_overpayment(req).await;
        let err = result.unwrap_err().to_string();
        assert!(err.contains("REF-070"));
    }

    // --- cancel_overpayment ---

    #[tokio::test]
    async fn cancel_overpayment_no_record_returns_error() {
        let orchestrator = make_orchestrator(None);
        let result = orchestrator.cancel_overpayment("missing-proc").await;
        let err = result.unwrap_err().to_string();
        assert!(err.contains("No overpayment record found"));
    }

    // --- get_procedure_refund_by_source ---

    #[tokio::test]
    async fn get_procedure_refund_by_source_returns_none_when_absent() {
        let orchestrator = make_orchestrator(None);
        let result = orchestrator
            .get_procedure_refund_by_source("nonexistent")
            .await
            .unwrap();
        assert!(result.is_none());
    }

    // --- get_procedure_refund_by_refund_procedure ---

    #[tokio::test]
    async fn get_procedure_refund_by_refund_procedure_returns_none_when_absent() {
        let orchestrator = make_orchestrator(None);
        let result = orchestrator
            .get_procedure_refund_by_refund_procedure("nonexistent")
            .await
            .unwrap();
        assert!(result.is_none());
    }

    // --- is_refund_fund_payment_group ---

    #[tokio::test]
    async fn is_refund_fund_payment_group_delegates_to_repository() {
        let orchestrator = make_orchestrator(None);
        let result = orchestrator
            .is_refund_fund_payment_group("some-group")
            .await
            .unwrap();
        assert!(!result);
    }

    #[test]
    fn parse_transfer_type_credit_card() {
        assert_eq!(
            parse_transfer_type("CreditCard").unwrap(),
            BankEntryType::PatientCreditCard
        );
    }

    #[test]
    fn parse_transfer_type_check() {
        assert_eq!(
            parse_transfer_type("Check").unwrap(),
            BankEntryType::PatientCheck
        );
    }

    #[test]
    fn parse_transfer_type_outgoing_wire() {
        assert_eq!(
            parse_transfer_type("OutgoingWire").unwrap(),
            BankEntryType::FundOutgoingWire
        );
    }

    #[test]
    fn parse_transfer_type_rejects_cash_with_ref_060() {
        let err = parse_transfer_type("Cash").unwrap_err();
        assert!(err.to_string().contains("REF-060"));
    }

    #[test]
    fn parse_transfer_type_rejects_fund_with_ref_060() {
        let err = parse_transfer_type("Fund").unwrap_err();
        assert!(err.to_string().contains("REF-060"));
    }

    #[test]
    fn parse_transfer_type_rejects_unknown_value_with_ref_060_and_value() {
        let err = parse_transfer_type("Venmo").unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("REF-060"));
        assert!(msg.contains("Venmo"));
    }

    // --- create_overpayment success path (steps 7-12) ---

    #[tokio::test]
    async fn create_overpayment_success_returns_ok() {
        let orchestrator = make_success_orchestrator();
        let result = orchestrator.create_overpayment(base_request()).await;
        assert!(result.is_ok(), "expected Ok, got: {:?}", result.err());
    }

    #[tokio::test]
    async fn create_overpayment_success_with_outgoing_wire() {
        let orchestrator = make_success_orchestrator();
        let mut req = base_request();
        req.transfer_type = "OutgoingWire".to_string();
        let result = orchestrator.create_overpayment(req).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn create_overpayment_success_with_credit_card() {
        let orchestrator = make_success_orchestrator();
        let mut req = base_request();
        req.transfer_type = "CreditCard".to_string();
        let result = orchestrator.create_overpayment(req).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn create_overpayment_success_with_reason() {
        let orchestrator = make_success_orchestrator();
        let mut req = base_request();
        req.reason = Some("Billing error correction".to_string());
        let result = orchestrator.create_overpayment(req).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn create_overpayment_with_partially_fund_paid_source_succeeds() {
        let event_bus = Arc::new(EventBus::new());
        // Inline mockall: source procedure is in PartiallyFundPaid status;
        // create_procedure mints `refund-proc-2`.
        let mut proc_repo = MockProcedureRepository::new();
        proc_repo.expect_create_procedure().returning(
            |patient_id,
             fund_id,
             procedure_type_id,
             procedure_date,
             billed_amount,
             payment_method,
             confirmed_payment_date,
             paid_amount,
             payment_status| {
                let date = chrono::NaiveDate::parse_from_str(&procedure_date, "%Y-%m-%d")
                    .unwrap_or_default();
                Ok(Procedure::restore(
                    "refund-proc-2".to_string(),
                    patient_id,
                    fund_id,
                    procedure_type_id,
                    date,
                    billed_amount,
                    payment_method,
                    confirmed_payment_date
                        .as_deref()
                        .and_then(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok()),
                    paid_amount,
                    payment_status,
                ))
            },
        );
        proc_repo
            .expect_read_all_procedures()
            .returning(|| Ok(vec![]));
        proc_repo.expect_read_procedure().returning(|_| {
            Ok(Some(Procedure::restore(
                "source-proc-1".to_string(),
                "patient-1".to_string(),
                Some("fund-1".to_string()),
                "type-1".to_string(),
                NaiveDate::from_ymd_opt(2024, 1, 15).unwrap(),
                Some(50_000),
                PaymentMethod::None,
                Some(NaiveDate::from_ymd_opt(2024, 1, 10).unwrap()),
                Some(50_000),
                ProcedureStatus::PartiallyFundPaid,
            )))
        });
        proc_repo
            .expect_read_procedures_by_ids()
            .returning(|_| Ok(vec![]));
        proc_repo
            .expect_read_procedures_by_patient_id()
            .returning(|_| Ok(vec![]));
        proc_repo.expect_update_procedure().returning(Ok);
        proc_repo.expect_delete_procedure().returning(|_| Ok(()));
        proc_repo
            .expect_find_procedures_by_ssn_and_date_range()
            .returning(|_, _, _| Ok(vec![]));
        proc_repo
            .expect_find_procedures_by_ssns_and_date_range()
            .returning(|_, _, _| Ok(vec![]));
        proc_repo
            .expect_find_procedures_by_ssns_and_date_range_with_ssn()
            .returning(|_, _, _| Ok(vec![]));
        proc_repo
            .expect_find_procedure_exact()
            .returning(|_, _, _, _| Ok(None));
        proc_repo.expect_create_batch().returning(Ok);
        proc_repo.expect_update_batch().returning(Ok);
        proc_repo
            .expect_find_unpaid_by_fund()
            .returning(|_| Ok(vec![]));
        proc_repo
            .expect_has_blocking_procedures_in_month()
            .returning(|_| Ok(false));
        proc_repo
            .expect_delete_procedures_by_month()
            .returning(|_| Ok(0));
        proc_repo
            .expect_find_unreconciled_by_date_range()
            .returning(|_, _| Ok(vec![]));
        proc_repo
            .expect_find_created_in_date_range()
            .returning(|_, _| Ok(vec![]));
        proc_repo
            .expect_find_created_by_fund_before_date()
            .returning(|_, _| Ok(vec![]));

        let procedure_service = Arc::new(ProcedureService::new(
            Arc::new(proc_repo),
            event_bus.clone(),
        ));
        let fund_payment_service = Arc::new(FundPaymentService::new(
            Arc::new(fund_payment_repo_persist_ok()),
            event_bus.clone(),
        ));
        let bank_account_repo: Arc<dyn BankAccountRepository> =
            Arc::new(bank_account_repo_returns_account());
        let bank_transfer_service = Arc::new(BankEntryService::new(
            Arc::new(bank_entry_repo_persist_ok()),
            bank_account_repo.clone(),
            event_bus.clone(),
        ));
        let bank_account_service = Arc::new(BankAccountService::new(
            bank_account_repo,
            event_bus.clone(),
        ));
        let orchestrator = OverpaymentOrchestrator::new(
            procedure_service,
            fund_payment_service,
            bank_transfer_service,
            bank_account_service,
            Arc::new(bank_entry_link_repo_noop()),
            Arc::new(procedure_refund_repo_noop()),
        );

        let result = orchestrator.create_overpayment(base_request()).await;
        assert!(result.is_ok());
    }

    // --- cancel_overpayment success path ---

    #[tokio::test]
    async fn cancel_overpayment_success_returns_ok() {
        let orchestrator = make_cancel_orchestrator();
        let result = orchestrator.cancel_overpayment("source-proc-1").await;
        assert!(result.is_ok(), "expected Ok, got: {:?}", result.err());
    }

    // --- get_procedure_refund_by_source with record ---

    #[tokio::test]
    async fn get_procedure_refund_by_source_returns_some_when_present() {
        let orchestrator = make_cancel_orchestrator();
        let result = orchestrator
            .get_procedure_refund_by_source("source-proc-1")
            .await
            .unwrap();
        assert!(result.is_some());
        let info = result.unwrap();
        assert_eq!(info.source_procedure_id, "source-proc-1");
        assert_eq!(info.refund_procedure_id, "refund-proc-1");
    }

    // --- get_procedure_refund_by_refund_procedure with record ---

    #[tokio::test]
    async fn get_procedure_refund_by_refund_procedure_returns_some_when_present() {
        let orchestrator = make_cancel_orchestrator();
        let result = orchestrator
            .get_procedure_refund_by_refund_procedure("refund-proc-1")
            .await
            .unwrap();
        assert!(result.is_some());
        let info = result.unwrap();
        assert_eq!(info.refund_procedure_id, "refund-proc-1");
        assert_eq!(info.refund_date, "2024-03-01");
    }

    // --- is_refund_fund_payment_group returns true ---

    #[tokio::test]
    async fn is_refund_fund_payment_group_returns_true_when_present() {
        let orchestrator = make_cancel_orchestrator();
        let result = orchestrator
            .is_refund_fund_payment_group("group-1")
            .await
            .unwrap();
        assert!(result);
    }
}

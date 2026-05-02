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
            req.refund_date.clone(),
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
    use crate::context::bank::{BankAccount, BankAccountRepository, BankEntryRepository};
    use crate::context::fund::FundPaymentRepository;
    use crate::context::procedure::{ProcedureRepository, UnreconciledProcedure};
    use crate::core::event_bus::EventBus;
    use chrono::NaiveDate;
    use std::sync::Arc;

    // --- Minimal mock repositories ---

    struct ProcRepoReturns(Option<Procedure>);

    #[async_trait::async_trait]
    impl ProcedureRepository for ProcRepoReturns {
        #[allow(clippy::too_many_arguments)]
        async fn create_procedure(
            &self,
            _patient_id: String,
            _fund_id: Option<String>,
            _procedure_type_id: String,
            _procedure_date: String,
            _procedure_amount: Option<i64>,
            _payment_method: PaymentMethod,
            _confirmed_payment_date: Option<String>,
            _actual_payment_amount: Option<i64>,
            _payment_status: ProcedureStatus,
        ) -> anyhow::Result<Procedure> {
            unimplemented!()
        }
        async fn read_all_procedures(&self) -> anyhow::Result<Vec<Procedure>> {
            Ok(vec![])
        }
        async fn read_procedure(&self, _id: &str) -> anyhow::Result<Option<Procedure>> {
            Ok(self.0.clone())
        }
        async fn read_procedures_by_ids(&self, _ids: &[String]) -> anyhow::Result<Vec<Procedure>> {
            unimplemented!()
        }
        async fn read_procedures_by_patient_id(
            &self,
            _patient_id: &str,
        ) -> anyhow::Result<Vec<Procedure>> {
            unimplemented!()
        }
        async fn update_procedure(&self, p: Procedure) -> anyhow::Result<Procedure> {
            Ok(p)
        }
        async fn delete_procedure(&self, _id: &str) -> anyhow::Result<()> {
            Ok(())
        }
        async fn find_procedures_by_ssn_and_date_range(
            &self,
            _ssn: &str,
            _start_date: &str,
            _end_date: &str,
        ) -> anyhow::Result<Vec<Procedure>> {
            unimplemented!()
        }
        async fn find_procedures_by_ssns_and_date_range(
            &self,
            _ssns: &[String],
            _start_date: &str,
            _end_date: &str,
        ) -> anyhow::Result<Vec<Procedure>> {
            unimplemented!()
        }
        async fn find_procedures_by_ssns_and_date_range_with_ssn(
            &self,
            _ssns: &[String],
            _start_date: &str,
            _end_date: &str,
        ) -> anyhow::Result<Vec<(String, Procedure)>> {
            unimplemented!()
        }
        async fn find_procedure_exact(
            &self,
            _patient_id: &str,
            _fund_id: Option<&str>,
            _procedure_date: &str,
            _procedure_amount: i64,
        ) -> anyhow::Result<Option<Procedure>> {
            unimplemented!()
        }
        async fn create_batch(&self, procedures: Vec<Procedure>) -> anyhow::Result<Vec<Procedure>> {
            Ok(procedures)
        }
        async fn update_batch(
            &self,
            _procedures: Vec<Procedure>,
        ) -> anyhow::Result<Vec<Procedure>> {
            unimplemented!()
        }
        async fn find_unpaid_by_fund(&self, _fund_id: &str) -> anyhow::Result<Vec<Procedure>> {
            unimplemented!()
        }
        async fn has_blocking_procedures_in_month(&self, _month: &str) -> anyhow::Result<bool> {
            unimplemented!()
        }
        async fn delete_procedures_by_month(&self, _month: &str) -> anyhow::Result<u64> {
            unimplemented!()
        }
        async fn find_unreconciled_by_date_range(
            &self,
            _start_date: &str,
            _end_date: &str,
        ) -> anyhow::Result<Vec<UnreconciledProcedure>> {
            unimplemented!()
        }
        async fn find_created_in_date_range(
            &self,
            _date_min: &str,
            _date_max: &str,
        ) -> anyhow::Result<Vec<Procedure>> {
            unimplemented!()
        }
        async fn find_created_by_fund_before_date(
            &self,
            _fund_id: &str,
            _date: &str,
        ) -> anyhow::Result<Vec<Procedure>> {
            unimplemented!()
        }
    }

    struct FundPaymentRepoUnimplemented;

    #[async_trait::async_trait]
    impl FundPaymentRepository for FundPaymentRepoUnimplemented {
        async fn create_group(
            &self,
            _fund_id: String,
            _payment_date: String,
            _total_amount: i64,
            _procedure_ids: Vec<String>,
        ) -> anyhow::Result<FundPaymentGroup> {
            unimplemented!()
        }
        async fn create_batch_groups(
            &self,
            _groups: Vec<FundPaymentGroup>,
        ) -> anyhow::Result<Vec<FundPaymentGroup>> {
            unimplemented!()
        }
        async fn create_lines(
            &self,
            _lines: Vec<FundPaymentLine>,
        ) -> anyhow::Result<Vec<FundPaymentLine>> {
            unimplemented!()
        }
        async fn read_group(&self, _id: &str) -> anyhow::Result<Option<FundPaymentGroup>> {
            unimplemented!()
        }
        async fn read_lines_by_group(
            &self,
            _group_id: &str,
        ) -> anyhow::Result<Vec<FundPaymentLine>> {
            unimplemented!()
        }
        async fn read_all_groups(&self) -> anyhow::Result<Vec<FundPaymentGroup>> {
            unimplemented!()
        }
        async fn update_group(&self, _group: FundPaymentGroup) -> anyhow::Result<FundPaymentGroup> {
            unimplemented!()
        }
        async fn update_group_status(
            &self,
            _group_id: &str,
            _status: FundPaymentGroupStatus,
        ) -> anyhow::Result<()> {
            unimplemented!()
        }
        async fn delete_lines_by_group(&self, _group_id: &str) -> anyhow::Result<()> {
            unimplemented!()
        }
        async fn delete_group(&self, _group_id: &str) -> anyhow::Result<()> {
            unimplemented!()
        }
        async fn exists_group(
            &self,
            _fund_id: &str,
            _payment_date: &str,
            _total_amount: i64,
        ) -> anyhow::Result<bool> {
            unimplemented!()
        }
        async fn persist_group(
            &self,
            _group: FundPaymentGroup,
        ) -> anyhow::Result<FundPaymentGroup> {
            unimplemented!()
        }
    }

    struct BankEntryRepoUnimplemented;

    #[async_trait::async_trait]
    impl BankEntryRepository for BankEntryRepoUnimplemented {
        async fn create_transfer(
            &self,
            _transfer_date: String,
            _amount: i64,
            _transfer_type: BankEntryType,
            _bank_account: BankAccount,
        ) -> anyhow::Result<BankEntry> {
            unimplemented!()
        }
        async fn read_transfer(&self, _id: &str) -> anyhow::Result<Option<BankEntry>> {
            unimplemented!()
        }
        async fn read_all_transfers(&self) -> anyhow::Result<Vec<BankEntry>> {
            unimplemented!()
        }
        async fn update_transfer(&self, _transfer: BankEntry) -> anyhow::Result<BankEntry> {
            unimplemented!()
        }
        async fn delete_transfer(&self, _id: &str) -> anyhow::Result<()> {
            unimplemented!()
        }
        async fn persist_transfer(&self, _transfer: BankEntry) -> anyhow::Result<BankEntry> {
            unimplemented!()
        }
    }

    struct BankAccountRepoUnimplemented;

    #[async_trait::async_trait]
    impl BankAccountRepository for BankAccountRepoUnimplemented {
        async fn create_account(&self, _account: BankAccount) -> anyhow::Result<BankAccount> {
            unimplemented!()
        }
        async fn read_all_accounts(&self) -> anyhow::Result<Vec<BankAccount>> {
            unimplemented!()
        }
        async fn read_account(&self, _id: &str) -> anyhow::Result<Option<BankAccount>> {
            unimplemented!()
        }
        async fn find_by_iban(&self, _iban: &str) -> anyhow::Result<Option<BankAccount>> {
            unimplemented!()
        }
        async fn update_account(&self, _account: BankAccount) -> anyhow::Result<BankAccount> {
            unimplemented!()
        }
        async fn delete_account(&self, _id: &str) -> anyhow::Result<()> {
            unimplemented!()
        }
    }

    struct BankEntryLinkRepoUnimplemented;

    #[async_trait::async_trait]
    impl BankEntryLinkRepository for BankEntryLinkRepoUnimplemented {
        async fn link_fund_groups(
            &self,
            _bank_transfer_id: &str,
            _fund_group_ids: &[String],
        ) -> anyhow::Result<()> {
            unimplemented!()
        }
        async fn get_fund_group_ids(&self, _bank_transfer_id: &str) -> anyhow::Result<Vec<String>> {
            unimplemented!()
        }
        async fn unlink_all_fund_groups(&self, _bank_transfer_id: &str) -> anyhow::Result<()> {
            unimplemented!()
        }
        async fn get_transfer_for_fund_group(
            &self,
            _fund_group_id: &str,
        ) -> anyhow::Result<Option<String>> {
            unimplemented!()
        }
        async fn link_procedures(
            &self,
            _bank_transfer_id: &str,
            _procedure_ids: &[String],
        ) -> anyhow::Result<()> {
            unimplemented!()
        }
        async fn get_procedure_ids(&self, _bank_transfer_id: &str) -> anyhow::Result<Vec<String>> {
            unimplemented!()
        }
        async fn unlink_all_procedures(&self, _bank_transfer_id: &str) -> anyhow::Result<()> {
            unimplemented!()
        }
    }

    struct ProcedureRefundRepoNoop;

    #[async_trait::async_trait]
    impl ProcedureRefundRepository for ProcedureRefundRepoNoop {
        async fn create_procedure_refund(
            &self,
            _refund: &crate::context::procedure::ProcedureRefund,
        ) -> anyhow::Result<()> {
            Ok(())
        }
        async fn find_by_source_procedure_id(
            &self,
            _source_id: &str,
        ) -> anyhow::Result<Option<crate::context::procedure::ProcedureRefund>> {
            Ok(None)
        }
        async fn find_by_refund_procedure_id(
            &self,
            _refund_procedure_id: &str,
        ) -> anyhow::Result<Option<crate::context::procedure::ProcedureRefund>> {
            Ok(None)
        }
        async fn delete_procedure_refund(&self, _id: &str) -> anyhow::Result<()> {
            Ok(())
        }
        async fn is_refund_fund_payment_group(&self, _group_id: &str) -> anyhow::Result<bool> {
            Ok(false)
        }
    }

    fn make_orchestrator(proc_result: Option<Procedure>) -> OverpaymentOrchestrator {
        let event_bus = Arc::new(EventBus::new());
        let procedure_service = Arc::new(ProcedureService::new(
            Arc::new(ProcRepoReturns(proc_result)),
            event_bus.clone(),
        ));
        let fund_payment_service = Arc::new(FundPaymentService::new(
            Arc::new(FundPaymentRepoUnimplemented),
            event_bus.clone(),
        ));
        let bank_account_repo: Arc<dyn BankAccountRepository> =
            Arc::new(BankAccountRepoUnimplemented);
        let bank_transfer_service = Arc::new(BankEntryService::new(
            Arc::new(BankEntryRepoUnimplemented),
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
            Arc::new(BankEntryLinkRepoUnimplemented),
            Arc::new(ProcedureRefundRepoNoop),
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
}

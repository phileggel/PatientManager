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

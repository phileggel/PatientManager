use anyhow::Result;
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use specta::Type;
use uuid::Uuid;

use super::procedure::ProcedureStatus;

/// Maximum length for the optional reason field (REF-040).
const MAX_REASON_LEN: usize = 255;

/// ProcedureRefund entity
///
/// Records the link between an original paid procedure and the refund procedure
/// created to offset an overpayment (REF-130). Immutable once created (REF-140).
/// Owned by `context/procedure/` (REF-150).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ProcedureRefund {
    pub id: String,
    /// The original procedure that was overpaid.
    pub source_procedure_id: String,
    /// The new negative-amount procedure created to represent the refund (REF-090).
    pub refund_procedure_id: String,
    /// The fund payment group created for the refund (REF-100). Used for REF-240 guard.
    pub refund_fund_payment_group_id: String,
    /// The bank transfer created for the refund (REF-110).
    pub refund_bank_transfer_id: String,
    /// The date the refund was recorded/paid.
    #[specta(type = String)]
    pub refund_date: NaiveDate,
    /// Optional text explaining why the refund was requested (max 255 chars, REF-040).
    pub reason: Option<String>,
    /// The source procedure's payment status before it became `Overpaid`.
    /// Used by REF-210 to revert the source to its exact prior state.
    pub previous_payment_status: ProcedureStatus,
}

impl ProcedureRefund {
    /// Creates a new ProcedureRefund with validation and generates ID.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        source_procedure_id: String,
        refund_procedure_id: String,
        refund_fund_payment_group_id: String,
        refund_bank_transfer_id: String,
        refund_date: String,
        reason: Option<String>,
        previous_payment_status: ProcedureStatus,
    ) -> Result<Self> {
        Self::validate(&reason)?;

        let parsed_date = NaiveDate::parse_from_str(&refund_date, "%Y-%m-%d").map_err(|_| {
            anyhow::anyhow!(
                "Invalid refund date format: {} (expected YYYY-MM-DD)",
                refund_date
            )
        })?;

        Ok(Self {
            id: Uuid::new_v4().to_string(),
            source_procedure_id,
            refund_procedure_id,
            refund_fund_payment_group_id,
            refund_bank_transfer_id,
            refund_date: parsed_date,
            reason,
            previous_payment_status,
        })
    }

    /// Restores a ProcedureRefund from database storage (no validation).
    #[allow(clippy::too_many_arguments)]
    pub fn restore(
        id: String,
        source_procedure_id: String,
        refund_procedure_id: String,
        refund_fund_payment_group_id: String,
        refund_bank_transfer_id: String,
        refund_date: NaiveDate,
        reason: Option<String>,
        previous_payment_status: ProcedureStatus,
    ) -> Self {
        Self {
            id,
            source_procedure_id,
            refund_procedure_id,
            refund_fund_payment_group_id,
            refund_bank_transfer_id,
            refund_date,
            reason,
            previous_payment_status,
        }
    }

    fn validate(reason: &Option<String>) -> Result<()> {
        if let Some(r) = reason {
            if r.len() > MAX_REASON_LEN {
                anyhow::bail!(
                    "Reason must not exceed {} characters (got {})",
                    MAX_REASON_LEN,
                    r.len()
                );
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_procedure_refund() {
        let refund = ProcedureRefund::new(
            "src-id".to_string(),
            "refund-id".to_string(),
            "group-id".to_string(),
            "transfer-id".to_string(),
            "2026-04-01".to_string(),
            Some("Test reason".to_string()),
            ProcedureStatus::FundPaid,
        )
        .unwrap();

        assert_eq!(refund.source_procedure_id, "src-id");
        assert_eq!(refund.refund_procedure_id, "refund-id");
        assert_eq!(refund.previous_payment_status, ProcedureStatus::FundPaid);
        assert!(!refund.id.is_empty());
    }

    #[test]
    fn test_reason_too_long_rejected() {
        let long_reason = "x".repeat(256);
        let result = ProcedureRefund::new(
            "src-id".to_string(),
            "refund-id".to_string(),
            "group-id".to_string(),
            "transfer-id".to_string(),
            "2026-04-01".to_string(),
            Some(long_reason),
            ProcedureStatus::FundPaid,
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("255"));
    }

    #[test]
    fn test_reason_exactly_255_ok() {
        let reason = "x".repeat(255);
        let result = ProcedureRefund::new(
            "src-id".to_string(),
            "refund-id".to_string(),
            "group-id".to_string(),
            "transfer-id".to_string(),
            "2026-04-01".to_string(),
            Some(reason),
            ProcedureStatus::FundPaid,
        );
        assert!(result.is_ok());
    }
}

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use specta::Type;
use uuid::Uuid;

use super::bank_account::BankAccount;
use crate::context::bank::error::{BankEntryInvalidReason, BankError};

/// Payment type for bank transfers
///
/// Note: `OutgoingWire` is exclusively created via the overpayment refund flow (REF-080).
/// It must NOT be accepted in the bank statement manual-match UI.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BankEntryType {
    #[default]
    FundWire,
    PatientCheck,
    PatientCreditCard,
    PatientCash,
    /// Outgoing wire refund — only creatable via the overpayment flow (REF-080, REF-110).
    /// Carries a negative amount to represent money returned to a fund.
    FundOutgoingWire,
}

impl BankEntryType {
    /// A payment the patient made directly (check, card, cash): what the
    /// direct-transfer commands handle. A fund's wire and a refund's wire
    /// (REF-110, removed only by REF-210) are not.
    pub fn is_patient_payment(self) -> bool {
        matches!(
            self,
            Self::PatientCheck | Self::PatientCreditCard | Self::PatientCash
        )
    }

    /// REF-080 — Reject `FundOutgoingWire`: it is exclusively created via the
    /// overpayment refund flow and must not be created through any other code
    /// path. All other variants (including `FundWire`) are accepted.
    pub fn ensure_not_refund_only_variant(self) -> Result<(), BankError> {
        if self == BankEntryType::FundOutgoingWire {
            return Err(BankError::RefundOnlyVariantRejected);
        }
        Ok(())
    }
}

/// BankEntry aggregate root
/// Represents a bank transfer (FUND) or direct payment (CHECK/CREDIT_CARD/CASH).
/// Links to fund payment groups or procedures are stored in junction tables.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields)]
pub struct BankEntry {
    pub id: String,
    #[serde(serialize_with = "serialize_date")]
    #[specta(type = String)]
    pub transfer_date: NaiveDate,
    pub amount: i64,
    pub transfer_type: BankEntryType,
    pub bank_account: BankAccount,
}

/// Serialize NaiveDate as ISO format string for serde
fn serialize_date<S>(date: &NaiveDate, serializer: S) -> std::result::Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_str(&date.format("%Y-%m-%d").to_string())
}

impl BankEntry {
    /// Creates a new BankEntry with validation and generates ID.
    pub fn new(
        transfer_date: String,
        amount: i64,
        transfer_type: BankEntryType,
        bank_account: BankAccount,
    ) -> Result<Self, BankError> {
        Self::validate(amount)?;

        let parsed_date = NaiveDate::parse_from_str(&transfer_date, "%Y-%m-%d")
            .map_err(|_| BankError::InvalidTransferDateFormat)?;

        Ok(Self {
            id: Uuid::new_v4().to_string(),
            transfer_date: parsed_date,
            amount,
            transfer_type,
            bank_account,
        })
    }

    /// Creates a BankEntry with an existing ID and validation.
    /// Does NOT generate a new ID.
    pub fn with_id(
        id: String,
        transfer_date: String,
        amount: i64,
        transfer_type: BankEntryType,
        bank_account: BankAccount,
    ) -> Result<Self, BankError> {
        Self::validate(amount)?;

        let parsed_date = NaiveDate::parse_from_str(&transfer_date, "%Y-%m-%d")
            .map_err(|_| BankError::InvalidTransferDateFormat)?;

        Ok(Self {
            id,
            transfer_date: parsed_date,
            amount,
            transfer_type,
            bank_account,
        })
    }

    /// Restores a BankEntry from database storage (no validation).
    /// Data from storage is already validated.
    pub fn restore(
        id: String,
        transfer_date: String,
        amount: i64,
        transfer_type: BankEntryType,
        bank_account: BankAccount,
    ) -> Self {
        let parsed_date =
            NaiveDate::parse_from_str(&transfer_date, "%Y-%m-%d").unwrap_or(NaiveDate::MIN);

        Self {
            id,
            transfer_date: parsed_date,
            amount,
            transfer_type,
            bank_account,
        }
    }

    /// What a bank entry form sent, as the domain reads it (BSM-020,
    /// BSM-030): the date parsed, or every refused field at once. The account
    /// is judged only when the form asks for one (`Some`): a creation other
    /// than cash (R13).
    pub fn read_form(
        bank_account_id: Option<&str>,
        transfer_date: &str,
        selected_count: usize,
    ) -> Result<NaiveDate, BankError> {
        let mut reasons = Vec::new();
        if bank_account_id.is_some_and(|id| id.trim().is_empty()) {
            reasons.push(BankEntryInvalidReason::AccountMissing);
        }
        let date = transfer_date.trim();
        let parsed = NaiveDate::parse_from_str(date, "%Y-%m-%d").ok();
        if date.is_empty() {
            reasons.push(BankEntryInvalidReason::DateMissing);
        } else if parsed.is_none() {
            reasons.push(BankEntryInvalidReason::DateInvalid);
        }
        if selected_count == 0 {
            reasons.push(BankEntryInvalidReason::NothingSelected);
        }
        match parsed {
            Some(date) if reasons.is_empty() => Ok(date),
            _ => Err(BankError::BankEntryInvalid { reasons }),
        }
    }

    /// Validates bank transfer fields.
    fn validate(amount: i64) -> Result<(), BankError> {
        if amount <= 0 {
            return Err(BankError::AmountNotPositive);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_account() -> BankAccount {
        BankAccount::restore(
            "account-id-123".to_string(),
            "Main Account".to_string(),
            None,
        )
    }

    #[test]
    fn test_bank_transfer_creation() {
        let transfer = BankEntry::new(
            "2026-02-15".to_string(),
            1500500,
            BankEntryType::FundWire,
            make_account(),
        )
        .expect("BankEntry creation failed");

        assert_eq!(transfer.amount, 1500500);
        assert_eq!(transfer.transfer_type, BankEntryType::FundWire);
        assert!(!transfer.id.is_empty());
    }

    #[test]
    fn test_bank_transfer_zero_amount_rejected() {
        let result = BankEntry::new(
            "2026-02-15".to_string(),
            0,
            BankEntryType::FundWire,
            make_account(),
        );
        assert!(matches!(result, Err(BankError::AmountNotPositive)));
    }

    #[test]
    fn test_bank_transfer_negative_amount_rejected() {
        let result = BankEntry::new(
            "2026-02-15".to_string(),
            -100,
            BankEntryType::PatientCheck,
            make_account(),
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_bank_transfer_type_serialization() {
        assert_eq!(
            serde_json::to_string(&BankEntryType::PatientCheck).unwrap(),
            r#""PATIENT_CHECK""#
        );
        assert_eq!(
            serde_json::to_string(&BankEntryType::PatientCreditCard).unwrap(),
            r#""PATIENT_CREDIT_CARD""#
        );
        assert_eq!(
            serde_json::to_string(&BankEntryType::PatientCash).unwrap(),
            r#""PATIENT_CASH""#
        );
        assert_eq!(
            serde_json::to_string(&BankEntryType::FundWire).unwrap(),
            r#""FUND_WIRE""#
        );
    }

    // --- BankEntry::read_form (BSM-020, BSM-030) ---

    fn reasons(result: Result<NaiveDate, BankError>) -> Vec<BankEntryInvalidReason> {
        match result {
            Err(BankError::BankEntryInvalid { reasons }) => reasons,
            other => panic!("expected BankEntryInvalid, got {other:?}"),
        }
    }

    #[test]
    fn test_bsm_020_read_form_refuses_every_missing_field_at_once() {
        assert_eq!(
            reasons(BankEntry::read_form(Some(""), "", 0)),
            vec![
                BankEntryInvalidReason::AccountMissing,
                BankEntryInvalidReason::DateMissing,
                BankEntryInvalidReason::NothingSelected,
            ]
        );
    }

    #[test]
    fn test_bsm_020_read_form_counts_a_blank_date_and_account_as_missing() {
        assert_eq!(
            reasons(BankEntry::read_form(Some("  "), "  ", 1)),
            vec![
                BankEntryInvalidReason::AccountMissing,
                BankEntryInvalidReason::DateMissing,
            ]
        );
    }

    #[test]
    fn test_bsm_020_read_form_refuses_a_malformed_date() {
        assert_eq!(
            reasons(BankEntry::read_form(Some("acc-1"), "15/03/2026", 1)),
            vec![BankEntryInvalidReason::DateInvalid]
        );
    }

    #[test]
    fn test_bsm_030_read_form_without_an_account_judges_date_and_selection_only() {
        assert_eq!(
            reasons(BankEntry::read_form(None, "", 0)),
            vec![
                BankEntryInvalidReason::DateMissing,
                BankEntryInvalidReason::NothingSelected,
            ]
        );
    }

    #[test]
    fn test_bsm_020_read_form_returns_the_parsed_date() {
        let date = BankEntry::read_form(Some("acc-1"), " 2026-03-15 ", 2)
            .expect("every field is filled in");
        assert_eq!(
            date,
            NaiveDate::from_ymd_opt(2026, 3, 15).expect("a valid date")
        );
    }

    #[test]
    fn test_is_patient_payment_holds_for_check_card_and_cash_only() {
        for (ty, expected) in [
            (BankEntryType::FundWire, false),
            (BankEntryType::PatientCheck, true),
            (BankEntryType::PatientCreditCard, true),
            (BankEntryType::PatientCash, true),
            (BankEntryType::FundOutgoingWire, false),
        ] {
            assert_eq!(ty.is_patient_payment(), expected, "{ty:?}");
        }
    }

    #[test]
    fn test_ensure_not_refund_only_variant_accepts_every_non_refund_variant() {
        for ty in [
            BankEntryType::FundWire,
            BankEntryType::PatientCheck,
            BankEntryType::PatientCreditCard,
            BankEntryType::PatientCash,
        ] {
            assert!(
                ty.ensure_not_refund_only_variant().is_ok(),
                "{:?} must be accepted (non-refund variant)",
                ty
            );
        }
    }

    #[test]
    fn test_ensure_not_refund_only_variant_rejects_fund_outgoing_wire_with_ref_080() {
        let result = BankEntryType::FundOutgoingWire.ensure_not_refund_only_variant();
        assert!(matches!(result, Err(BankError::RefundOnlyVariantRejected)));
    }

    #[test]
    fn test_with_id_preserves_id() {
        let transfer = BankEntry::with_id(
            "fixed-id".to_string(),
            "2026-03-01".to_string(),
            500,
            BankEntryType::PatientCash,
            make_account(),
        )
        .unwrap();
        assert_eq!(transfer.id, "fixed-id");
    }

    #[test]
    fn test_restore_uses_min_date_on_invalid() {
        let transfer = BankEntry::restore(
            "id".to_string(),
            "not-a-date".to_string(),
            1000,
            BankEntryType::FundWire,
            make_account(),
        );
        assert_eq!(transfer.transfer_date, NaiveDate::MIN);
    }
}

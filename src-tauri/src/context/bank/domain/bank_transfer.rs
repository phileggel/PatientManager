use anyhow::Result;
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use specta::Type;
use uuid::Uuid;

use super::bank_account::BankAccount;

/// Payment type for bank transfers
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BankTransferType {
    #[default]
    Fund,
    Check,
    CreditCard,
    Cash,
}

/// BankTransfer aggregate root
/// Represents a bank transfer (FUND) or direct payment (CHECK/CREDIT_CARD/CASH).
/// Links to fund payment groups or procedures are stored in junction tables.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct BankTransfer {
    pub id: String,
    #[serde(serialize_with = "serialize_date")]
    #[specta(type = String)]
    pub transfer_date: NaiveDate,
    pub amount: i64,
    pub transfer_type: BankTransferType,
    pub bank_account: BankAccount,
}

/// Serialize NaiveDate as ISO format string for serde
fn serialize_date<S>(date: &NaiveDate, serializer: S) -> std::result::Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_str(&date.format("%Y-%m-%d").to_string())
}

impl BankTransfer {
    /// Creates a new BankTransfer with validation and generates ID.
    pub fn new(
        transfer_date: String,
        amount: i64,
        transfer_type: BankTransferType,
        bank_account: BankAccount,
    ) -> Result<Self> {
        Self::validate(amount)?;

        let parsed_date = NaiveDate::parse_from_str(&transfer_date, "%Y-%m-%d").map_err(|_| {
            anyhow::anyhow!(
                "Invalid transfer date format: {} (expected YYYY-MM-DD)",
                transfer_date
            )
        })?;

        Ok(Self {
            id: Uuid::new_v4().to_string(),
            transfer_date: parsed_date,
            amount,
            transfer_type,
            bank_account,
        })
    }

    /// Creates a BankTransfer with an existing ID and validation.
    /// Does NOT generate a new ID.
    pub fn with_id(
        id: String,
        transfer_date: String,
        amount: i64,
        transfer_type: BankTransferType,
        bank_account: BankAccount,
    ) -> Result<Self> {
        Self::validate(amount)?;

        let parsed_date = NaiveDate::parse_from_str(&transfer_date, "%Y-%m-%d").map_err(|_| {
            anyhow::anyhow!(
                "Invalid transfer date format: {} (expected YYYY-MM-DD)",
                transfer_date
            )
        })?;

        Ok(Self {
            id,
            transfer_date: parsed_date,
            amount,
            transfer_type,
            bank_account,
        })
    }

    /// Restores a BankTransfer from database storage (no validation).
    /// Data from storage is already validated.
    pub fn restore(
        id: String,
        transfer_date: String,
        amount: i64,
        transfer_type: BankTransferType,
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

    /// Validates bank transfer fields.
    fn validate(amount: i64) -> Result<()> {
        if amount <= 0 {
            anyhow::bail!("Amount must be greater than 0 (received: {})", amount);
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
        let transfer = BankTransfer::new(
            "2026-02-15".to_string(),
            1500500,
            BankTransferType::Fund,
            make_account(),
        )
        .expect("BankTransfer creation failed");

        assert_eq!(transfer.amount, 1500500);
        assert_eq!(transfer.transfer_type, BankTransferType::Fund);
        assert!(!transfer.id.is_empty());
    }

    #[test]
    fn test_bank_transfer_zero_amount_rejected() {
        let result = BankTransfer::new(
            "2026-02-15".to_string(),
            0,
            BankTransferType::Fund,
            make_account(),
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("greater than 0"));
    }

    #[test]
    fn test_bank_transfer_negative_amount_rejected() {
        let result = BankTransfer::new(
            "2026-02-15".to_string(),
            -100,
            BankTransferType::Check,
            make_account(),
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_bank_transfer_type_serialization() {
        assert_eq!(
            serde_json::to_string(&BankTransferType::Check).unwrap(),
            r#""CHECK""#
        );
        assert_eq!(
            serde_json::to_string(&BankTransferType::CreditCard).unwrap(),
            r#""CREDIT_CARD""#
        );
        assert_eq!(
            serde_json::to_string(&BankTransferType::Cash).unwrap(),
            r#""CASH""#
        );
        assert_eq!(
            serde_json::to_string(&BankTransferType::Fund).unwrap(),
            r#""FUND""#
        );
    }

    #[test]
    fn test_with_id_preserves_id() {
        let transfer = BankTransfer::with_id(
            "fixed-id".to_string(),
            "2026-03-01".to_string(),
            500,
            BankTransferType::Cash,
            make_account(),
        )
        .unwrap();
        assert_eq!(transfer.id, "fixed-id");
    }

    #[test]
    fn test_restore_uses_min_date_on_invalid() {
        let transfer = BankTransfer::restore(
            "id".to_string(),
            "not-a-date".to_string(),
            1000,
            BankTransferType::Fund,
            make_account(),
        );
        assert_eq!(transfer.transfer_date, NaiveDate::MIN);
    }
}

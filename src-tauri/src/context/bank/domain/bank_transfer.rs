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
}

/// BankTransfer aggregate root
/// Represents a payment transaction that will later be reconciled with procedures/funds
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct BankTransfer {
    pub id: String,
    #[serde(serialize_with = "serialize_date")]
    #[specta(type = String)]
    pub transfer_date: NaiveDate,
    pub amount: i64,
    pub transfer_type: BankTransferType,
    pub bank_account: BankAccount, // Complete bank account information
    pub source: String,            // String with prefix like "fund_12345" or "patient_67890"
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
        source: String,
    ) -> Result<Self> {
        Self::validate(&transfer_date, amount, &source)?;

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
            source,
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
        source: String,
    ) -> Result<Self> {
        Self::validate(&transfer_date, amount, &source)?;

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
            source,
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
        source: String,
    ) -> Self {
        let parsed_date =
            NaiveDate::parse_from_str(&transfer_date, "%Y-%m-%d").unwrap_or(NaiveDate::MIN);

        Self {
            id,
            transfer_date: parsed_date,
            amount,
            transfer_type,
            bank_account,
            source,
        }
    }

    /// Validates bank transfer fields.
    fn validate(_transfer_date: &str, amount: i64, source: &str) -> Result<()> {
        if amount <= 0 {
            anyhow::bail!("Amount must be greater than 0 (received: {})", amount);
        }
        if source.trim().is_empty() {
            anyhow::bail!("Source cannot be empty");
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bank_transfer_creation() {
        let account = BankAccount::restore(
            "account-id-123".to_string(),
            "Main Account".to_string(),
            None,
        );
        let transfer = BankTransfer::new(
            "2026-02-15".to_string(),
            1500500,
            BankTransferType::Fund,
            account,
            "fund_12345".to_string(),
        )
        .expect("BankTransfer creation failed");

        assert_eq!(transfer.amount, 1500500);
        assert_eq!(transfer.transfer_type, BankTransferType::Fund);
    }

    #[test]
    fn test_bank_transfer_type_serialization() {
        let transfer_type = BankTransferType::Check;
        let json = serde_json::to_string(&transfer_type).expect("should serialize");
        assert_eq!(json, r#""CHECK""#);
    }
}

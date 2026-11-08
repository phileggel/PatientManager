use serde::{Deserialize, Serialize};
use specta::Type;
use uuid::Uuid;

use crate::context::bank::error::BankError;

/// BAC-050 — the technical accounts a direct payment of each type is recorded on,
/// seeded by migration.
pub const CASH_ACCOUNT_ID: &str = "cash-account-default";
pub const CHECK_ACCOUNT_ID: &str = "check-account-default";
pub const CARD_ACCOUNT_ID: &str = "card-account-default";

/// BAC-050 — what an account is: one of the user's bank accounts, or the technical
/// account of a direct payment type, never shown or chosen.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum BankAccountType {
    #[default]
    Bank,
    Cash,
    Check,
    Card,
}

impl BankAccountType {
    pub fn as_db_str(self) -> &'static str {
        match self {
            Self::Bank => "bank",
            Self::Cash => "cash",
            Self::Check => "check",
            Self::Card => "card",
        }
    }

    pub fn from_db_str(value: &str) -> Option<Self> {
        match value {
            "bank" => Some(Self::Bank),
            "cash" => Some(Self::Cash),
            "check" => Some(Self::Check),
            "card" => Some(Self::Card),
            _ => None,
        }
    }
}

/// Bank Account aggregate root
/// Represents a bank account used for transfers
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields)]
pub struct BankAccount {
    pub name: String,
    pub iban: Option<String>,

    /// Metadata - not a domain property
    pub id: String,

    /// BAC-050 — never sent: a client only ever sees `bank` accounts.
    #[serde(skip)]
    pub account_type: BankAccountType,
}

impl BankAccount {
    /// Normalizes a raw IBAN: trims whitespace, removes inner spaces, and
    /// returns `None` for empty results. Single source of truth for IBAN
    /// canonicalization — used by both factory methods and by the service-layer
    /// uniqueness guard (BAC-014) so all paths compare the same form.
    pub fn normalize_iban(raw: Option<&str>) -> Option<String> {
        raw.map(|i| i.trim().replace(' ', ""))
            .filter(|i| !i.is_empty())
    }

    /// Creates a new BankAccount with validation and generates ID.
    pub fn new(name: String, iban: Option<String>) -> Result<Self, BankError> {
        let trimmed_name = name.trim().to_string();
        let trimmed_iban = Self::normalize_iban(iban.as_deref());
        Self::validate(&trimmed_name)?;

        Ok(Self {
            id: Uuid::new_v4().to_string(),
            name: trimmed_name,
            iban: trimmed_iban,
            account_type: BankAccountType::Bank,
        })
    }

    /// Creates a BankAccount with an existing ID and validation.
    /// Does NOT generate a new ID.
    pub fn with_id(id: String, name: String, iban: Option<String>) -> Result<Self, BankError> {
        let trimmed_name = name.trim().to_string();
        let trimmed_iban = Self::normalize_iban(iban.as_deref());
        Self::validate(&trimmed_name)?;

        Ok(Self {
            id,
            name: trimmed_name,
            iban: trimmed_iban,
            account_type: BankAccountType::Bank,
        })
    }

    /// Restores a BankAccount from database storage (no validation).
    /// Data from storage is already validated.
    pub fn restore(id: String, name: String, iban: Option<String>) -> Self {
        Self::restore_of_type(id, name, iban, BankAccountType::Bank)
    }

    /// Restores an account of a stored type (BAC-050).
    pub fn restore_of_type(
        id: String,
        name: String,
        iban: Option<String>,
        account_type: BankAccountType,
    ) -> Self {
        Self {
            id,
            name,
            iban,
            account_type,
        }
    }

    /// BAC-050 — one of the user's accounts, not a technical one.
    pub fn is_bank(&self) -> bool {
        self.account_type == BankAccountType::Bank
    }

    /// BAC-051 — a technical account is never edited or deleted.
    pub fn ensure_editable(&self) -> Result<(), BankError> {
        if self.is_bank() {
            Ok(())
        } else {
            Err(BankError::ProtectedTechnicalAccount)
        }
    }

    /// Validates bank account fields.
    fn validate(name: &str) -> Result<(), BankError> {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err(BankError::BankAccountNameEmpty);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bank_account_creation() {
        let account = BankAccount::new("Main Account".to_string(), None).unwrap();
        assert_eq!(account.name, "Main Account");
        assert!(account.iban.is_none());
        assert!(!account.id.is_empty());
    }

    #[test]
    fn test_bank_account_with_iban() {
        let account = BankAccount::new(
            "Main Account".to_string(),
            Some("FR76 0000 0000 0000 0000 0000 000".to_string()),
        )
        .unwrap();
        assert_eq!(account.iban.as_deref(), Some("FR7600000000000000000000000"));
    }

    #[test]
    fn test_bank_account_empty_name() {
        let result = BankAccount::new("".to_string(), None);
        assert!(result.is_err());
    }

    #[test]
    fn test_bank_account_whitespace_only() {
        let result = BankAccount::new("   ".to_string(), None);
        assert!(result.is_err());
    }

    #[test]
    fn test_bank_account_empty_iban_becomes_none() {
        let account = BankAccount::new("Test".to_string(), Some("  ".to_string())).unwrap();
        assert!(account.iban.is_none());
    }
}

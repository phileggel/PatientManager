use anyhow::Result;
use serde::{Deserialize, Serialize};
use specta::Type;
use uuid::Uuid;

/// Bank Account aggregate root
/// Represents a bank account used for transfers
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct BankAccount {
    pub name: String,
    pub iban: Option<String>,

    /// Metadata - not a domain property
    pub id: String,
}

impl BankAccount {
    /// Creates a new BankAccount with validation and generates ID.
    pub fn new(name: String, iban: Option<String>) -> Result<Self> {
        let trimmed_name = name.trim().to_string();
        let trimmed_iban = iban
            .map(|i| i.trim().replace(' ', ""))
            .filter(|i| !i.is_empty());
        Self::validate(&trimmed_name)?;

        Ok(Self {
            id: Uuid::new_v4().to_string(),
            name: trimmed_name,
            iban: trimmed_iban,
        })
    }

    /// Creates a BankAccount with an existing ID and validation.
    /// Does NOT generate a new ID.
    pub fn with_id(id: String, name: String, iban: Option<String>) -> Result<Self> {
        let trimmed_name = name.trim().to_string();
        let trimmed_iban = iban
            .map(|i| i.trim().replace(' ', ""))
            .filter(|i| !i.is_empty());
        Self::validate(&trimmed_name)?;

        Ok(Self {
            id,
            name: trimmed_name,
            iban: trimmed_iban,
        })
    }

    /// Restores a BankAccount from database storage (no validation).
    /// Data from storage is already validated.
    pub fn restore(id: String, name: String, iban: Option<String>) -> Self {
        Self { id, name, iban }
    }

    /// Validates bank account fields.
    fn validate(name: &str) -> Result<()> {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            anyhow::bail!("Bank account name cannot be empty");
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

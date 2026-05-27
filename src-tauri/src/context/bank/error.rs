use serde::Serialize;
use specta::Type;
use thiserror::Error;

/// Errors raised by the Bank bounded context.
///
/// Wire shape: each variant serializes as `{ "code": "<VariantName>", ... }`
/// (struct fields when present). The frontend narrows on `code` per F27.
#[derive(Debug, Clone, Error, Serialize, Type)]
#[serde(tag = "code")]
pub enum BankError {
    // --- BankAccount aggregate domain invariants ---
    /// `BankAccount::validate` rejected an empty name.
    #[error("Bank account name cannot be empty")]
    BankAccountNameEmpty,

    // --- BankEntry aggregate domain invariants ---
    /// `BankEntryType::ensure_not_refund_only_variant` rejected the
    /// `FundOutgoingWire` variant (REF-080: refund-only path).
    #[error("OutgoingWire transfers can only be created via the overpayment refund flow")]
    RefundOnlyVariantRejected,

    /// `BankEntry::validate` rejected an amount ≤ 0.
    #[error("Amount must be greater than 0")]
    AmountNotPositive,

    /// `BankEntry::new` / `with_id` rejected a transfer_date that does not
    /// parse as `YYYY-MM-DD`.
    #[error("Invalid transfer date format (expected YYYY-MM-DD)")]
    InvalidTransferDateFormat,

    // --- BankAccount service-layer errors ---
    /// `BankAccountService::create_account` / `update_account` enforced
    /// IBAN uniqueness (R5) — another row already holds the IBAN.
    #[error("IBAN already used by another bank account")]
    IbanAlreadyUsed,

    /// `BankAccountService::read_account` / `update_account` lookup returned
    /// no row.
    #[error("Bank account not found: {bank_account_id}")]
    BankAccountNotFound { bank_account_id: String },

    /// `BankAccountService::update_account` / `delete_account` rejected
    /// mutation of the protected cash account.
    #[error("The cash account is protected and cannot be modified or deleted")]
    ProtectedCashAccount,

    // --- BankEntry service-layer errors ---
    /// `BankEntryService::update_transfer` lookup returned no row.
    #[error("Bank transfer not found: {bank_transfer_id}")]
    TransferNotFound { bank_transfer_id: String },

    // --- Infra catch-all ---
    /// Repository / sqlx-level failure. Underlying error is logged at the
    /// call site via `tracing::error!`; the wire surface carries no detail.
    #[error("An unexpected database error occurred")]
    DatabaseError,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, to_value};

    #[test]
    fn each_variant_emits_a_code() {
        assert_eq!(
            to_value(BankError::BankAccountNameEmpty).unwrap(),
            json!({ "code": "BankAccountNameEmpty" }),
        );
        assert_eq!(
            to_value(BankError::RefundOnlyVariantRejected).unwrap(),
            json!({ "code": "RefundOnlyVariantRejected" }),
        );
        assert_eq!(
            to_value(BankError::AmountNotPositive).unwrap(),
            json!({ "code": "AmountNotPositive" }),
        );
        assert_eq!(
            to_value(BankError::InvalidTransferDateFormat).unwrap(),
            json!({ "code": "InvalidTransferDateFormat" }),
        );
        assert_eq!(
            to_value(BankError::IbanAlreadyUsed).unwrap(),
            json!({ "code": "IbanAlreadyUsed" }),
        );
        assert_eq!(
            to_value(BankError::BankAccountNotFound {
                bank_account_id: "ba-42".into(),
            })
            .unwrap(),
            json!({ "code": "BankAccountNotFound", "bank_account_id": "ba-42" }),
        );
        assert_eq!(
            to_value(BankError::ProtectedCashAccount).unwrap(),
            json!({ "code": "ProtectedCashAccount" }),
        );
        assert_eq!(
            to_value(BankError::TransferNotFound {
                bank_transfer_id: "bt-42".into(),
            })
            .unwrap(),
            json!({ "code": "TransferNotFound", "bank_transfer_id": "bt-42" }),
        );
        assert_eq!(
            to_value(BankError::DatabaseError).unwrap(),
            json!({ "code": "DatabaseError" }),
        );
    }
}

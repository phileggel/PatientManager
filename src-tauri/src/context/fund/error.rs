use serde::Serialize;
use specta::Type;
use thiserror::Error;

/// Errors raised by the Fund bounded context.
///
/// Wire shape: each variant serializes as `{ "code": "<VariantName>", ... }`
/// (struct fields when present). The frontend narrows on `code` per F27.
#[derive(Debug, Clone, Error, Serialize, Type)]
#[serde(tag = "code")]
pub enum FundError {
    // --- Fund aggregate domain invariants ---
    /// `Fund::validate` rejected an empty fund identifier.
    #[error("Fund identifier cannot be empty")]
    FundIdentifierEmpty,

    /// `Fund::validate` rejected an empty fund name.
    #[error("Fund name cannot be empty")]
    FundNameEmpty,

    // --- FundPaymentGroup aggregate domain invariants ---
    /// `FundPaymentGroup::validate` rejected an empty fund_id.
    #[error("Fund ID cannot be empty")]
    FundIdEmpty,

    /// `FundPaymentGroup::validate` rejected a non-positive total amount.
    #[error("Total amount must be greater than 0")]
    TotalAmountNotPositive,

    /// `FundPaymentGroup::new` / `with_id` / service update path rejected
    /// a payment date that does not parse as `YYYY-MM-DD`.
    #[error("Invalid payment date format (expected YYYY-MM-DD)")]
    InvalidPaymentDateFormat,

    // --- FundPaymentLine aggregate domain invariants ---
    /// `FundPaymentLine::validate` rejected an empty fund_payment_group_id.
    #[error("Fund payment group ID cannot be empty")]
    FundPaymentGroupIdEmpty,

    /// `FundPaymentLine::validate` rejected an empty procedure_id.
    #[error("Procedure ID cannot be empty")]
    LineProcedureIdEmpty,

    // --- Service-layer lookup errors ---
    /// `FundPaymentGroupService` update-by-id lookup returned no row.
    #[error("Fund payment group not found: {fund_payment_group_id}")]
    PaymentGroupNotFound { fund_payment_group_id: String },

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
            to_value(FundError::FundIdentifierEmpty).unwrap(),
            json!({ "code": "FundIdentifierEmpty" }),
        );
        assert_eq!(
            to_value(FundError::FundNameEmpty).unwrap(),
            json!({ "code": "FundNameEmpty" }),
        );
        assert_eq!(
            to_value(FundError::FundIdEmpty).unwrap(),
            json!({ "code": "FundIdEmpty" }),
        );
        assert_eq!(
            to_value(FundError::TotalAmountNotPositive).unwrap(),
            json!({ "code": "TotalAmountNotPositive" }),
        );
        assert_eq!(
            to_value(FundError::InvalidPaymentDateFormat).unwrap(),
            json!({ "code": "InvalidPaymentDateFormat" }),
        );
        assert_eq!(
            to_value(FundError::FundPaymentGroupIdEmpty).unwrap(),
            json!({ "code": "FundPaymentGroupIdEmpty" }),
        );
        assert_eq!(
            to_value(FundError::LineProcedureIdEmpty).unwrap(),
            json!({ "code": "LineProcedureIdEmpty" }),
        );
        assert_eq!(
            to_value(FundError::PaymentGroupNotFound {
                fund_payment_group_id: "fpg-42".into(),
            })
            .unwrap(),
            json!({ "code": "PaymentGroupNotFound", "fund_payment_group_id": "fpg-42" }),
        );
        assert_eq!(
            to_value(FundError::DatabaseError).unwrap(),
            json!({ "code": "DatabaseError" }),
        );
    }
}

use serde::Serialize;
use specta::Type;
use thiserror::Error;

/// Errors raised by the Procedure bounded context.
///
/// Wire shape: each variant serializes as `{ "code": "<VariantName>", ... }`
/// (struct fields when present). The frontend narrows on `code` per F27.
///
/// Scope note (PR 1 of typed-error migration): the variants listed here cover
/// every error path the BC's domain + service layer can currently produce.
/// The `Procedure` aggregate's CRUD commands are not wired through this BC's
/// api.rs (they live in `use_cases/procedure_orchestration/api.rs` and become
/// wire-typed in PR 3 of the migration). The corresponding variants
/// (`PatientIdEmpty`, `ProcedureTypeIdEmpty`, `Refund*`) are reachable through
/// `Procedure::new` / `ProcedureRefund::new`, called from those use cases.
#[derive(Debug, Clone, Error, Serialize, Type)]
#[serde(tag = "code")]
pub enum ProcedureError {
    // --- Procedure aggregate domain invariants ---
    /// `Procedure::validate` rejected an empty patient ID.
    #[error("Patient ID cannot be empty")]
    PatientIdEmpty,

    /// `Procedure::validate` rejected an empty procedure type ID.
    #[error("Procedure type ID cannot be empty")]
    ProcedureTypeIdEmpty,

    // --- Procedure service-layer errors ---
    /// A `Procedure` lookup by id returned no row (e.g. the delete guard in
    /// `ProcedureOrchestrationService` reading the target before deletion).
    #[error("Procedure not found: {procedure_id}")]
    ProcedureNotFound { procedure_id: String },

    // --- ProcedureType aggregate domain invariants ---
    /// `ProcedureType::validate_fields` rejected an empty/whitespace name.
    #[error("Procedure type name cannot be empty")]
    ProcedureTypeNameEmpty,

    /// `ProcedureType::validate_fields` rejected a negative default amount.
    #[error("Default amount cannot be negative")]
    DefaultAmountNegative,

    // --- ProcedureType service-layer errors ---
    /// `ProcedureTypeService` lookup by id returned no row.
    #[error("Procedure type not found: {procedure_type_id}")]
    ProcedureTypeNotFound { procedure_type_id: String },

    /// `ProcedureTypeService` add/update rejected because another row already
    /// uses the same name.
    #[error("A procedure type with this name already exists")]
    ProcedureTypeNameDuplicate,

    /// `ProcedureTypeService` rejected mutation of the reserved `import-pdf`
    /// procedure type.
    #[error("The reserved import-pdf type cannot be modified")]
    ReservedTypeNotMutable,

    // --- ProcedureRefund aggregate domain invariants (REF-040) ---
    /// `ProcedureRefund::validate` rejected a reason exceeding the 255-char cap.
    #[error("Refund reason must not exceed 255 characters")]
    RefundReasonTooLong,

    /// `ProcedureRefund::new` rejected a refund date that does not parse as
    /// `YYYY-MM-DD`.
    #[error("Invalid refund date format (expected YYYY-MM-DD)")]
    InvalidRefundDateFormat,

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
            to_value(ProcedureError::PatientIdEmpty).unwrap(),
            json!({ "code": "PatientIdEmpty" }),
        );
        assert_eq!(
            to_value(ProcedureError::ProcedureTypeIdEmpty).unwrap(),
            json!({ "code": "ProcedureTypeIdEmpty" }),
        );
        assert_eq!(
            to_value(ProcedureError::ProcedureNotFound {
                procedure_id: "proc-7".into(),
            })
            .unwrap(),
            json!({ "code": "ProcedureNotFound", "procedure_id": "proc-7" }),
        );
        assert_eq!(
            to_value(ProcedureError::ProcedureTypeNameEmpty).unwrap(),
            json!({ "code": "ProcedureTypeNameEmpty" }),
        );
        assert_eq!(
            to_value(ProcedureError::DefaultAmountNegative).unwrap(),
            json!({ "code": "DefaultAmountNegative" }),
        );
        assert_eq!(
            to_value(ProcedureError::ProcedureTypeNotFound {
                procedure_type_id: "pt-42".into(),
            })
            .unwrap(),
            json!({ "code": "ProcedureTypeNotFound", "procedure_type_id": "pt-42" }),
        );
        assert_eq!(
            to_value(ProcedureError::ProcedureTypeNameDuplicate).unwrap(),
            json!({ "code": "ProcedureTypeNameDuplicate" }),
        );
        assert_eq!(
            to_value(ProcedureError::ReservedTypeNotMutable).unwrap(),
            json!({ "code": "ReservedTypeNotMutable" }),
        );
        assert_eq!(
            to_value(ProcedureError::RefundReasonTooLong).unwrap(),
            json!({ "code": "RefundReasonTooLong" }),
        );
        assert_eq!(
            to_value(ProcedureError::InvalidRefundDateFormat).unwrap(),
            json!({ "code": "InvalidRefundDateFormat" }),
        );
        assert_eq!(
            to_value(ProcedureError::DatabaseError).unwrap(),
            json!({ "code": "DatabaseError" }),
        );
    }
}

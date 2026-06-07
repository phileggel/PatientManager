use serde::Serialize;
use specta::Type;
use thiserror::Error;

use crate::context::fund::FundError;
use crate::context::patient::PatientError;
use crate::context::procedure::ProcedureError;

/// Use-case-specific guards and catch-alls for fund-payment reconciliation.
///
/// Codes that do NOT belong to any single bounded context: the duplicate-batch
/// guards, the "nothing to process" guards, the wire date-range parse, the PDF
/// path-validation / extraction failures, and the catch-all for failures from
/// repositories the reconciliation service holds directly. Tagged with `code`
/// so each variant emits `{ "code": "..." }`.
#[derive(Debug, Clone, Error, Serialize, Type)]
#[serde(tag = "code")]
pub enum FundPaymentReconciliationTask {
    /// Every candidate in the batch already exists as a fund-payment group —
    /// the PDF was almost certainly already imported.
    #[error("All {count} payment groups already exist")]
    AllDuplicates { count: usize },

    /// No non-duplicate candidate remained to process.
    #[error("No valid candidates to process")]
    NoValidCandidates,

    /// No non-duplicate candidate remained after applying auto-corrections.
    #[error("No valid candidates to process after applying corrections")]
    NoValidCandidatesAfterCorrections,

    /// A wire date (`start_date` / `end_date`) did not parse as `YYYY-MM-DD`.
    #[error("Invalid date range (expected YYYY-MM-DD)")]
    InvalidDateRange,

    /// The supplied PDF path was rejected by the path validator.
    #[error("PDF path rejected")]
    PdfPathRejected,

    /// Text extraction from the PDF failed.
    #[error("Failed to extract text from PDF")]
    PdfExtractionFailed,

    /// Failure from a repository the reconciliation service holds directly.
    /// Logged at the call site via `tracing::error!`; the wire surface carries
    /// no detail.
    #[error("An unexpected database error occurred")]
    DatabaseError,
}

/// Composite error for the fund-payment-reconciliation use case.
///
/// Holds ONLY `#[from]` wrappers — the three bounded-context enums it
/// orchestrates plus the use-case task sub-enum. Each carries its own
/// `#[serde(tag = "code")]`, so the untagged composite flattens to a single
/// `{ "code": "...", ... }` payload on the wire.
///
/// Multiple arms can emit `{ "code": "DatabaseError" }` (each BC enum + the
/// Task sub-enum); the collision is intentional — the frontend maps the single
/// code to one message. See `procedure_orchestration/error.rs` for the same
/// precedent.
#[derive(Debug, Error, Serialize, Type)]
#[serde(untagged)]
pub enum FundPaymentReconciliationError {
    #[error(transparent)]
    Fund(#[from] FundError),

    #[error(transparent)]
    Patient(#[from] PatientError),

    #[error(transparent)]
    Procedure(#[from] ProcedureError),

    #[error(transparent)]
    Task(#[from] FundPaymentReconciliationTask),
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, to_value};

    #[test]
    fn each_variant_emits_a_code() {
        // Task variant with a payload.
        let dup: FundPaymentReconciliationError =
            FundPaymentReconciliationTask::AllDuplicates { count: 3 }.into();
        assert_eq!(
            to_value(&dup).unwrap(),
            json!({ "code": "AllDuplicates", "count": 3 }),
        );

        // Task unit variants must still emit their code (never null).
        for (err, code) in [
            (
                FundPaymentReconciliationTask::NoValidCandidates,
                "NoValidCandidates",
            ),
            (
                FundPaymentReconciliationTask::NoValidCandidatesAfterCorrections,
                "NoValidCandidatesAfterCorrections",
            ),
            (
                FundPaymentReconciliationTask::InvalidDateRange,
                "InvalidDateRange",
            ),
            (
                FundPaymentReconciliationTask::PdfPathRejected,
                "PdfPathRejected",
            ),
            (
                FundPaymentReconciliationTask::PdfExtractionFailed,
                "PdfExtractionFailed",
            ),
            (
                FundPaymentReconciliationTask::DatabaseError,
                "DatabaseError",
            ),
        ] {
            let composite: FundPaymentReconciliationError = err.into();
            assert_eq!(to_value(&composite).unwrap(), json!({ "code": code }));
        }

        // BC-wrapped variants flatten through the untagged composite.
        let fund: FundPaymentReconciliationError = FundError::FundIdEmpty.into();
        assert_eq!(to_value(&fund).unwrap(), json!({ "code": "FundIdEmpty" }));

        let patient: FundPaymentReconciliationError = PatientError::InvalidSsn.into();
        assert_eq!(to_value(&patient).unwrap(), json!({ "code": "InvalidSsn" }));

        let procedure: FundPaymentReconciliationError = ProcedureError::ProcedureNotFound {
            procedure_id: "proc-1".into(),
        }
        .into();
        assert_eq!(
            to_value(&procedure).unwrap(),
            json!({ "code": "ProcedureNotFound", "procedure_id": "proc-1" }),
        );

        // Intentional collision: the Task catch-all and each BC enum all emit
        // the same `{ "code": "DatabaseError" }` on the wire.
        let task_db: FundPaymentReconciliationError =
            FundPaymentReconciliationTask::DatabaseError.into();
        let fund_db: FundPaymentReconciliationError = FundError::DatabaseError.into();
        assert_eq!(to_value(&task_db).unwrap(), to_value(&fund_db).unwrap());
    }
}

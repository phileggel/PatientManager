use serde::Serialize;
use specta::Type;
use thiserror::Error;

use crate::context::procedure::ProcedureError;

/// Use-case-specific guards and catch-alls for procedure orchestration.
///
/// These are codes that do NOT belong to the Procedure bounded context: the
/// orchestrator validates cross-context foreign keys (patient, fund), enforces
/// a delete guard, parses the wire `procedure_date`, and translates failures
/// from the patient / fund / procedure-type / refund repositories it holds
/// directly. Tagged with `code` so each variant emits `{ "code": "..." }`.
#[derive(Debug, Clone, Error, Serialize, Type)]
#[serde(tag = "code")]
pub enum ProcedureOrchestrationTask {
    /// FK validation: the referenced patient does not exist (or is deleted).
    #[error("Patient not found: {patient_id}")]
    PatientNotFound { patient_id: String },

    /// FK validation: the referenced fund does not exist (or is deleted).
    #[error("Fund not found: {fund_id}")]
    FundNotFound { fund_id: String },

    /// Delete guard: the procedure is linked to a fund payment group or bank
    /// transaction (a blocking status) and cannot be deleted directly.
    #[error("Procedure is linked to a payment and cannot be deleted")]
    ProcedureDeleteBlocked,

    /// The wire `procedure_date` did not parse as `YYYY-MM-DD`.
    #[error("Invalid procedure date format (expected YYYY-MM-DD)")]
    InvalidProcedureDate,

    /// Failure from a repository the orchestrator holds directly (patient /
    /// fund / procedure-type / refund). Logged at the call site via
    /// `tracing::error!`; the wire surface carries no detail.
    #[error("An unexpected database error occurred")]
    DatabaseError,
}

/// Composite error for the procedure-orchestration use case.
///
/// Holds ONLY `#[from]` wrappers — the Procedure BC enum and the use-case task
/// sub-enum. Both carry their own `#[serde(tag = "code")]`, so the untagged
/// composite flattens to a single `{ "code": "...", ... }` payload on the wire.
///
/// Both arms emit `{ "code": "DatabaseError" }`; collision intentional — see
/// `docs/techdebt.md`.
#[derive(Debug, Error, Serialize, Type)]
#[serde(untagged)]
pub enum ProcedureOrchestrationError {
    #[error(transparent)]
    Procedure(#[from] ProcedureError),

    #[error(transparent)]
    Task(#[from] ProcedureOrchestrationTask),
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, to_value};

    #[test]
    fn each_variant_emits_a_code() {
        // BC-wrapped variant (via #[from] ProcedureError).
        let not_found: ProcedureOrchestrationError = ProcedureError::ProcedureNotFound {
            procedure_id: "proc-1".into(),
        }
        .into();
        assert_eq!(
            to_value(&not_found).unwrap(),
            json!({ "code": "ProcedureNotFound", "procedure_id": "proc-1" }),
        );

        // Task variants with payloads.
        let patient: ProcedureOrchestrationError = ProcedureOrchestrationTask::PatientNotFound {
            patient_id: "pat-1".into(),
        }
        .into();
        assert_eq!(
            to_value(&patient).unwrap(),
            json!({ "code": "PatientNotFound", "patient_id": "pat-1" }),
        );

        let fund: ProcedureOrchestrationError = ProcedureOrchestrationTask::FundNotFound {
            fund_id: "fund-1".into(),
        }
        .into();
        assert_eq!(
            to_value(&fund).unwrap(),
            json!({ "code": "FundNotFound", "fund_id": "fund-1" }),
        );

        // Task unit variants must still emit their code (never null).
        let blocked: ProcedureOrchestrationError =
            ProcedureOrchestrationTask::ProcedureDeleteBlocked.into();
        assert_eq!(
            to_value(&blocked).unwrap(),
            json!({ "code": "ProcedureDeleteBlocked" }),
        );

        let bad_date: ProcedureOrchestrationError =
            ProcedureOrchestrationTask::InvalidProcedureDate.into();
        assert_eq!(
            to_value(&bad_date).unwrap(),
            json!({ "code": "InvalidProcedureDate" }),
        );

        let db: ProcedureOrchestrationError = ProcedureOrchestrationTask::DatabaseError.into();
        assert_eq!(to_value(&db).unwrap(), json!({ "code": "DatabaseError" }));

        // Intentional collision: BOTH the BC arm and the Task arm serialize to
        // the same `{ "code": "DatabaseError" }` on the wire (see the type doc).
        let bc_db: ProcedureOrchestrationError = ProcedureError::DatabaseError.into();
        assert_eq!(
            to_value(&bc_db).unwrap(),
            json!({ "code": "DatabaseError" })
        );
        assert_eq!(to_value(&bc_db).unwrap(), to_value(&db).unwrap());
    }
}

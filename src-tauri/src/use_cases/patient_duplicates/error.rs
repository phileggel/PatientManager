use serde::Serialize;
use specta::Type;
use thiserror::Error;

use crate::context::patient::PatientError;
use crate::context::procedure::ProcedureError;

/// Guards and catch-all of the patient duplicates use case. Tagged with `code`;
/// no variant carries a payload (B44).
#[derive(Debug, Clone, PartialEq, Error, Serialize, Type)]
#[serde(tag = "code")]
pub enum PatientDuplicatesTask {
    /// PDU-025, PDU-032 — the two identifiers name the same patient.
    #[error("The two patients are the same")]
    SamePatient,

    /// PDU-025, PDU-032 — a patient does not exist or is deleted.
    #[error("A patient of the pair no longer exists")]
    PatientNotFound,

    /// PDU-025 — a patient is anonymous, or the two do not carry the same name.
    #[error("The two patients are not a candidate pair")]
    NotACandidatePair,

    /// PDU-024 — the merge's unit of work failed and wrote nothing; the detail
    /// is logged at the call site.
    #[error("The merge could not be completed")]
    MergeFailed,
}

/// Composite for the patient duplicates use case: the wrappers disappear on
/// the wire and every variant emits `{ "code": "..." }`.
#[derive(Debug, Clone, Error, Serialize, Type)]
#[serde(untagged)]
pub enum PatientDuplicatesError {
    #[error(transparent)]
    Patient(#[from] PatientError),

    #[error(transparent)]
    Procedure(#[from] ProcedureError),

    #[error(transparent)]
    Task(#[from] PatientDuplicatesTask),
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, to_value};

    #[test]
    fn each_variant_emits_a_code() {
        for (task, code) in [
            (PatientDuplicatesTask::SamePatient, "SamePatient"),
            (PatientDuplicatesTask::PatientNotFound, "PatientNotFound"),
            (
                PatientDuplicatesTask::NotACandidatePair,
                "NotACandidatePair",
            ),
            (PatientDuplicatesTask::MergeFailed, "MergeFailed"),
        ] {
            let err: PatientDuplicatesError = task.into();
            assert_eq!(to_value(&err).expect("serialise"), json!({ "code": code }));
        }
    }

    #[test]
    fn the_two_database_errors_serialise_identically() {
        let patient: PatientDuplicatesError = PatientError::DatabaseError.into();
        let procedure: PatientDuplicatesError = ProcedureError::DatabaseError.into();
        assert_eq!(
            to_value(&patient).expect("serialise"),
            json!({ "code": "DatabaseError" })
        );
        assert_eq!(
            to_value(&patient).expect("serialise"),
            to_value(&procedure).expect("serialise")
        );
    }
}

use serde::Serialize;
use specta::Type;
use thiserror::Error;

/// Errors raised by the Patient bounded context.
///
/// Wire shape: each variant serializes as `{ "code": "<VariantName>", ... }`
/// (struct fields when present). The frontend narrows on `code` per F27.
#[derive(Debug, Clone, Error, Serialize, Type)]
#[serde(tag = "code")]
pub enum PatientError {
    /// Non-anonymous patient was constructed with an empty (or whitespace-only) name.
    #[error("Patient name cannot be empty")]
    NameEmpty,

    /// Non-anonymous patient was constructed without a name field.
    #[error("Non-anonymous patient must have a name")]
    NonAnonymousRequiresName,

    /// SSN payload does not match the 13-ASCII-digit format. The SSN value is
    /// intentionally NOT carried as a payload — see § Logging hygiene in
    /// CLAUDE.md (PII must not appear on the wire).
    #[error("SSN must be 13 numeric digits")]
    InvalidSsn,

    /// Infra failure from the repository / sqlx layer. The underlying error
    /// is logged via `tracing::error!` at the call site; the wire surface
    /// carries no detail to avoid leaking implementation specifics.
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
            to_value(PatientError::NameEmpty).unwrap(),
            json!({ "code": "NameEmpty" }),
        );
        assert_eq!(
            to_value(PatientError::NonAnonymousRequiresName).unwrap(),
            json!({ "code": "NonAnonymousRequiresName" }),
        );
        assert_eq!(
            to_value(PatientError::InvalidSsn).unwrap(),
            json!({ "code": "InvalidSsn" }),
        );
        assert_eq!(
            to_value(PatientError::DatabaseError).unwrap(),
            json!({ "code": "DatabaseError" }),
        );
    }

    #[test]
    fn invalid_ssn_carries_no_payload() {
        let v = to_value(PatientError::InvalidSsn).unwrap();
        let obj = v.as_object().expect("should serialize to an object");
        assert_eq!(
            obj.len(),
            1,
            "InvalidSsn must NOT carry the SSN value (PII)"
        );
        assert!(obj.contains_key("code"));
    }
}

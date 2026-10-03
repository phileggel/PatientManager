use serde::Serialize;
use specta::Type;
use thiserror::Error;

/// Typed error for the diagnostic report use case (DGR-015). It orchestrates no
/// bounded context, so it is one flat enum, tagged with `code`. Variants carry
/// no payload: the detail is logged at the failure site and never crosses the
/// wire (it can hold an absolute path).
#[derive(Debug, Clone, PartialEq, Error, Serialize, Type)]
#[serde(tag = "code")]
pub enum DiagnosticReportError {
    /// The user's home directory could not be resolved.
    #[error("Cannot resolve the user home directory")]
    HomeUnresolved,

    /// The destination was rejected by the secure-path validator (DGR-023).
    #[error("The selected path was rejected")]
    PathRejected,

    /// The report could not be written to the destination.
    #[error("Failed to write the diagnostic report")]
    ReportFailed,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, to_value};

    #[test]
    fn each_variant_emits_a_code() {
        for (err, code) in [
            (DiagnosticReportError::HomeUnresolved, "HomeUnresolved"),
            (DiagnosticReportError::PathRejected, "PathRejected"),
            (DiagnosticReportError::ReportFailed, "ReportFailed"),
        ] {
            let value = to_value(&err).expect("serialise");
            assert_eq!(value, json!({ "code": code }));
        }
    }
}

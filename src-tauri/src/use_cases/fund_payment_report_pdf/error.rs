use std::fmt;

use serde::Serialize;
use specta::Type;

/// Errors produced by the `generate_fund_reconciliation_report_pdf` and
/// `export_and_open_fund_reconciliation_report_pdf` commands. This is the
/// FE-facing wire type — each variant serializes as `{ "code": "<Variant>" }`.
///
/// The `detail` strings are diagnostic context (which field failed validation,
/// which font/IO operation broke). They stay server-side for `Display` +
/// `tracing` and the validator's unit tests; `#[serde(skip)]` keeps them off the
/// wire, where they would leak infra detail with no FE value.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(tag = "code")]
pub enum ReportPdfError {
    /// The `ReportGenerationRequest` payload is structurally invalid.
    ///
    /// Triggered when: a required pre-resolved string is empty, exceeds the
    /// length cap, contains control characters, or a collection (header
    /// lines, unreconciled rows, correction groups, correction rows) exceeds
    /// its DoS-guard cap. See `request::validate_safe_string`.
    InvalidRequest {
        #[serde(skip)]
        detail: String,
    },

    /// PDF rendering failed after validation passed — e.g. font load error,
    /// internal printpdf error, or I/O error.
    PdfGenerationFailed {
        #[serde(skip)]
        detail: String,
    },

    /// Writing the rendered PDF bytes to the destination failed (permission
    /// denied, disk full, missing parent directory, etc.).
    WriteFailed {
        #[serde(skip)]
        detail: String,
    },

    /// Launching the system default application for the saved file failed
    /// (no associated app, platform launcher refused, etc.). The file has
    /// already been written when this error is returned.
    OpenFailed {
        #[serde(skip)]
        detail: String,
    },
}

impl fmt::Display for ReportPdfError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ReportPdfError::InvalidRequest { detail } => write!(f, "Invalid request: {}", detail),
            ReportPdfError::PdfGenerationFailed { detail } => {
                write!(f, "PDF generation failed: {}", detail)
            }
            ReportPdfError::WriteFailed { detail } => write!(f, "Failed to save PDF: {}", detail),
            ReportPdfError::OpenFailed { detail } => write!(f, "Failed to open PDF: {}", detail),
        }
    }
}

impl std::error::Error for ReportPdfError {}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, to_value};

    #[test]
    fn invalid_request_displays_message() {
        let err = ReportPdfError::InvalidRequest {
            detail: "empty locale".into(),
        };
        assert!(err.to_string().contains("empty locale"));
    }

    #[test]
    fn pdf_generation_failed_displays_message() {
        let err = ReportPdfError::PdfGenerationFailed {
            detail: "font load failed".into(),
        };
        assert!(err.to_string().contains("font load failed"));
    }

    #[test]
    fn write_failed_displays_message() {
        let err = ReportPdfError::WriteFailed {
            detail: "permission denied".into(),
        };
        assert!(err.to_string().contains("permission denied"));
    }

    #[test]
    fn open_failed_displays_message() {
        let err = ReportPdfError::OpenFailed {
            detail: "no_associated_app".into(),
        };
        assert!(err.to_string().contains("no_associated_app"));
    }

    #[test]
    fn each_variant_emits_only_its_code_on_the_wire() {
        // `detail` is `#[serde(skip)]` — the wire carries the code alone.
        for (err, code) in [
            (
                ReportPdfError::InvalidRequest { detail: "x".into() },
                "InvalidRequest",
            ),
            (
                ReportPdfError::PdfGenerationFailed { detail: "x".into() },
                "PdfGenerationFailed",
            ),
            (
                ReportPdfError::WriteFailed { detail: "x".into() },
                "WriteFailed",
            ),
            (
                ReportPdfError::OpenFailed { detail: "x".into() },
                "OpenFailed",
            ),
        ] {
            assert_eq!(to_value(&err).unwrap(), json!({ "code": code }));
        }
    }
}

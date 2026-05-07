use std::fmt;

/// Errors produced by the `generate_fund_reconciliation_report_pdf` command.
#[derive(Debug)]
pub enum ReportPdfError {
    /// The `ReportGenerationRequest` payload is structurally invalid.
    ///
    /// Triggered when: a required pre-resolved string is empty, exceeds the
    /// length cap, contains control characters, or a collection (header
    /// lines, unreconciled rows, correction groups, correction rows) exceeds
    /// its DoS-guard cap. See `request::validate_safe_string`.
    InvalidRequest(String),

    /// PDF rendering failed after validation passed — e.g. font load error,
    /// internal printpdf error, or I/O error.
    PdfGenerationFailed(String),
}

impl fmt::Display for ReportPdfError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ReportPdfError::InvalidRequest(msg) => write!(f, "Invalid request: {}", msg),
            ReportPdfError::PdfGenerationFailed(msg) => {
                write!(f, "PDF generation failed: {}", msg)
            }
        }
    }
}

impl std::error::Error for ReportPdfError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalid_request_displays_message() {
        let err = ReportPdfError::InvalidRequest("empty locale".into());
        assert!(err.to_string().contains("empty locale"));
    }

    #[test]
    fn pdf_generation_failed_displays_message() {
        let err = ReportPdfError::PdfGenerationFailed("font load failed".into());
        assert!(err.to_string().contains("font load failed"));
    }
}

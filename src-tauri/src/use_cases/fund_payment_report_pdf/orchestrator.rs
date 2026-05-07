use super::error::ReportPdfError;
use super::renderer::render;
use super::request::ReportGenerationRequest;

/// Orchestrate the post-reconciliation report PDF generation.
///
/// Validates the request payload, then renders the PDF. The Tauri command
/// in `api.rs` delegates here per the project's use-case orchestrator
/// convention (rule B22) — `api.rs` deserializes and serializes only;
/// orchestration belongs to this layer.
///
/// # Errors
///
/// - `ReportPdfError::InvalidRequest` if `request.validate()` fails.
/// - `ReportPdfError::PdfGenerationFailed` if rendering fails.
pub fn generate(request: &ReportGenerationRequest) -> Result<Vec<u8>, ReportPdfError> {
    request.validate()?;
    render(request)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::fund_payment_report_pdf::request::{
        valid_request, ReportGenerationRequest,
    };

    #[test]
    fn generate_succeeds_for_valid_request() {
        let req = valid_request();
        let bytes = generate(&req).expect("valid request must produce a PDF");
        assert_eq!(&bytes[..4], b"%PDF");
    }

    #[test]
    fn generate_propagates_invalid_request_error() {
        let req = ReportGenerationRequest {
            title: String::new(),
            ..valid_request()
        };
        let err = generate(&req).expect_err("empty title must fail validation");
        assert!(matches!(err, ReportPdfError::InvalidRequest(_)));
    }
}

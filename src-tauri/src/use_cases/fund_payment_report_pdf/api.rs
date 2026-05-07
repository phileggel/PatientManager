use super::error::ReportPdfError;
use super::orchestrator::generate;
use super::request::ReportGenerationRequest;
use crate::BACKEND;

/// Generate the post-reconciliation report as a PDF byte stream.
///
/// FPR-011, FPR-013, FPR-020, FPR-021, FPR-022, FPR-030 to FPR-042.
///
/// The request must already carry every pre-resolved string the renderer
/// will place: translated labels, formatted dates, formatted currency
/// values, and the per-correction joined row strings. The backend performs
/// no database lookup, no translation, and no formatting (FPR-013, FPR-021).
#[tauri::command]
#[specta::specta]
pub async fn generate_fund_reconciliation_report_pdf(
    request: ReportGenerationRequest,
) -> Result<Vec<u8>, String> {
    let unreconciled_count = match &request.unreconciled {
        super::request::UnreconciledSection::Empty { .. } => 0,
        super::request::UnreconciledSection::Rows { rows, .. } => rows.len(),
    };
    let correction_groups_count = request.correction_groups.len();
    let correction_rows_total: usize = request.correction_groups.iter().map(|g| g.rows.len()).sum();
    tracing::info!(
        target: BACKEND,
        header_lines = request.header_lines.len(),
        unreconciled_count,
        correction_groups_count,
        correction_rows_total,
        "Generating fund reconciliation report PDF"
    );

    match generate(&request) {
        Ok(bytes) => {
            tracing::info!(
                target: BACKEND,
                size_bytes = bytes.len(),
                "Fund reconciliation report PDF generated"
            );
            Ok(bytes)
        }
        Err(ReportPdfError::InvalidRequest(detail)) => {
            // Validation errors are safe to surface verbatim — they reference
            // only field names and bounds, never user-supplied content
            // (see `validate_safe_string` in request.rs).
            tracing::warn!(target: BACKEND, %detail, "Report PDF request rejected");
            Err(format!("Invalid request: {detail}"))
        }
        Err(ReportPdfError::PdfGenerationFailed(detail)) => {
            // Renderer-internal errors may carry library-internal strings.
            // Log the detail server-side; return a fixed user-facing message.
            tracing::error!(target: BACKEND, %detail, "Report PDF rendering failed");
            Err("PDF rendering failed".into())
        }
    }
}

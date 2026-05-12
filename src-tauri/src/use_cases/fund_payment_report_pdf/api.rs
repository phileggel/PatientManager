use super::error::ReportPdfError;
use super::orchestrator::{generate, save};
use super::request::ReportGenerationRequest;
use crate::shared::secure_path::{self, PathPolicy};
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
        Err(ReportPdfError::WriteFailed(detail)) => {
            // `generate()` performs no filesystem I/O, so this arm is
            // unreachable in practice. Kept exhaustive for compile-time
            // safety: a future orchestrator refactor that introduces a write
            // surfaces a logged "internal error" rather than panicking.
            tracing::error!(
                target: BACKEND,
                %detail,
                "Unexpected WriteFailed from generate() — likely an orchestrator regression"
            );
            Err("Internal error".into())
        }
    }
}

/// Generate the post-reconciliation report and write it to `path`.
///
/// FPR-016. Combines `generate_fund_reconciliation_report_pdf`'s render
/// step with a server-side filesystem write. The frontend opens the native
/// save dialog and forwards the user-chosen path; bytes never leave the
/// backend, eliminating the renderer's need for the `fs:allow-write*`
/// capabilities.
///
/// `path` is trusted only as a destination — `validate()` covers the
/// request payload as for the preview command. The user-chosen path is
/// canonicalized and asserted to fall under `$HOME` with a `.pdf`
/// extension via `core::secure_path` before any write.
#[tauri::command]
#[specta::specta]
pub async fn save_fund_reconciliation_report_pdf(
    request: ReportGenerationRequest,
    path: String,
) -> Result<(), String> {
    tracing::info!(
        target: BACKEND,
        path_len = path.len(),
        "Saving fund reconciliation report PDF"
    );

    let allowed_root =
        secure_path::user_home().ok_or_else(|| "Cannot resolve user home directory".to_string())?;
    let canonical = secure_path::validate_user_path(
        &path,
        &allowed_root,
        PathPolicy::NewFileInExistingDir {
            extensions: &["pdf"],
        },
    )
    .map_err(|e| {
        tracing::warn!(target: BACKEND, error = %e, "Save path rejected by validator");
        format!("{e}")
    })?;

    match save(&request, &canonical) {
        Ok(()) => {
            tracing::info!(
                target: BACKEND,
                "Fund reconciliation report PDF saved"
            );
            Ok(())
        }
        Err(ReportPdfError::InvalidRequest(detail)) => {
            tracing::warn!(target: BACKEND, %detail, "Save report PDF rejected");
            Err(format!("Invalid request: {detail}"))
        }
        Err(ReportPdfError::PdfGenerationFailed(detail)) => {
            tracing::error!(target: BACKEND, %detail, "Save report PDF rendering failed");
            Err("PDF rendering failed".into())
        }
        Err(ReportPdfError::WriteFailed(detail)) => {
            tracing::error!(target: BACKEND, %detail, "Failed to write report PDF");
            Err(format!("Failed to save PDF: {detail}"))
        }
    }
}

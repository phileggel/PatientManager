use tauri::{AppHandle, Manager};

use super::error::ReportPdfError;
use super::orchestrator::{generate, next_available_path, save};
use super::request::ReportGenerationRequest;
use crate::BACKEND;

/// Maximum allowed length of the client-supplied filename, in chars.
///
/// Generous upper bound — typical names like
/// `rapport_rapprochement_caisse_2026-05.pdf` sit well under 50 chars; the
/// cap is a structural DoS guard, not a UX constraint.
const FILENAME_MAX_LEN: usize = 200;

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
            tracing::warn!(target: BACKEND, %detail, "Report PDF request rejected");
            Err(format!("Invalid request: {detail}"))
        }
        Err(ReportPdfError::PdfGenerationFailed(detail)) => {
            tracing::error!(target: BACKEND, %detail, "Report PDF rendering failed");
            Err("PDF rendering failed".into())
        }
        Err(ReportPdfError::WriteFailed(detail)) => {
            tracing::error!(
                target: BACKEND,
                %detail,
                "Unexpected WriteFailed from generate() — likely an orchestrator regression"
            );
            Err("Internal error".into())
        }
        Err(ReportPdfError::OpenFailed(detail)) => {
            tracing::error!(
                target: BACKEND,
                %detail,
                "Unexpected OpenFailed from generate() — likely an orchestrator regression"
            );
            Err("Internal error".into())
        }
    }
}

/// Generate the report, save it to the user's Downloads directory under the
/// supplied filename, and launch it in the system default PDF viewer.
///
/// FPR-015, FPR-016. Returns the absolute path of the written file so the
/// frontend can surface its name in a confirmation toast.
///
/// Filename safety: the caller-supplied `filename` is treated as a leaf name
/// only — it MUST contain no path separators, no `..` segment, must end in
/// `.pdf`, and must fit within [`FILENAME_MAX_LEN`]. The destination
/// directory is fixed to the platform Downloads folder; no user-supplied
/// path component reaches the filesystem.
///
/// Collision handling: if a same-named file already exists, a ` (N)` suffix
/// is appended before the extension (`name.pdf` → `name (1).pdf` → …) so
/// re-exporting the same report never silently overwrites a prior one.
#[tauri::command]
#[specta::specta]
pub async fn export_and_open_fund_reconciliation_report_pdf(
    app: AppHandle,
    request: ReportGenerationRequest,
    filename: String,
) -> Result<String, String> {
    tracing::info!(
        target: BACKEND,
        filename_len = filename.len(),
        "Exporting fund reconciliation report PDF"
    );

    validate_filename(&filename).map_err(|e| {
        tracing::warn!(target: BACKEND, error = %e, "Export filename rejected by validator");
        e
    })?;

    let downloads_dir = app.path().download_dir().map_err(|e| {
        tracing::error!(target: BACKEND, error = %e, "Cannot resolve Downloads directory");
        "Cannot resolve Downloads directory".to_string()
    })?;

    let target = next_available_path(&downloads_dir.join(&filename));

    match save(&request, &target) {
        Ok(()) => {
            tracing::info!(
                target: BACKEND,
                "Fund reconciliation report PDF saved"
            );
        }
        Err(ReportPdfError::InvalidRequest(detail)) => {
            tracing::warn!(target: BACKEND, %detail, "Export report PDF rejected");
            return Err(format!("Invalid request: {detail}"));
        }
        Err(ReportPdfError::PdfGenerationFailed(detail)) => {
            tracing::error!(target: BACKEND, %detail, "Export report PDF rendering failed");
            return Err("PDF rendering failed".into());
        }
        Err(ReportPdfError::WriteFailed(detail)) => {
            tracing::error!(target: BACKEND, %detail, "Failed to write report PDF");
            return Err(format!("Failed to save PDF: {detail}"));
        }
        Err(ReportPdfError::OpenFailed(_)) => {
            tracing::error!(target: BACKEND, "Unexpected OpenFailed from save()");
            return Err("Internal error".into());
        }
    }

    tauri_plugin_opener::open_path(&target, None::<&str>).map_err(|e| {
        tracing::error!(target: BACKEND, error = %e, "Failed to open report PDF in system viewer");
        "Failed to open PDF in system viewer".to_string()
    })?;

    Ok(target.to_string_lossy().into_owned())
}

/// Reject filenames that are empty, too long, contain path separators or
/// `..` segments, or do not end in `.pdf` (case-insensitive).
///
/// Returns an `Err` carrying a fixed code suitable for direct surfacing to
/// the frontend — no user-supplied content is echoed back.
fn validate_filename(filename: &str) -> Result<(), String> {
    if filename.is_empty() {
        return Err("Filename is empty".into());
    }
    if filename.chars().count() > FILENAME_MAX_LEN {
        return Err("Filename too long".into());
    }
    if filename.contains('/') || filename.contains('\\') {
        return Err("Filename contains path separator".into());
    }
    if filename.split(['/', '\\']).any(|segment| segment == "..") || filename.contains("..") {
        return Err("Filename contains parent reference".into());
    }
    if !filename.to_ascii_lowercase().ends_with(".pdf") {
        return Err("Filename must end with .pdf".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_filename_accepts_simple_pdf_name() {
        assert!(validate_filename("report.pdf").is_ok());
        assert!(validate_filename("rapport_rapprochement_caisse_2026-05.pdf").is_ok());
        assert!(validate_filename("fund_reconciliation_report_2026-05.pdf").is_ok());
    }

    #[test]
    fn validate_filename_is_case_insensitive_for_extension() {
        assert!(validate_filename("report.PDF").is_ok());
        assert!(validate_filename("report.Pdf").is_ok());
    }

    #[test]
    fn validate_filename_rejects_empty() {
        assert!(validate_filename("").is_err());
    }

    #[test]
    fn validate_filename_rejects_overly_long_name() {
        let long = "a".repeat(FILENAME_MAX_LEN + 1) + ".pdf";
        assert!(validate_filename(&long).is_err());
    }

    #[test]
    fn validate_filename_rejects_forward_slash() {
        assert!(validate_filename("subdir/report.pdf").is_err());
        assert!(validate_filename("/etc/report.pdf").is_err());
    }

    #[test]
    fn validate_filename_rejects_backslash() {
        assert!(validate_filename("subdir\\report.pdf").is_err());
        assert!(validate_filename("C:\\report.pdf").is_err());
    }

    #[test]
    fn validate_filename_rejects_parent_reference() {
        assert!(validate_filename("..report.pdf").is_err());
        assert!(validate_filename("report..pdf").is_err());
    }

    #[test]
    fn validate_filename_rejects_non_pdf_extension() {
        assert!(validate_filename("report.txt").is_err());
        assert!(validate_filename("report").is_err());
        assert!(validate_filename("report.pdf.exe").is_err());
    }
}

use tauri::{AppHandle, Manager};

use super::error::ReportPdfError;
use super::orchestrator::{destination_in, generate, save};
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
) -> Result<Vec<u8>, ReportPdfError> {
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

    let bytes = generate(&request).inspect_err(log_report_pdf_error)?;
    tracing::info!(
        target: BACKEND,
        size_bytes = bytes.len(),
        "Fund reconciliation report PDF generated"
    );
    Ok(bytes)
}

/// Log a `ReportPdfError` at the command boundary with its server-side `detail`
/// before it is returned to the frontend (where only the `code` survives).
fn log_report_pdf_error(e: &ReportPdfError) {
    match e {
        ReportPdfError::InvalidRequest { detail } => {
            tracing::warn!(target: BACKEND, %detail, "Report PDF request rejected");
        }
        ReportPdfError::PdfGenerationFailed { detail } => {
            tracing::error!(target: BACKEND, %detail, "Report PDF rendering failed");
        }
        ReportPdfError::WriteFailed { detail } => {
            tracing::error!(target: BACKEND, %detail, "Report PDF write failed");
        }
        ReportPdfError::OpenFailed { detail } => {
            tracing::error!(target: BACKEND, %detail, "Report PDF open failed");
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
/// only — it MUST contain no path separator, no `:`, no `..`, no Windows
/// device name, must end in
/// `.pdf`, and must fit within [`FILENAME_MAX_LEN`]. The destination
/// directory is fixed to the platform Downloads folder; the chosen name goes
/// through `validate_user_path` (never a link, never outside Downloads) and is
/// created new, never written over.
///
/// Collision handling: if anything is at that name, a link included, a ` (N)`
/// suffix is appended before the extension (`name.pdf` → `name (1).pdf` → …),
/// so re-exporting never overwrites a prior one; after 1000 taken names the
/// export fails (`no_free_name`).
#[tauri::command]
#[specta::specta]
pub async fn export_and_open_fund_reconciliation_report_pdf(
    app: AppHandle,
    request: ReportGenerationRequest,
    filename: String,
) -> Result<String, ReportPdfError> {
    tracing::info!(
        target: BACKEND,
        filename_len = filename.len(),
        "Exporting fund reconciliation report PDF"
    );

    validate_filename(&filename).inspect_err(log_report_pdf_error)?;

    let downloads_dir = app.path().download_dir().map_err(|e| {
        tracing::error!(target: BACKEND, error = %e, "Cannot resolve Downloads directory");
        ReportPdfError::WriteFailed {
            detail: "downloads_dir_unresolved".into(),
        }
    })?;

    let target = destination_in(&downloads_dir, &filename).inspect_err(log_report_pdf_error)?;

    save(&request, &target).inspect_err(log_report_pdf_error)?;
    tracing::info!(target: BACKEND, "Fund reconciliation report PDF saved");

    tauri_plugin_opener::open_path(&target, None::<&str>).map_err(open_failed)?;

    Ok(target.to_string_lossy().into_owned())
}

/// The opener's own error text can name the report's local path: it is logged,
/// and the frontend gets a fixed code (DEBT-061).
fn open_failed(e: impl std::fmt::Display) -> ReportPdfError {
    tracing::error!(target: BACKEND, error = %e, "Failed to open report PDF in system viewer");
    ReportPdfError::OpenFailed {
        detail: "open_failed".into(),
    }
}

/// Windows device names, refused as a file stem whatever the extension.
const RESERVED_STEMS: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Reject filenames that are empty, too long, contain path separators, `:`
/// or `..` segments, name a Windows device, or do not end in `.pdf`
/// (case-insensitive).
///
/// Returns an `Err` carrying a fixed code suitable for direct surfacing to
/// the frontend — no user-supplied content is echoed back.
fn validate_filename(filename: &str) -> Result<(), ReportPdfError> {
    let reject = |detail: &str| ReportPdfError::InvalidRequest {
        detail: detail.to_string(),
    };
    if filename.is_empty() {
        return Err(reject("Filename is empty"));
    }
    if filename.chars().count() > FILENAME_MAX_LEN {
        return Err(reject("Filename too long"));
    }
    if filename.contains('/') || filename.contains('\\') || filename.contains(':') {
        return Err(reject("Filename contains path separator"));
    }
    let stem = filename.split('.').next().unwrap_or("").trim_end();
    if RESERVED_STEMS
        .iter()
        .any(|reserved| stem.eq_ignore_ascii_case(reserved))
    {
        return Err(reject("Filename is a reserved device name"));
    }
    if filename.contains("..") {
        return Err(reject("Filename contains parent reference"));
    }
    if !filename.to_ascii_lowercase().ends_with(".pdf") {
        return Err(reject("Filename must end with .pdf"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn debt_061_a_failed_open_sends_a_fixed_code_never_the_path() {
        match open_failed("cannot open /home/someone/Downloads/report.pdf") {
            ReportPdfError::OpenFailed { detail } => assert_eq!(detail, "open_failed"),
            other => panic!("expected OpenFailed, got {other:?}"),
        }
    }

    #[test]
    fn debt_065_a_colon_or_a_windows_device_name_is_refused() {
        for name in [
            "C:report.pdf",
            "report:x.pdf",
            "CON.pdf",
            "nul.pdf",
            "Com1.pdf",
            "lpt9.pdf",
        ] {
            assert!(validate_filename(name).is_err(), "{name} must be refused");
        }
        assert!(validate_filename("console.pdf").is_ok());
    }

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

use std::path::Path;
use std::sync::Arc;

use tauri::State;

use crate::shared::logger::BACKEND;
use crate::shared::secure_path::{self, PathPolicy};

use super::error::DiagnosticReportError;
use super::orchestrator::{DiagnosticReportOrchestrator, DiagnosticReportResult};

/// Writes a diagnostic report to `dest_path` (DGR-020 to DGR-025) and returns
/// its support code.
///
/// The frontend-supplied `dest_path` comes from a native save dialog; it is
/// validated as a new `.txt` file in an existing directory under the user's
/// home (DGR-023), so a crafted IPC call cannot write elsewhere.
#[tauri::command]
#[specta::specta]
pub async fn generate_diagnostic_report(
    dest_path: String,
    orchestrator: State<'_, Arc<DiagnosticReportOrchestrator>>,
) -> Result<DiagnosticReportResult, DiagnosticReportError> {
    tracing::info!(target: BACKEND, "generate_diagnostic_report command");

    let allowed_root = secure_path::user_home().ok_or_else(|| {
        tracing::error!(target: BACKEND, "Cannot resolve user home directory");
        DiagnosticReportError::HomeUnresolved
    })?;
    let canonical = secure_path::validate_user_path(
        &dest_path,
        &allowed_root,
        PathPolicy::NewFileInExistingDir {
            extensions: &["txt"],
        },
    )
    .map_err(|e| {
        tracing::warn!(target: BACKEND, error = %e, "Diagnostic report path rejected by validator");
        DiagnosticReportError::PathRejected
    })?;

    refuse_symlink(&canonical)?;

    orchestrator.generate(&canonical).await
}

/// The validator canonicalises the destination's folder, not the file itself:
/// an existing symlink there would be followed on write, out of the allowed
/// folder. An existing regular file is fine — the save dialog asked to replace it.
fn refuse_symlink(dest_path: &Path) -> Result<(), DiagnosticReportError> {
    match std::fs::symlink_metadata(dest_path) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            tracing::warn!(target: BACKEND, "Diagnostic report destination is a symlink");
            Err(DiagnosticReportError::PathRejected)
        }
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dgr_023_a_new_or_existing_regular_file_is_accepted() {
        let dir = tempfile::tempdir().expect("tempdir");
        let existing = dir.path().join("report.txt");
        std::fs::write(&existing, "old").expect("write file");

        assert_eq!(refuse_symlink(&existing), Ok(()));
        assert_eq!(refuse_symlink(&dir.path().join("new.txt")), Ok(()));
    }

    #[cfg(unix)]
    #[test]
    fn test_dgr_023_a_symlink_at_the_destination_is_refused() {
        let dir = tempfile::tempdir().expect("tempdir");
        let target = dir.path().join("elsewhere.txt");
        std::fs::write(&target, "kept").expect("write target");
        let link = dir.path().join("report.txt");
        std::os::unix::fs::symlink(&target, &link).expect("symlink");

        assert_eq!(
            refuse_symlink(&link),
            Err(DiagnosticReportError::PathRejected)
        );
    }
}

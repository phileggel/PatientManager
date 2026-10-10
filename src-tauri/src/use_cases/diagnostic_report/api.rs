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
/// home, never a symbolic link (DGR-023), so a crafted IPC call cannot write
/// elsewhere.
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

    orchestrator.generate(&canonical).await
}

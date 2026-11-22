use std::path::PathBuf;
use std::sync::Arc;

use tauri::{Manager, State};

use crate::shared::logger::BACKEND;
use crate::shared::secure_path::{self, PathPolicy};

use super::error::DiagnosticReportError;
use super::orchestrator::{DiagnosticReportOrchestrator, DiagnosticReportResult};
use super::startup_failure::{held_or_refused, StartupFailure, StartupFailureReport};

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

    let canonical = validate_destination(&dest_path)?;
    orchestrator.generate(&canonical).await
}

/// DGR-023, DGR-026 — a `.txt` file in an existing folder under the home folder.
fn validate_destination(dest_path: &str) -> Result<PathBuf, DiagnosticReportError> {
    let allowed_root = secure_path::user_home().ok_or_else(|| {
        tracing::error!(target: BACKEND, "Cannot resolve user home directory");
        DiagnosticReportError::HomeUnresolved
    })?;
    secure_path::validate_user_path(
        dest_path,
        &allowed_root,
        PathPolicy::NewFileInExistingDir {
            extensions: &["txt"],
        },
    )
    .map_err(|e| {
        tracing::warn!(target: BACKEND, error = %e, "Diagnostic report path rejected by validator");
        DiagnosticReportError::PathRejected
    })
}

/// DGR-040, DGR-041, DGR-044 — what failed at start-up, or `None`.
#[tauri::command]
#[specta::specta]
pub fn get_startup_failure(app: tauri::AppHandle) -> Option<StartupFailure> {
    app.try_state::<Arc<StartupFailureReport>>()
        .map(|report| report.failure().clone())
}

/// DGR-043, DGR-044A — write the failure report; refused first when the start-up
/// did not fail.
#[tauri::command]
#[specta::specta]
pub async fn generate_startup_failure_report(
    dest_path: String,
    app: tauri::AppHandle,
) -> Result<DiagnosticReportResult, DiagnosticReportError> {
    tracing::info!(target: BACKEND, "generate_startup_failure_report command");

    let report =
        held_or_refused(app.try_state::<Arc<StartupFailureReport>>()).inspect_err(|_| {
            tracing::warn!(target: BACKEND, "A failure report was asked after a start-up that did not fail");
        })?;
    let canonical = validate_destination(&dest_path)?;
    report.write(&canonical).await
}

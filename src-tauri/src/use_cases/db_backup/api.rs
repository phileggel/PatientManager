use std::sync::Arc;
use tauri::State;

use crate::core::logger::BACKEND;

use super::orchestrator::DbBackupOrchestrator;

/// Exports the active database to the given destination path as a gzip-compressed
/// SQLite file (R7, R8). The path is obtained from a native save-file dialog on
/// the frontend.
#[tauri::command]
#[specta::specta]
pub async fn export_database(
    dest_path: String,
    orchestrator: State<'_, Arc<DbBackupOrchestrator>>,
) -> Result<(), String> {
    tracing::info!(name: BACKEND, "export_database command");
    orchestrator
        .export_database(dest_path)
        .await
        .map_err(|e| format!("{e:#}"))
}

/// Decompresses, validates, and stages a backup file as a pending import (R9, R10).
/// The replacement takes effect on the next application startup.
/// The frontend is responsible for relaunching the app after this command succeeds (R6).
#[tauri::command]
#[specta::specta]
pub async fn import_database(
    source_path: String,
    orchestrator: State<'_, Arc<DbBackupOrchestrator>>,
) -> Result<(), String> {
    tracing::info!(name: BACKEND, "import_database command");
    orchestrator
        .import_database(source_path)
        .await
        .map_err(|e| format!("{e:#}"))
}

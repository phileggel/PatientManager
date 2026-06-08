use std::sync::Arc;
use tauri::State;

use crate::shared::logger::BACKEND;
use crate::shared::secure_path::{self, PathPolicy};

use super::error::DbBackupError;
use super::orchestrator::DbBackupOrchestrator;

/// Exports the active database to the given destination path as a gzip-compressed
/// SQLite file (R7, R8). The path is obtained from a native save-file dialog on
/// the frontend.
///
/// The frontend-supplied `dest_path` is validated as a new file in an existing
/// directory under the user's home, with a `.gz` extension — a crafted IPC
/// call that bypasses the save dialog cannot reach the filesystem layer with
/// an unrestricted path.
#[tauri::command]
#[specta::specta]
pub async fn export_database(
    dest_path: String,
    orchestrator: State<'_, Arc<DbBackupOrchestrator>>,
) -> Result<(), DbBackupError> {
    tracing::info!(target: BACKEND, "export_database command");

    let allowed_root = secure_path::user_home().ok_or(DbBackupError::HomeUnresolved)?;
    let canonical = secure_path::validate_user_path(
        &dest_path,
        &allowed_root,
        PathPolicy::NewFileInExistingDir {
            extensions: &["gz"],
        },
    )
    .map_err(|e| {
        tracing::warn!(target: BACKEND, error = %e, "Export path rejected by validator");
        DbBackupError::PathRejected
    })?;

    orchestrator
        .export_database(canonical.to_string_lossy().into_owned())
        .await
}

/// Decompresses, validates, and stages a backup file as a pending import (R9, R10).
/// The replacement takes effect on the next application startup.
/// The frontend is responsible for relaunching the app after this command succeeds (R6).
///
/// The frontend-supplied `source_path` is validated as an existing regular
/// file under the user's home with a `.gz` extension — a crafted IPC call
/// cannot trick the importer into reading arbitrary files.
#[tauri::command]
#[specta::specta]
pub async fn import_database(
    source_path: String,
    orchestrator: State<'_, Arc<DbBackupOrchestrator>>,
) -> Result<(), DbBackupError> {
    tracing::info!(target: BACKEND, "import_database command");

    let allowed_root = secure_path::user_home().ok_or(DbBackupError::HomeUnresolved)?;
    let canonical = secure_path::validate_user_path(
        &source_path,
        &allowed_root,
        PathPolicy::ExistingFile {
            extensions: &["gz"],
        },
    )
    .map_err(|e| {
        tracing::warn!(target: BACKEND, error = %e, "Import path rejected by validator");
        DbBackupError::PathRejected
    })?;

    orchestrator
        .import_database(canonical.to_string_lossy().into_owned())
        .await
}

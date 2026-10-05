use crate::shared::logger::BACKEND;
use std::sync::Arc;

use tauri::State;

use super::domain::ProcedureType;
use super::error::ProcedureError;
use super::service::ProcedureTypeService;

use super::dto::RawProcedureType;

// ============ Tauri Commands ============

/// Tauri command: Add a new procedure type
#[tauri::command]
#[specta::specta]
pub async fn add_procedure_type(
    name: String,
    default_amount: i64,
    category: Option<String>,
    service: State<'_, Arc<ProcedureTypeService>>,
) -> Result<ProcedureType, ProcedureError> {
    tracing::info!(target: BACKEND, name = %name, default_amount = %default_amount, "Processing add procedure type request");

    service
        .add_procedure_type(name, default_amount, category)
        .await
        .inspect(|pt| {
            tracing::info!(target: BACKEND, procedure_type_id = ?pt.id, "Procedure type added successfully");
        })
}

/// Tauri command: Read all procedure types
#[tauri::command]
#[specta::specta]
pub async fn read_all_procedure_types(
    service: State<'_, Arc<ProcedureTypeService>>,
) -> Result<Vec<ProcedureType>, ProcedureError> {
    tracing::info!(target: BACKEND, "Processing read all procedure types request");

    service
        .read_all_procedure_types()
        .await
        .inspect(|pts| {
            tracing::info!(target: BACKEND, count = pts.len(), "Retrieved procedure types successfully");
        })
}

/// Tauri command: Update an existing procedure type
#[tauri::command]
#[specta::specta]
pub async fn update_procedure_type(
    raw: RawProcedureType,
    service: State<'_, Arc<ProcedureTypeService>>,
) -> Result<ProcedureType, ProcedureError> {
    tracing::info!(target: BACKEND, procedure_type_id = %raw.id, "Processing update procedure type request");

    // Construct valid domain object from raw data.
    let procedure_type = ProcedureType::with_id(raw.id, raw.name, raw.default_amount, raw.category)
        .inspect_err(|e| {
            tracing::error!(target: BACKEND, error = %e, "Invalid procedure type data");
        })?;

    service
        .update_procedure_type(procedure_type)
        .await
        .inspect(|pt| {
            tracing::info!(target: BACKEND, procedure_type_id = ?pt.id, "Procedure type updated successfully");
        })
}

/// Tauri command: Delete a procedure type
#[tauri::command]
#[specta::specta]
pub async fn delete_procedure_type(
    id: String,
    service: State<'_, Arc<ProcedureTypeService>>,
) -> Result<(), ProcedureError> {
    tracing::info!(target: BACKEND, procedure_type_id = %id, "Processing delete procedure type request");

    service
        .delete_procedure_type(&id)
        .await
        .inspect(|_| {
            tracing::info!(target: BACKEND, procedure_type_id = %id, "Procedure type deleted successfully");
        })
}

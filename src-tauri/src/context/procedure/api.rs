use std::sync::Arc;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::State;

use super::domain::ProcedureType;
use super::service::ProcedureTypeService;

// ============ DTOs ============

/// Raw procedure type data from frontend (unvalidated)
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct RawProcedureType {
    pub id: String,
    pub name: String,
    pub default_amount: i64,
    pub category: Option<String>,
}

/// Candidate procedure for batch creation and validation for orchestrators
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ProcedureCandidate {
    pub patient_id: String,
    pub fund_id: Option<String>,
    pub procedure_type_id: String,
    pub procedure_date: String,
    pub procedure_amount: Option<i64>,
    pub payment_method: Option<String>,
    pub confirmed_payment_date: Option<String>,
    pub actual_payment_amount: Option<i64>,
    pub awaited_amount: Option<i64>,
}

// ============ Tauri Commands ============

/// Tauri command: Add a new procedure type
#[tauri::command]
#[specta::specta]
pub async fn add_procedure_type(
    name: String,
    default_amount: i64,
    category: Option<String>,
    service: State<'_, Arc<ProcedureTypeService>>,
) -> Result<ProcedureType, String> {
    tracing::info!(name = %name, default_amount = %default_amount, "Processing add procedure type request");

    service
        .add_procedure_type(name, default_amount, category)
        .await
        .inspect(|pt| {
            tracing::info!(procedure_type_id = ?pt.id, "Procedure type added successfully");
        })
        .map_err(|e| {
            tracing::error!(error = %e, "Failed to add procedure type");
            format!("{:#}", e)
        })
}

/// Tauri command: Read all procedure types
#[tauri::command]
#[specta::specta]
pub async fn read_all_procedure_types(
    service: State<'_, Arc<ProcedureTypeService>>,
) -> Result<Vec<ProcedureType>, String> {
    tracing::info!("Processing read all procedure types request");

    service
        .read_all_procedure_types()
        .await
        .inspect(|pts| {
            tracing::info!(count = pts.len(), "Retrieved procedure types successfully");
        })
        .map_err(|e| {
            tracing::error!(error = %e, "Failed to retrieve procedure types");
            format!("{:#}", e)
        })
}

/// Tauri command: Update an existing procedure type
#[tauri::command]
#[specta::specta]
pub async fn update_procedure_type(
    raw: RawProcedureType,
    service: State<'_, Arc<ProcedureTypeService>>,
) -> Result<ProcedureType, String> {
    tracing::info!(procedure_type_id = %raw.id, "Processing update procedure type request");

    // Construct valid domain object from raw data
    let procedure_type = ProcedureType::with_id(raw.id, raw.name, raw.default_amount, raw.category)
        .map_err(|e| {
            tracing::error!(error = %e, "Invalid procedure type data");
            format!("{:#}", e)
        })?;

    service
        .update_procedure_type(procedure_type)
        .await
        .inspect(|pt| {
            tracing::info!(procedure_type_id = ?pt.id, "Procedure type updated successfully");
        })
        .map_err(|e| {
            tracing::error!(error = %e, "Failed to update procedure type");
            format!("{:#}", e)
        })
}

/// Tauri command: Delete a procedure type
#[tauri::command]
#[specta::specta]
pub async fn delete_procedure_type(
    id: String,
    service: State<'_, Arc<ProcedureTypeService>>,
) -> Result<(), String> {
    tracing::info!(procedure_type_id = %id, "Processing delete procedure type request");

    service
        .delete_procedure_type(&id)
        .await
        .inspect(|_| {
            tracing::info!(procedure_type_id = %id, "Procedure type deleted successfully");
        })
        .map_err(|e| {
            tracing::error!(error = %e, "Failed to delete procedure type");
            format!("{:#}", e)
        })
}

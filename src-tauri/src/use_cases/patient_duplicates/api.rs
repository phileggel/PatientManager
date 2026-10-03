use std::sync::Arc;

use tauri::State;

use crate::shared::logger::BACKEND;

use super::error::PatientDuplicatesError;
use super::orchestrator::PatientDuplicatesOrchestrator;
use super::pairs::DuplicatePair;

/// PDU-010 to PDU-013 — the candidate pairs, in order.
#[tauri::command]
#[specta::specta]
pub async fn list_patient_duplicates(
    orchestrator: State<'_, Arc<PatientDuplicatesOrchestrator>>,
) -> Result<Vec<DuplicatePair>, PatientDuplicatesError> {
    tracing::debug!(target: BACKEND, "list_patient_duplicates command");
    orchestrator.list_pairs().await
}

/// PDU-021 to PDU-026 — merge `other_patient_id` into `kept_patient_id`.
#[tauri::command]
#[specta::specta]
pub async fn merge_patients(
    kept_patient_id: String,
    other_patient_id: String,
    orchestrator: State<'_, Arc<PatientDuplicatesOrchestrator>>,
) -> Result<(), PatientDuplicatesError> {
    tracing::info!(target: BACKEND, kept_patient_id = %kept_patient_id, other_patient_id = %other_patient_id, "merge_patients command");
    orchestrator
        .merge(&kept_patient_id, &other_patient_id)
        .await
}

/// PDU-030 to PDU-032 — record that two patients are different people.
#[tauri::command]
#[specta::specta]
pub async fn dismiss_patient_duplicate(
    first_patient_id: String,
    second_patient_id: String,
    orchestrator: State<'_, Arc<PatientDuplicatesOrchestrator>>,
) -> Result<(), PatientDuplicatesError> {
    tracing::info!(target: BACKEND, first_patient_id = %first_patient_id, second_patient_id = %second_patient_id, "dismiss_patient_duplicate command");
    orchestrator
        .dismiss(&first_patient_id, &second_patient_id)
        .await
}

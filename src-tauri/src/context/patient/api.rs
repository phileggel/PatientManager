use crate::shared::logger::BACKEND;
use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::State;

use crate::context::patient::{Patient, PatientError, PatientService};

// ============ Domain-Relevant Types (Kept) ============

/// Patient candidate for batch import - semantically different from Patient (lacks ID, created_at)
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct PatientCandidate {
    pub temp_id: String,
    pub name: Option<String>,
    pub ssn: Option<String>,
}

/// Validation status for patient candidate
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PatientValidationStatus {
    Valid,
    AlreadyExists,
    Invalid,
}

/// Validation result wraps candidate with validation outcome
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct PatientValidationResult {
    pub candidate: PatientCandidate,
    pub status: PatientValidationStatus,
    pub existing_id: Option<String>,
    pub error: Option<String>,
}

/// Complex response: validation results
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ValidateBatchPatientsResponse {
    pub results: Vec<PatientValidationResult>,
}

/// Complex response: created patients + temp ID mapping for import tracking
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CreateBatchPatientsResponse {
    pub patients: Vec<Patient>,
    pub temp_id_map: HashMap<String, String>,
}

// ============ Tauri Commands ============

/// Tauri command: Add a new patient
#[tauri::command]
#[specta::specta]
pub async fn add_patient(
    name: Option<String>,
    ssn: Option<String>,
    service: State<'_, Arc<PatientService>>,
) -> Result<Patient, PatientError> {
    tracing::info!(target: BACKEND, has_name = name.is_some(), has_ssn = ssn.is_some(), "Processing add patient request");

    service.create_patient(name, ssn).await.inspect(|patient| {
        tracing::info!(target: BACKEND, patient_id = ?patient.id, "Patient added successfully");
    })
}

/// Tauri command: Read all patients
#[tauri::command]
#[specta::specta]
pub async fn read_all_patients(
    service: State<'_, Arc<PatientService>>,
) -> Result<Vec<Patient>, PatientError> {
    tracing::info!(target: BACKEND, "Processing read all patients request");

    service.get_all_patients().await.inspect(|patients| {
        tracing::info!(target: BACKEND, count = patients.len(), "Retrieved patients successfully");
    })
}

/// Tauri command: Update an existing patient
#[tauri::command]
#[specta::specta]
pub async fn update_patient(
    patient: Patient,
    service: State<'_, Arc<PatientService>>,
) -> Result<Patient, PatientError> {
    tracing::info!(target: BACKEND, patient_id = ?patient.id, "Processing update patient request");

    service.update_patient(patient).await.inspect(|patient| {
        tracing::info!(target: BACKEND, patient_id = ?patient.id, "Patient updated successfully");
    })
}

/// Tauri command: Delete a patient
#[tauri::command]
#[specta::specta]
pub async fn delete_patient(
    id: String,
    service: State<'_, Arc<PatientService>>,
) -> Result<(), PatientError> {
    tracing::info!(target: BACKEND, patient_id = %id, "Processing delete patient request");

    service.delete_patient(&id).await.inspect(|_| {
        tracing::info!(target: BACKEND, patient_id = %id, "Patient deleted successfully");
    })
}

/// Tauri command: Validate batch of patient candidates
#[tauri::command]
#[specta::specta]
pub async fn validate_batch_patients(
    patients: Vec<PatientCandidate>,
    service: State<'_, Arc<PatientService>>,
) -> Result<ValidateBatchPatientsResponse, PatientError> {
    tracing::info!(
        target: BACKEND,
        count = patients.len(),
        "Processing validate batch patients request"
    );

    let results = service.validate_batch(patients).await?;

    tracing::info!(
        target: BACKEND,
        count = results.len(),
        "Batch patients validated successfully"
    );
    Ok(ValidateBatchPatientsResponse { results })
}

/// Tauri command: Create batch of patients
#[tauri::command]
#[specta::specta]
pub async fn create_batch_patients(
    patients: Vec<PatientCandidate>,
    service: State<'_, Arc<PatientService>>,
) -> Result<CreateBatchPatientsResponse, PatientError> {
    tracing::info!(
        target: BACKEND,
        count = patients.len(),
        "Processing create batch patients request"
    );

    let (created_patients, temp_id_map) = service.create_batch(patients).await?;

    tracing::info!(
        target: BACKEND,
        count = created_patients.len(),
        "Batch patients created successfully"
    );
    Ok(CreateBatchPatientsResponse {
        patients: created_patients,
        temp_id_map,
    })
}

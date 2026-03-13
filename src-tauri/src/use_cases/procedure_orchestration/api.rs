use crate::context::procedure::{PaymentMethod, Procedure, ProcedureCandidate, ProcedureStatus};
use crate::use_cases::procedure_orchestration::ProcedureOrchestrationService;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::sync::Arc;
use tauri::State;

// ============ Domain-Relevant Types (Kept) ============

/// Raw healthcare procedure data from frontend (unvalidated)
/// Used for updating an existing procedure with data from an external source
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct RawProcedure {
    pub id: String,
    pub patient_id: String,
    pub fund_id: Option<String>,
    pub procedure_type_id: String,
    pub procedure_date: String,
    pub procedure_amount: Option<i64>,
    pub payment_method: Option<String>,
    pub confirmed_payment_date: Option<String>,
    pub actual_payment_amount: Option<i64>,
    pub payment_status: String,
}

impl RawProcedure {
    /// Converts raw procedure data into a validated domain Procedure
    pub fn into_procedure(self) -> anyhow::Result<Procedure> {
        let payment_method = match self.payment_method.as_deref() {
            Some("CASH") => PaymentMethod::Cash,
            Some("CHECK") => PaymentMethod::Check,
            Some("BANK_CARD") => PaymentMethod::BankCard,
            Some("BANK_TRANSFER") => PaymentMethod::BankTransfer,
            _ => PaymentMethod::None,
        };

        let payment_status = match self.payment_status.as_str() {
            "CREATED" => ProcedureStatus::Created,
            "RECONCILIATED" => ProcedureStatus::Reconciliated,
            "DIRECTLY_PAYED" => ProcedureStatus::DirectlyPayed,
            "FUND_PAYED" => ProcedureStatus::FundPayed,
            "IMPORT_DIRECTLY_PAYED" => ProcedureStatus::ImportDirectlyPayed,
            "IMPORT_FUND_PAYED" => ProcedureStatus::ImportFundPayed,
            _ => ProcedureStatus::None,
        };

        Procedure::with_id(
            self.id,
            self.patient_id,
            self.fund_id,
            self.procedure_type_id,
            self.procedure_date,
            self.procedure_amount,
            payment_method,
            self.confirmed_payment_date,
            self.actual_payment_amount,
            payment_status,
        )
    }
}

/// Validation status for a procedure candidate
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ProcedureValidationStatus {
    Valid,
    Invalid,
}

/// Result of validating a procedure candidate
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ProcedureValidationResult {
    pub candidate: ProcedureCandidate,
    pub status: ProcedureValidationStatus,
    pub error: Option<String>,
}

/// Response DTO for procedure batch validation
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ValidateBatchProceduresResponse {
    pub results: Vec<ProcedureValidationResult>,
}

/// Response DTO for procedure batch creation
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CreateBatchProceduresResponse {
    pub procedures: Vec<Procedure>,
}

// ============ Tauri Commands ============

/// Tauri command: Add a new healthcare procedure
#[tauri::command]
#[specta::specta]
pub async fn add_procedure(
    patient_id: String,
    fund_id: Option<String>,
    procedure_type_id: String,
    procedure_date: String,
    procedure_amount: Option<i64>,
    service: State<'_, Arc<ProcedureOrchestrationService>>,
) -> Result<Procedure, String> {
    tracing::info!(patient_id = %patient_id, "Processing add procedure");

    service
        .create_procedure(
            patient_id,
            fund_id,
            procedure_type_id,
            procedure_date,
            procedure_amount,
            None,
            None,
            None,
            None,
        )
        .await
        .inspect(|procedure| {
            tracing::info!(procedure_id = ?procedure.id, "Procedure created successfully");
        })
        .map_err(|e| {
            tracing::error!(error = %e, "Failed to create procedure");
            format!("{:#}", e)
        })
}

/// Tauri command: Read all procedures
#[tauri::command]
#[specta::specta]
pub async fn read_all_procedures(
    service: State<'_, Arc<ProcedureOrchestrationService>>,
) -> Result<Vec<Procedure>, String> {
    tracing::info!("Processing read all procedures request");

    service
        .get_all_procedures()
        .await
        .inspect(|procedures| {
            tracing::info!(
                count = procedures.len(),
                "Retrieved procedures successfully"
            );
        })
        .map_err(|e| {
            tracing::error!(error = %e, "Failed to retrieve procedures");
            format!("{:#}", e)
        })
}

/// Tauri command: Update an existing procedure
#[tauri::command]
#[specta::specta]
pub async fn update_procedure(
    raw: RawProcedure,
    service: State<'_, Arc<ProcedureOrchestrationService>>,
) -> Result<Procedure, String> {
    tracing::info!(procedure_id = %raw.id, "Processing update procedure");

    // Convert raw data to validated domain object
    let procedure = raw.into_procedure().map_err(|e| {
        tracing::error!(error = %e, "Invalid procedure data");
        format!("{:#}", e)
    })?;

    service
        .update_procedure(procedure)
        .await
        .inspect(|updated| {
            tracing::info!(procedure_id = ?updated.id, "Procedure updated successfully");
        })
        .map_err(|e| {
            tracing::error!(error = %e, "Failed to update procedure");
            format!("{:#}", e)
        })
}

/// Tauri command: Delete a procedure
#[tauri::command]
#[specta::specta]
pub async fn delete_procedure(
    id: String,
    service: State<'_, Arc<ProcedureOrchestrationService>>,
) -> Result<(), String> {
    tracing::info!(procedure_id = %id, "Processing delete procedure");

    service
        .delete_procedure(&id)
        .await
        .map(|_| {
            tracing::info!(procedure_id = %id, "Procedure deleted successfully");
        })
        .map_err(|e| {
            tracing::error!(error = %e, "Failed to delete procedure");
            format!("{:#}", e)
        })
}

/// Tauri command: Validate batch of procedure candidates
#[tauri::command]
#[specta::specta]
pub async fn validate_batch_procedures(
    procedures: Vec<ProcedureCandidate>,
    service: State<'_, Arc<ProcedureOrchestrationService>>,
) -> Result<ValidateBatchProceduresResponse, String> {
    tracing::info!(
        count = procedures.len(),
        "Processing batch procedure validation"
    );

    service
        .validate_batch(procedures)
        .await
        .map(|results| {
            tracing::info!(
                valid_count = results
                    .iter()
                    .filter(|r| matches!(r.status, ProcedureValidationStatus::Valid))
                    .count(),
                invalid_count = results
                    .iter()
                    .filter(|r| matches!(r.status, ProcedureValidationStatus::Invalid))
                    .count(),
                "Batch validation complete"
            );
            ValidateBatchProceduresResponse { results }
        })
        .map_err(|e| {
            tracing::error!(error = %e, "Failed to validate batch procedures");
            format!("{:#}", e)
        })
}

/// Tauri command: Create batch of procedures
#[tauri::command]
#[specta::specta]
pub async fn create_batch_procedures(
    procedures: Vec<ProcedureCandidate>,
    service: State<'_, Arc<ProcedureOrchestrationService>>,
) -> Result<CreateBatchProceduresResponse, String> {
    tracing::info!(
        count = procedures.len(),
        "Processing batch procedure creation"
    );

    service
        .create_batch(procedures)
        .await
        .map(|procedures| {
            tracing::info!(
                count = procedures.len(),
                "Batch procedures created successfully"
            );
            CreateBatchProceduresResponse { procedures }
        })
        .map_err(|e| {
            tracing::error!(error = %e, "Failed to create batch procedures");
            format!("{:#}", e)
        })
}

/// Tauri command: Get unpaid procedures by fund
#[tauri::command]
#[specta::specta]
pub async fn get_unpaid_procedures_by_fund(
    fund_id: String,
    service: State<'_, Arc<ProcedureOrchestrationService>>,
) -> Result<Vec<Procedure>, String> {
    tracing::debug!(fund_id = %fund_id, "Processing get unpaid procedures by fund");

    service
        .get_unpaid_by_fund(&fund_id)
        .await
        .inspect(|procedures| {
            tracing::info!(
                fund_id = %fund_id,
                count = procedures.len(),
                "Retrieved unpaid procedures successfully"
            );
        })
        .map_err(|e| {
            tracing::error!(error = %e, "Failed to retrieve unpaid procedures");
            format!("{:#}", e)
        })
}

/// Tauri command: Get procedures by their IDs
#[tauri::command]
#[specta::specta]
pub async fn read_procedures_by_ids(
    ids: Vec<String>,
    service: State<'_, Arc<ProcedureOrchestrationService>>,
) -> Result<Vec<Procedure>, String> {
    tracing::debug!(count = ids.len(), "Processing read procedures by IDs");

    service
        .read_procedures_by_ids(ids)
        .await
        .inspect(|procedures| {
            tracing::info!(
                count = procedures.len(),
                "Retrieved procedures by IDs successfully"
            );
        })
        .map_err(|e| {
            tracing::error!(error = %e, "Failed to read procedures by IDs");
            format!("{:#}", e)
        })
}

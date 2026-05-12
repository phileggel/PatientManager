use crate::context::procedure::{PaymentMethod, Procedure, ProcedureCandidate, ProcedureStatus};
use crate::shared::logger::BACKEND;
use crate::use_cases::procedure_orchestration::{
    CreateProcedureRequest, ProcedureOrchestrationService,
};
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
    pub billed_amount: Option<i64>,
    pub payment_method: Option<String>,
    pub confirmed_payment_date: Option<String>,
    pub paid_amount: Option<i64>,
    pub payment_status: String,
}

impl RawProcedure {
    /// Converts raw procedure data into a validated domain Procedure.
    /// Unknown `payment_method` / `payment_status` strings fall back to the
    /// `None` variant of each enum (matching legacy behaviour).
    pub fn into_procedure(self) -> anyhow::Result<Procedure> {
        let payment_method = self
            .payment_method
            .as_deref()
            .and_then(|s| s.parse::<PaymentMethod>().ok())
            .unwrap_or_default();
        let payment_status = self
            .payment_status
            .parse::<ProcedureStatus>()
            .unwrap_or_default();

        Procedure::with_id(
            self.id,
            self.patient_id,
            self.fund_id,
            self.procedure_type_id,
            self.procedure_date,
            self.billed_amount,
            payment_method,
            self.confirmed_payment_date,
            self.paid_amount,
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
    billed_amount: Option<i64>,
    service: State<'_, Arc<ProcedureOrchestrationService>>,
) -> Result<Procedure, String> {
    tracing::info!(target: BACKEND, patient_id = %patient_id, "Processing add procedure");

    service
        .create_procedure(CreateProcedureRequest {
            patient_id,
            fund_id,
            procedure_type_id,
            procedure_date,
            billed_amount,
            payment_method: None,
            confirmed_payment_date: None,
            paid_amount: None,
        })
        .await
        .inspect(|procedure| {
            tracing::info!(target: BACKEND, procedure_id = ?procedure.id, "Procedure created successfully");
        })
        .map_err(|e| {
            tracing::error!(target: BACKEND, error = %e, "Failed to create procedure");
            format!("{:#}", e)
        })
}

/// Tauri command: Read all procedures
#[tauri::command]
#[specta::specta]
pub async fn read_all_procedures(
    service: State<'_, Arc<ProcedureOrchestrationService>>,
) -> Result<Vec<Procedure>, String> {
    tracing::info!(target: BACKEND, "Processing read all procedures request");

    service
        .get_all_procedures()
        .await
        .inspect(|procedures| {
            tracing::info!(
                target: BACKEND,
                count = procedures.len(),
                "Retrieved procedures successfully"
            );
        })
        .map_err(|e| {
            tracing::error!(target: BACKEND, error = %e, "Failed to retrieve procedures");
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
    tracing::info!(target: BACKEND, procedure_id = %raw.id, "Processing update procedure");

    // Convert raw data to validated domain object
    let procedure = raw.into_procedure().map_err(|e| {
        tracing::error!(target: BACKEND, error = %e, "Invalid procedure data");
        format!("{:#}", e)
    })?;

    // R18/R26: frontend restricts edits on blocking-status procedures to procedure_type_id only.
    // Log a warning if this invariant is violated (e.g. by a bug or direct API call).
    if procedure.payment_status.is_blocking() {
        tracing::warn!(
            target: BACKEND,
            procedure_id = %procedure.id,
            payment_status = ?procedure.payment_status,
            "update_procedure called on blocking-status procedure - only procedure_type_id should change (R18/R26)"
        );
    }

    service
        .update_procedure(procedure)
        .await
        .inspect(|updated| {
            tracing::info!(target: BACKEND, procedure_id = ?updated.id, "Procedure updated successfully");
        })
        .map_err(|e| {
            tracing::error!(target: BACKEND, error = %e, "Failed to update procedure");
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
    tracing::info!(target: BACKEND, procedure_id = %id, "Processing delete procedure");

    service
        .delete_procedure(&id)
        .await
        .map(|_| {
            tracing::info!(target: BACKEND, procedure_id = %id, "Procedure deleted successfully");
        })
        .map_err(|e| {
            tracing::error!(target: BACKEND, error = %e, "Failed to delete procedure");
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
        target: BACKEND,
        count = procedures.len(),
        "Processing batch procedure validation"
    );

    service
        .validate_batch(procedures)
        .await
        .map(|results| {
            tracing::info!(
                target: BACKEND,
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
            tracing::error!(target: BACKEND, error = %e, "Failed to validate batch procedures");
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
        target: BACKEND,
        count = procedures.len(),
        "Processing batch procedure creation"
    );

    service
        .create_batch(procedures)
        .await
        .map(|procedures| {
            tracing::info!(
                target: BACKEND,
                count = procedures.len(),
                "Batch procedures created successfully"
            );
            CreateBatchProceduresResponse { procedures }
        })
        .map_err(|e| {
            tracing::error!(target: BACKEND, error = %e, "Failed to create batch procedures");
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
    tracing::debug!(target: BACKEND, fund_id = %fund_id, "Processing get unpaid procedures by fund");

    service
        .get_unpaid_by_fund(&fund_id)
        .await
        .inspect(|procedures| {
            tracing::info!(
                target: BACKEND,
                fund_id = %fund_id,
                count = procedures.len(),
                "Retrieved unpaid procedures successfully"
            );
        })
        .map_err(|e| {
            tracing::error!(target: BACKEND, error = %e, "Failed to retrieve unpaid procedures");
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
    tracing::debug!(target: BACKEND, count = ids.len(), "Processing read procedures by IDs");

    service
        .read_procedures_by_ids(ids)
        .await
        .inspect(|procedures| {
            tracing::info!(
                target: BACKEND,
                count = procedures.len(),
                "Retrieved procedures by IDs successfully"
            );
        })
        .map_err(|e| {
            tracing::error!(target: BACKEND, error = %e, "Failed to read procedures by IDs");
            format!("{:#}", e)
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn raw_with(payment_method: Option<&str>, payment_status: &str) -> RawProcedure {
        RawProcedure {
            id: "proc-1".to_string(),
            patient_id: "pat-1".to_string(),
            fund_id: None,
            procedure_type_id: "type-1".to_string(),
            procedure_date: "2026-01-15".to_string(),
            billed_amount: Some(1000),
            payment_method: payment_method.map(|s| s.to_string()),
            confirmed_payment_date: None,
            paid_amount: None,
            payment_status: payment_status.to_string(),
        }
    }

    #[test]
    fn into_procedure_maps_known_payment_method_strings_to_enum() {
        for (raw, expected) in [
            ("CASH", PaymentMethod::Cash),
            ("CHECK", PaymentMethod::Check),
            ("BANK_CARD", PaymentMethod::BankCard),
            ("BANK_TRANSFER", PaymentMethod::BankTransfer),
        ] {
            let procedure = raw_with(Some(raw), "CREATED").into_procedure().unwrap();
            assert_eq!(
                procedure.payment_method, expected,
                "payment_method {raw} must map to {expected:?}"
            );
        }
    }

    #[test]
    fn into_procedure_falls_back_to_payment_method_none_on_unknown_or_missing() {
        let none_when_missing = raw_with(None, "CREATED").into_procedure().unwrap();
        assert_eq!(none_when_missing.payment_method, PaymentMethod::None);

        let none_when_unknown = raw_with(Some("WAT"), "CREATED").into_procedure().unwrap();
        assert_eq!(none_when_unknown.payment_method, PaymentMethod::None);
    }

    #[test]
    fn into_procedure_maps_known_payment_status_strings_to_enum() {
        for (raw, expected) in [
            ("CREATED", ProcedureStatus::Created),
            ("RECONCILIATED", ProcedureStatus::Reconciled),
            ("FUND_PAYED", ProcedureStatus::FundPaid),
            ("DIRECTLY_PAYED", ProcedureStatus::DirectlyPaid),
            ("OVERPAID", ProcedureStatus::Overpaid),
            ("OVERPAYMENT_REFUND", ProcedureStatus::OverpaymentRefund),
        ] {
            let procedure = raw_with(Some("CASH"), raw).into_procedure().unwrap();
            assert_eq!(
                procedure.payment_status, expected,
                "payment_status {raw} must map to {expected:?}"
            );
        }
    }

    #[test]
    fn into_procedure_falls_back_to_payment_status_none_on_unknown() {
        let procedure = raw_with(Some("CASH"), "WAT").into_procedure().unwrap();
        assert_eq!(procedure.payment_status, ProcedureStatus::None);
    }

    #[test]
    fn into_procedure_propagates_with_id_validation_error_on_bad_date() {
        let mut raw = raw_with(Some("CASH"), "CREATED");
        raw.procedure_date = "not-a-date".to_string();
        let err = raw
            .into_procedure()
            .expect_err("malformed date must surface from Procedure::with_id");
        assert!(
            err.to_string().to_ascii_lowercase().contains("date"),
            "error must mention the bad field: {err}"
        );
    }
}

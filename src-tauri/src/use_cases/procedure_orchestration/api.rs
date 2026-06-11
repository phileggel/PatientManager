use crate::context::procedure::{PaymentMethod, Procedure, ProcedureError, ProcedureStatus};
use crate::shared::logger::BACKEND;
use crate::use_cases::procedure_orchestration::{
    CreateProcedureRequest, ProcedureOrchestrationError, ProcedureOrchestrationService,
    ProcedureOrchestrationTask,
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
    #[specta(type = String)]
    pub procedure_date: chrono::NaiveDate,
    pub billed_amount: i64,
    pub payment_method: Option<String>,
    #[specta(type = Option<String>)]
    pub fund_reconciliation_date: Option<chrono::NaiveDate>,
    #[specta(type = Option<String>)]
    pub confirmed_payment_date: Option<chrono::NaiveDate>,
    pub paid_amount: Option<i64>,
    pub payment_status: String,
}

impl RawProcedure {
    /// Converts raw procedure data into a validated domain Procedure.
    /// Unknown `payment_method` / `payment_status` strings fall back to the
    /// `None` variant of each enum (matching legacy behaviour).
    pub fn into_procedure(self) -> Result<Procedure, ProcedureError> {
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
            self.fund_reconciliation_date,
            self.confirmed_payment_date,
            self.paid_amount,
            payment_status,
        )
    }
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
    billed_amount: i64,
    service: State<'_, Arc<ProcedureOrchestrationService>>,
) -> Result<Procedure, ProcedureOrchestrationError> {
    tracing::info!(target: BACKEND, patient_id = %patient_id, "Processing add procedure");

    // reviewer-arch FP: malformed-date case is now compile-time-checked via
    // NaiveDate + #[specta(type = String)] on the wire; Serde deserialization
    // isn't our test surface — see PR #44.
    let procedure_date = chrono::NaiveDate::parse_from_str(&procedure_date, "%Y-%m-%d")
        .map_err(|_| ProcedureOrchestrationTask::InvalidProcedureDate)?;

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
}

/// Tauri command: Read all procedures
#[tauri::command]
#[specta::specta]
pub async fn read_all_procedures(
    service: State<'_, Arc<ProcedureOrchestrationService>>,
) -> Result<Vec<Procedure>, ProcedureOrchestrationError> {
    tracing::info!(target: BACKEND, "Processing read all procedures request");

    service.get_all_procedures().await.inspect(|procedures| {
        tracing::info!(
            target: BACKEND,
            count = procedures.len(),
            "Retrieved procedures successfully"
        );
    })
}

/// Tauri command: Update an existing procedure
#[tauri::command]
#[specta::specta]
pub async fn update_procedure(
    raw: RawProcedure,
    service: State<'_, Arc<ProcedureOrchestrationService>>,
) -> Result<Procedure, ProcedureOrchestrationError> {
    tracing::info!(target: BACKEND, procedure_id = %raw.id, "Processing update procedure");

    // Convert raw data to validated domain object
    let procedure = raw.into_procedure()?;

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
}

/// Tauri command: Delete a procedure
#[tauri::command]
#[specta::specta]
pub async fn delete_procedure(
    id: String,
    service: State<'_, Arc<ProcedureOrchestrationService>>,
) -> Result<(), ProcedureOrchestrationError> {
    tracing::info!(target: BACKEND, procedure_id = %id, "Processing delete procedure");

    service.delete_procedure(&id).await.inspect(|()| {
        tracing::info!(target: BACKEND, procedure_id = %id, "Procedure deleted successfully");
    })
}

/// Tauri command: Get unpaid procedures by fund
#[tauri::command]
#[specta::specta]
pub async fn get_unpaid_procedures_by_fund(
    fund_id: String,
    service: State<'_, Arc<ProcedureOrchestrationService>>,
) -> Result<Vec<Procedure>, ProcedureOrchestrationError> {
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
}

/// Tauri command: Get procedures by their IDs
#[tauri::command]
#[specta::specta]
pub async fn read_procedures_by_ids(
    ids: Vec<String>,
    service: State<'_, Arc<ProcedureOrchestrationService>>,
) -> Result<Vec<Procedure>, ProcedureOrchestrationError> {
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
            procedure_date: chrono::NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
            billed_amount: 1000,
            payment_method: payment_method.map(|s| s.to_string()),
            fund_reconciliation_date: None,
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
}

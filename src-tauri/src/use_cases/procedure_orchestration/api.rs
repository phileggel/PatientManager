use crate::context::fund::FundError;
use crate::context::procedure::{PaymentMethod, Procedure, ProcedureError, ProcedureStatus};
use crate::shared::logger::BACKEND;
use crate::use_cases::procedure_orchestration::{
    CreateProcedureRequest, DeletionOrchestrator, ProcedureEdit, ProcedureOrchestrationError,
    ProcedureOrchestrationService,
};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::sync::Arc;
use tauri::State;

// ============ Domain-Relevant Types (Kept) ============

/// Raw healthcare procedure data from frontend (unvalidated)
/// Used for updating an existing procedure with data from an external source
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields)]
pub struct RawProcedure {
    pub id: String,
    pub patient_id: String,
    pub fund_id: Option<String>,
    pub procedure_type_id: String,
    /// As the form sent it (YYYY-MM-DD, or empty): `Procedure::read_form` judges it (PRO-125).
    pub procedure_date: String,
    pub billed_amount: i64,
    pub payment_method: Option<String>,
    #[specta(type = Option<String>)]
    pub fund_reconciliation_date: Option<chrono::NaiveDate>,
    #[specta(type = Option<String>)]
    pub confirmed_payment_date: Option<chrono::NaiveDate>,
    pub paid_amount: Option<i64>,
    /// Typed, so the wire spelling the screen read is the one it sends back (TODO-030).
    pub payment_status: ProcedureStatus,
}

impl RawProcedure {
    /// Converts raw procedure data into a validated domain Procedure, every
    /// refused field at once (PRO-125). An unknown `payment_method` string falls
    /// back to `None` (legacy behaviour); the status arrives typed.
    pub fn into_procedure(self) -> Result<Procedure, ProcedureError> {
        let procedure_date = Procedure::read_form(
            &self.patient_id,
            &self.procedure_type_id,
            &self.procedure_date,
        )?;
        let payment_method = self
            .payment_method
            .as_deref()
            .and_then(|s| s.parse::<PaymentMethod>().ok())
            .unwrap_or_default();

        Procedure::with_id(
            self.id,
            self.patient_id,
            self.fund_id,
            self.procedure_type_id,
            procedure_date,
            self.billed_amount,
            payment_method,
            self.fund_reconciliation_date,
            self.confirmed_payment_date,
            self.paid_amount,
            self.payment_status,
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

    let procedure_date = Procedure::read_form(&patient_id, &procedure_type_id, &procedure_date)?;

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
) -> Result<ProcedureEdit, ProcedureOrchestrationError> {
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
        .edit_procedure(procedure)
        .await
        .inspect(|edit| match edit {
            ProcedureEdit::Updated { procedure } => {
                tracing::info!(target: BACKEND, procedure_id = ?procedure.id, "Procedure updated successfully");
            }
            ProcedureEdit::Unchanged => {
                tracing::info!(target: BACKEND, "Procedure unchanged, nothing written");
            }
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

/// PRO-280 — delete a procedure type; the patients' defaults that name it go.
#[tauri::command]
#[specta::specta]
pub async fn delete_procedure_type(
    id: String,
    orchestrator: State<'_, Arc<DeletionOrchestrator>>,
) -> Result<(), ProcedureError> {
    tracing::info!(target: BACKEND, procedure_type_id = %id, "Processing delete procedure type request");
    orchestrator.delete_procedure_type(&id).await
}

/// PRO-290 — delete a fund; the patients' defaults that name it go.
#[tauri::command]
#[specta::specta]
pub async fn delete_fund(
    id: String,
    orchestrator: State<'_, Arc<DeletionOrchestrator>>,
) -> Result<(), FundError> {
    tracing::info!(target: BACKEND, fund_id = %id, "Processing delete fund request");
    orchestrator.delete_fund(&id).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn raw_with(payment_method: Option<&str>, payment_status: ProcedureStatus) -> RawProcedure {
        RawProcedure {
            id: "proc-1".to_string(),
            patient_id: "pat-1".to_string(),
            fund_id: None,
            procedure_type_id: "type-1".to_string(),
            procedure_date: "2026-01-15".to_string(),
            billed_amount: 1000,
            payment_method: payment_method.map(|s| s.to_string()),
            fund_reconciliation_date: None,
            confirmed_payment_date: None,
            paid_amount: None,
            payment_status,
        }
    }

    #[test]
    fn pro_125_update_refuses_every_missing_field_at_once() {
        let mut raw = raw_with(None, ProcedureStatus::Created);
        raw.patient_id = String::new();
        raw.procedure_date = String::new();
        let err = raw.into_procedure().unwrap_err();
        assert!(matches!(
            err,
            ProcedureError::ProcedureInvalid { ref reasons }
                if reasons == &vec![
                    crate::context::procedure::ProcedureInvalidReason::PatientIdEmpty,
                    crate::context::procedure::ProcedureInvalidReason::ProcedureDateEmpty,
                ]
        ));
    }

    #[test]
    fn into_procedure_maps_known_payment_method_strings_to_enum() {
        for (raw, expected) in [
            ("CASH", PaymentMethod::Cash),
            ("CHECK", PaymentMethod::Check),
            ("BANK_CARD", PaymentMethod::BankCard),
            ("BANK_TRANSFER", PaymentMethod::BankTransfer),
        ] {
            let procedure = raw_with(Some(raw), ProcedureStatus::Created)
                .into_procedure()
                .unwrap();
            assert_eq!(
                procedure.payment_method, expected,
                "payment_method {raw} must map to {expected:?}"
            );
        }
    }

    #[test]
    fn into_procedure_falls_back_to_payment_method_none_on_unknown_or_missing() {
        let none_when_missing = raw_with(None, ProcedureStatus::Created)
            .into_procedure()
            .unwrap();
        assert_eq!(none_when_missing.payment_method, PaymentMethod::None);

        let none_when_unknown = raw_with(Some("WAT"), ProcedureStatus::Created)
            .into_procedure()
            .unwrap();
        assert_eq!(none_when_unknown.payment_method, PaymentMethod::None);
    }

    /// TODO-030 — the status as the screen sends it back: the wire spelling of what it read.
    #[test]
    fn pro_250_update_keeps_every_status_the_screen_sends() {
        for (wire, expected) in [
            ("NONE", ProcedureStatus::None),
            ("CREATED", ProcedureStatus::Created),
            ("RECONCILED", ProcedureStatus::Reconciled),
            ("PARTIALLY_RECONCILED", ProcedureStatus::PartiallyReconciled),
            ("DIRECTLY_PAID", ProcedureStatus::DirectlyPaid),
            ("FUND_PAID", ProcedureStatus::FundPaid),
            ("PARTIALLY_FUND_PAID", ProcedureStatus::PartiallyFundPaid),
            ("IMPORT_DIRECTLY_PAID", ProcedureStatus::ImportDirectlyPaid),
            ("IMPORT_FUND_PAID", ProcedureStatus::ImportFundPaid),
            ("OVERPAID", ProcedureStatus::Overpaid),
            ("OVERPAYMENT_REFUND", ProcedureStatus::OverpaymentRefund),
        ] {
            let sent = serde_json::json!({
                "id": "proc-1", "patient_id": "pat-1", "fund_id": null,
                "procedure_type_id": "type-1", "procedure_date": "2026-01-15",
                "billed_amount": 1000, "payment_method": "CASH",
                "fund_reconciliation_date": null, "confirmed_payment_date": null,
                "paid_amount": 1000, "payment_status": wire,
            });
            let raw: RawProcedure = serde_json::from_value(sent).unwrap();
            let procedure = raw.into_procedure().unwrap();
            assert_eq!(
                procedure.payment_status, expected,
                "status {wire} must be kept"
            );
        }
    }

    /// TODO-030, PRO-255 — a reconciled procedure sent back as the screen read it is the
    /// stored one, so an edit that changes nothing is answered unchanged.
    #[test]
    fn pro_255_a_paid_procedure_sent_back_as_read_is_unchanged() {
        let date = |d| chrono::NaiveDate::from_ymd_opt(2026, 1, d).unwrap();
        let stored = Procedure::with_id(
            "proc-1".to_string(),
            "pat-1".to_string(),
            Some("fund-1".to_string()),
            "type-1".to_string(),
            date(15),
            45_000,
            PaymentMethod::BankTransfer,
            Some(date(20)),
            Some(date(22)),
            Some(45_000),
            ProcedureStatus::Reconciled,
        )
        .unwrap();
        let read = serde_json::to_value(&stored).unwrap();
        let sent: RawProcedure = serde_json::from_value(read).unwrap();
        let rebuilt = sent.into_procedure().unwrap();
        assert_eq!(rebuilt, stored);
    }
}

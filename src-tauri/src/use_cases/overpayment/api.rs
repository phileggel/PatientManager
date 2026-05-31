use std::sync::Arc;

use tauri::State;

use crate::shared::logger::BACKEND;

use super::domain::{CancelOverpaymentRequest, CreateOverpaymentRequest, ProcedureRefundInfo};
use super::error::OverpaymentError;
use super::orchestrator::OverpaymentOrchestrator;

/// REF-050/REF-090-REF-160 — Create an overpayment refund for the given source procedure.
#[tauri::command]
#[specta::specta]
pub async fn create_overpayment(
    request: CreateOverpaymentRequest,
    orchestrator: State<'_, Arc<OverpaymentOrchestrator>>,
) -> Result<(), OverpaymentError> {
    tracing::info!(
        target: BACKEND,
        source_procedure_id = %request.source_procedure_id,
        "Processing create_overpayment command"
    );
    orchestrator.create_overpayment(request).await
}

/// REF-210 — Cancel an overpayment refund (reverse creation cascade).
#[tauri::command]
#[specta::specta]
pub async fn cancel_overpayment(
    request: CancelOverpaymentRequest,
    orchestrator: State<'_, Arc<OverpaymentOrchestrator>>,
) -> Result<(), OverpaymentError> {
    tracing::info!(
        target: BACKEND,
        source_procedure_id = %request.source_procedure_id,
        "Processing cancel_overpayment command"
    );
    orchestrator
        .cancel_overpayment(&request.source_procedure_id)
        .await
}

/// REF-200 — Fetch ProcedureRefund by refund_procedure_id.
/// Used by the OverpaymentRefund modal to resolve source_procedure_id before cancel
/// (the modal only holds the refund procedure's own ID).
#[tauri::command]
#[specta::specta]
pub async fn get_procedure_refund_by_refund_procedure(
    refund_procedure_id: String,
    orchestrator: State<'_, Arc<OverpaymentOrchestrator>>,
) -> Result<Option<ProcedureRefundInfo>, OverpaymentError> {
    tracing::info!(
        target: BACKEND,
        refund_procedure_id = %refund_procedure_id,
        "Processing get_procedure_refund_by_refund_procedure command"
    );
    orchestrator
        .get_procedure_refund_by_refund_procedure(&refund_procedure_id)
        .await
}

/// REF-200 — Fetch ProcedureRefund by source_procedure_id.
/// Used by the OverpaymentRefund modal to resolve source_procedure_id before cancel.
#[tauri::command]
#[specta::specta]
pub async fn get_procedure_refund_by_source(
    source_procedure_id: String,
    orchestrator: State<'_, Arc<OverpaymentOrchestrator>>,
) -> Result<Option<ProcedureRefundInfo>, OverpaymentError> {
    tracing::info!(
        target: BACKEND,
        source_procedure_id = %source_procedure_id,
        "Processing get_procedure_refund_by_source command"
    );
    orchestrator
        .get_procedure_refund_by_source(&source_procedure_id)
        .await
}

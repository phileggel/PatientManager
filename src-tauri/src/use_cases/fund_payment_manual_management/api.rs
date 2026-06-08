use std::sync::Arc;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::State;

use super::error::{FundPaymentManualManagementError, FundPaymentManualManagementTask};
use super::FundPaymentManualManagementOrchestrator;
use crate::context::fund::FundPaymentGroup;
use crate::context::procedure::Procedure;
use crate::shared::logger::BACKEND;

/// Response for the edit modal: procedures in the group + procedures available to add
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FundPaymentGroupEditData {
    /// Procedures currently in the group (Reconciled / PartiallyReconciled)
    pub current_procedures: Vec<Procedure>,
    /// Created procedures for the same fund not yet in the group
    pub available_procedures: Vec<Procedure>,
}

/// Tauri command: Delete a fund payment group with procedure cleanup
///
/// Deletes the group, its lines, and resets associated procedures
/// (status → Created, clears confirmed_payment_date and paid_amount).
/// REF-240: Rejects deletion if the group belongs to an overpayment refund cascade.
#[tauri::command]
#[specta::specta]
pub async fn delete_fund_payment_group(
    group_id: String,
    orchestrator: State<'_, Arc<FundPaymentManualManagementOrchestrator>>,
    overpayment_orchestrator: State<
        '_,
        Arc<crate::use_cases::overpayment::OverpaymentOrchestrator>,
    >,
) -> Result<(), FundPaymentManualManagementError> {
    tracing::info!(target: BACKEND, group_id = %group_id, "Processing delete fund payment group request");

    // REF-240 cross-call into the overpayment use case. We branch on the raw
    // boolean and map into this use case's own Task vocabulary, so no overpayment
    // error type crosses the use-case boundary (B18).
    let is_refund = overpayment_orchestrator
        .is_refund_fund_payment_group(&group_id)
        .await
        .map_err(|_| FundPaymentManualManagementTask::DatabaseError)?;
    if is_refund {
        return Err(FundPaymentManualManagementTask::RefundGroupProtected.into());
    }

    orchestrator
        .delete_group_with_cleanup(&group_id)
        .await
        .inspect(|_| {
            tracing::info!(target: BACKEND, group_id = %group_id, "Fund payment group deleted with cleanup");
        })
}

/// Tauri command: Create a fund payment group from manual UI selection
///
/// Calculates total_amount from procedure amounts and sets procedures to Reconciled.
#[tauri::command]
#[specta::specta]
pub async fn create_fund_payment_group(
    fund_id: String,
    payment_date: String,
    procedure_ids: Vec<String>,
    orchestrator: State<'_, Arc<FundPaymentManualManagementOrchestrator>>,
) -> Result<FundPaymentGroup, FundPaymentManualManagementError> {
    tracing::info!(
        target: BACKEND,
        fund_id = %fund_id,
        payment_date = %payment_date,
        procedure_count = procedure_ids.len(),
        "Processing create fund payment group request"
    );

    orchestrator
        .create_group(fund_id, payment_date, procedure_ids)
        .await
        .inspect(|group| {
            tracing::info!(target: BACKEND, group_id = %group.id, "Fund payment group created successfully");
        })
}

/// Tauri command: Update a fund payment group with new procedures
///
/// Handles add/remove procedure logic via orchestrator:
/// - Removed procedures → reset to Created
/// - Added procedures → set to Reconciled
/// - Recalculates total_amount
/// - Rejects if any procedure is bank-reconciled (FundPaid/PartiallyFundPaid)
#[tauri::command]
#[specta::specta]
pub async fn update_fund_payment_group_with_procedures(
    group_id: String,
    payment_date: String,
    procedure_ids: Vec<String>,
    orchestrator: State<'_, Arc<FundPaymentManualManagementOrchestrator>>,
) -> Result<FundPaymentGroup, FundPaymentManualManagementError> {
    tracing::info!(
        target: BACKEND,
        group_id = %group_id,
        payment_date = %payment_date,
        procedure_count = procedure_ids.len(),
        "Processing update fund payment group request"
    );

    orchestrator
        .update_group(group_id, payment_date, procedure_ids)
        .await
        .inspect(|group| {
            tracing::info!(target: BACKEND, group_id = %group.id, "Fund payment group updated successfully");
        })
}

/// Tauri command: Get edit data for a fund payment group
///
/// Returns two classified lists server-side so the frontend only handles display:
/// - `current_procedures`: in the group (Reconciled / PartiallyReconciled)
/// - `available_procedures`: Created procedures for the same fund, not in the group
#[tauri::command]
#[specta::specta]
pub async fn get_fund_payment_group_edit_data(
    group_id: String,
    fund_id: String,
    orchestrator: State<'_, Arc<FundPaymentManualManagementOrchestrator>>,
) -> Result<FundPaymentGroupEditData, FundPaymentManualManagementError> {
    tracing::info!(
        target: BACKEND,
        group_id = %group_id,
        fund_id = %fund_id,
        "Processing get fund payment group edit data request"
    );

    let (current_procedures, available_procedures) = orchestrator
        .get_group_edit_data(&group_id, &fund_id)
        .await?;

    tracing::info!(
        target: BACKEND,
        group_id = %group_id,
        current_count = current_procedures.len(),
        available_count = available_procedures.len(),
        "Fund payment group edit data retrieved successfully"
    );

    Ok(FundPaymentGroupEditData {
        current_procedures,
        available_procedures,
    })
}

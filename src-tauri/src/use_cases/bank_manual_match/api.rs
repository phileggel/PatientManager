use std::sync::Arc;

use tauri::State;

use crate::context::bank::BankTransferType;

use super::orchestrator::{
    BankManualMatchOrchestrator, BankManualMatchResult, DirectPaymentProcedureCandidate,
    FundGroupCandidate,
};

// ======================================================================
// FUND transfers
// ======================================================================

/// R6 — Return Active fund payment groups within the 7-day window of transfer_date.
#[tauri::command]
#[specta::specta]
pub async fn get_unsettled_fund_groups(
    transfer_date: String,
    orchestrator: State<'_, Arc<BankManualMatchOrchestrator>>,
) -> Result<Vec<FundGroupCandidate>, String> {
    orchestrator
        .get_unsettled_fund_groups(&transfer_date)
        .await
        .map_err(|e| format!("{:#}", e))
}

/// R12 — Return all Active fund payment groups (no date constraint).
#[tauri::command]
#[specta::specta]
pub async fn get_all_unsettled_fund_groups(
    orchestrator: State<'_, Arc<BankManualMatchOrchestrator>>,
) -> Result<Vec<FundGroupCandidate>, String> {
    orchestrator
        .get_all_unsettled_fund_groups()
        .await
        .map_err(|e| format!("{:#}", e))
}

/// R7 — Create a FUND bank transfer linked to the given group IDs.
#[tauri::command]
#[specta::specta]
pub async fn create_fund_transfer(
    bank_account_id: String,
    transfer_date: String,
    group_ids: Vec<String>,
    orchestrator: State<'_, Arc<BankManualMatchOrchestrator>>,
) -> Result<BankManualMatchResult, String> {
    orchestrator
        .create_fund_transfer(bank_account_id, transfer_date, group_ids)
        .await
        .map_err(|e| format!("{:#}", e))
}

/// R9 — Update a FUND transfer: change date and/or linked groups.
#[tauri::command]
#[specta::specta]
pub async fn update_fund_transfer(
    transfer_id: String,
    new_transfer_date: String,
    new_group_ids: Vec<String>,
    orchestrator: State<'_, Arc<BankManualMatchOrchestrator>>,
) -> Result<BankManualMatchResult, String> {
    orchestrator
        .update_fund_transfer(transfer_id, new_transfer_date, new_group_ids)
        .await
        .map_err(|e| format!("{:#}", e))
}

/// R8 — Delete a FUND transfer: revert linked groups to Active, hard-delete transfer.
#[tauri::command]
#[specta::specta]
pub async fn delete_fund_transfer(
    transfer_id: String,
    orchestrator: State<'_, Arc<BankManualMatchOrchestrator>>,
) -> Result<(), String> {
    orchestrator
        .delete_fund_transfer(transfer_id)
        .await
        .map_err(|e| format!("{:#}", e))
}

// ======================================================================
// Direct payments (CHECK / CREDIT_CARD / CASH)
// ======================================================================

/// R14 — Return CREATED procedures within the 7-day window of payment_date.
#[tauri::command]
#[specta::specta]
pub async fn get_eligible_procedures_for_direct_payment(
    payment_date: String,
    orchestrator: State<'_, Arc<BankManualMatchOrchestrator>>,
) -> Result<Vec<DirectPaymentProcedureCandidate>, String> {
    orchestrator
        .get_eligible_procedures_for_direct_payment(&payment_date)
        .await
        .map_err(|e| format!("{:#}", e))
}

/// R20 — Return all CREATED procedures (no date constraint).
#[tauri::command]
#[specta::specta]
pub async fn get_all_eligible_procedures_for_direct_payment(
    orchestrator: State<'_, Arc<BankManualMatchOrchestrator>>,
) -> Result<Vec<DirectPaymentProcedureCandidate>, String> {
    orchestrator
        .get_all_eligible_procedures_for_direct_payment()
        .await
        .map_err(|e| format!("{:#}", e))
}

/// R15 — Create a direct payment transfer linked to the given procedure IDs.
#[tauri::command]
#[specta::specta]
pub async fn create_direct_transfer(
    bank_account_id: String,
    transfer_date: String,
    transfer_type: BankTransferType,
    procedure_ids: Vec<String>,
    orchestrator: State<'_, Arc<BankManualMatchOrchestrator>>,
) -> Result<BankManualMatchResult, String> {
    orchestrator
        .create_direct_transfer(bank_account_id, transfer_date, transfer_type, procedure_ids)
        .await
        .map_err(|e| format!("{:#}", e))
}

/// R17 — Update a direct transfer: change date and/or linked procedures.
#[tauri::command]
#[specta::specta]
pub async fn update_direct_transfer(
    transfer_id: String,
    new_transfer_date: String,
    new_procedure_ids: Vec<String>,
    orchestrator: State<'_, Arc<BankManualMatchOrchestrator>>,
) -> Result<BankManualMatchResult, String> {
    orchestrator
        .update_direct_transfer(transfer_id, new_transfer_date, new_procedure_ids)
        .await
        .map_err(|e| format!("{:#}", e))
}

/// R16 — Delete a direct transfer: revert procedures to Created, hard-delete transfer.
#[tauri::command]
#[specta::specta]
pub async fn delete_direct_transfer(
    transfer_id: String,
    orchestrator: State<'_, Arc<BankManualMatchOrchestrator>>,
) -> Result<(), String> {
    orchestrator
        .delete_direct_transfer(transfer_id)
        .await
        .map_err(|e| format!("{:#}", e))
}

// ======================================================================
// Read helpers
// ======================================================================

/// Return the fund group IDs linked to a FUND transfer.
#[tauri::command]
#[specta::specta]
pub async fn get_transfer_fund_group_ids(
    transfer_id: String,
    orchestrator: State<'_, Arc<BankManualMatchOrchestrator>>,
) -> Result<Vec<String>, String> {
    orchestrator
        .get_transfer_fund_group_ids(&transfer_id)
        .await
        .map_err(|e| format!("{:#}", e))
}

/// Return the procedure IDs linked to a direct payment transfer.
#[tauri::command]
#[specta::specta]
pub async fn get_transfer_procedure_ids(
    transfer_id: String,
    orchestrator: State<'_, Arc<BankManualMatchOrchestrator>>,
) -> Result<Vec<String>, String> {
    orchestrator
        .get_transfer_procedure_ids(&transfer_id)
        .await
        .map_err(|e| format!("{:#}", e))
}

/// R21 — Return fund group candidates by IDs for the edit modal (groups are BankPayed).
#[tauri::command]
#[specta::specta]
pub async fn get_fund_groups_by_ids(
    group_ids: Vec<String>,
    orchestrator: State<'_, Arc<BankManualMatchOrchestrator>>,
) -> Result<Vec<FundGroupCandidate>, String> {
    orchestrator
        .get_fund_groups_by_ids(group_ids)
        .await
        .map_err(|e| format!("{:#}", e))
}

/// R21 — Return procedure candidates by IDs for the edit modal (procedures are DirectlyPayed).
#[tauri::command]
#[specta::specta]
pub async fn get_procedures_by_ids(
    procedure_ids: Vec<String>,
    orchestrator: State<'_, Arc<BankManualMatchOrchestrator>>,
) -> Result<Vec<DirectPaymentProcedureCandidate>, String> {
    orchestrator
        .get_procedures_by_ids(procedure_ids)
        .await
        .map_err(|e| format!("{:#}", e))
}

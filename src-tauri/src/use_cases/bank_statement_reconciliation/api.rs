use crate::shared::logger::BACKEND;
use std::sync::Arc;

use tauri::State;

use crate::context::bank::BankAccount;

use super::bank_pdf_codec::BankStatementParseResult;
use super::error::BankStatementReconciliationError;
use super::label_mapping_repo::BankFundLabelMapping;
use super::orchestrator::BankStatementOrchestrator;
use super::reconciliation::{BankStatementCorrection, BankStatementReconciliation, FundAssignment};

/// Parse a bank statement PDF and return structured data
#[tauri::command]
#[specta::specta]
pub async fn parse_bank_statement(
    file_path: String,
    orchestrator: State<'_, Arc<BankStatementOrchestrator>>,
) -> Result<BankStatementParseResult, BankStatementReconciliationError> {
    tracing::info!(target: BACKEND, "Starting bank statement parsing");
    orchestrator.parse_bank_statement(&file_path)
}

/// Resolve a bank account from IBAN
#[tauri::command]
#[specta::specta]
pub async fn resolve_bank_account_from_iban(
    iban: String,
    orchestrator: State<'_, Arc<BankStatementOrchestrator>>,
) -> Result<Option<BankAccount>, BankStatementReconciliationError> {
    orchestrator.resolve_bank_account_from_iban(&iban).await
}

/// BAS-064 — compute the ephemeral bank-statement reconciliation.
///
/// Pure read-only: no DB writes. The reconciliation is never persisted; the
/// frontend re-calls on every correction and every revert (BAS-065).
#[tauri::command]
#[specta::specta]
pub async fn compute_bank_statement_reconciliation(
    bank_account_id: String,
    parse_result: BankStatementParseResult,
    corrections: Vec<BankStatementCorrection>,
    orchestrator: State<'_, Arc<BankStatementOrchestrator>>,
) -> Result<BankStatementReconciliation, BankStatementReconciliationError> {
    orchestrator
        .compute_reconciliation(&bank_account_id, &parse_result, &corrections)
        .await
}

/// BAS-063/035/070–073/093 — commit the reconciliation (validate).
///
/// Recomputes the reconciliation server-side, upserts label mappings, creates N bank
/// entries per multi-group line, and locks settled groups. Returns the count of
/// `BankEntry` records created.
#[tauri::command]
#[specta::specta]
pub async fn validate_bank_statement_reconciliation(
    bank_account_id: String,
    parse_result: BankStatementParseResult,
    corrections: Vec<BankStatementCorrection>,
    orchestrator: State<'_, Arc<BankStatementOrchestrator>>,
) -> Result<u32, BankStatementReconciliationError> {
    orchestrator
        .validate_reconciliation(&bank_account_id, &parse_result, &corrections)
        .await
}

/// BAS-041 — every saved bank label → fund mapping, all accounts.
#[tauri::command]
#[specta::specta]
pub async fn list_bank_label_mappings(
    orchestrator: State<'_, Arc<BankStatementOrchestrator>>,
) -> Result<Vec<BankFundLabelMapping>, BankStatementReconciliationError> {
    orchestrator.list_label_mappings().await
}

/// BAS-042 — reassign a saved mapping to another fund or to rejected.
#[tauri::command]
#[specta::specta]
pub async fn reassign_bank_label_mapping(
    id: String,
    assignment: FundAssignment,
    orchestrator: State<'_, Arc<BankStatementOrchestrator>>,
) -> Result<BankFundLabelMapping, BankStatementReconciliationError> {
    tracing::info!(target: BACKEND, mapping_id = %id, "Reassigning bank label mapping");
    orchestrator.reassign_label_mapping(&id, assignment).await
}

/// BAS-043 — delete a saved mapping; the label is unknown at the next import.
#[tauri::command]
#[specta::specta]
pub async fn delete_bank_label_mapping(
    id: String,
    orchestrator: State<'_, Arc<BankStatementOrchestrator>>,
) -> Result<(), BankStatementReconciliationError> {
    tracing::info!(target: BACKEND, mapping_id = %id, "Deleting bank label mapping");
    orchestrator.delete_label_mapping(&id).await
}

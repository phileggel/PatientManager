use crate::shared::logger::BACKEND;
use std::sync::Arc;

use tauri::State;

use crate::context::bank::BankAccount;

use super::bank_pdf_codec::BankStatementParseResult;
use super::error::BankStatementReconciliationError;
use super::orchestrator::BankStatementOrchestrator;
use super::reconciliation::{BankStatementCorrection, BankStatementReconciliation};

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

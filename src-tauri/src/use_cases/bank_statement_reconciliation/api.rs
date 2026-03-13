use std::sync::Arc;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::State;

use crate::context::bank::BankAccount;
use crate::use_cases::fund_payment_reconciliation::parsing::pdf_extractor;

use super::orchestrator::{
    BankStatementMatchResult, BankStatementOrchestrator, BankStatementReconciliationConfig,
    ConfirmedMatch, FundLabelResolution, ResolvedCreditLine,
};
use super::parser::{self, BankStatementParseResult};

/// Request to save label mappings
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SaveLabelMappingRequest {
    pub bank_label: String,
    pub fund_id: String,
}

/// Request to create transfers from confirmed matches
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CreateTransfersFromStatementRequest {
    pub bank_account_id: String,
    pub confirmed_matches: Vec<ConfirmedMatch>,
}

/// Parse a bank statement PDF and return structured data
#[tauri::command]
#[specta::specta]
pub async fn parse_bank_statement(bytes: Vec<u8>) -> Result<BankStatementParseResult, String> {
    tracing::info!("Starting bank statement parsing ({} bytes)", bytes.len());

    // Step 1: Extract text from PDF
    let text = pdf_extractor::extract_pdf_text_from_bytes(&bytes)
        .map_err(|e| format!("Failed to extract PDF text: {}", e))?;

    tracing::info!("PDF text extracted: {} characters", text.len());

    // Step 2: Parse the extracted text
    let result = parser::parse_bank_statement(&text);

    tracing::info!(
        iban = ?result.iban,
        credit_lines = result.credit_lines.len(),
        total_credits = result.total_credits,
        "Bank statement parsed successfully"
    );

    Ok(result)
}

/// Resolve a bank account from IBAN
#[tauri::command]
#[specta::specta]
pub async fn resolve_bank_account_from_iban(
    iban: String,
    orchestrator: State<'_, Arc<BankStatementOrchestrator>>,
) -> Result<Option<BankAccount>, String> {
    orchestrator
        .resolve_bank_account_from_iban(&iban)
        .await
        .map_err(|e| format!("{:#}", e))
}

/// Resolve fund labels for a bank account
#[tauri::command]
#[specta::specta]
pub async fn resolve_bank_fund_labels(
    bank_account_id: String,
    labels: Vec<String>,
    orchestrator: State<'_, Arc<BankStatementOrchestrator>>,
) -> Result<Vec<FundLabelResolution>, String> {
    orchestrator
        .resolve_fund_labels(&bank_account_id, labels)
        .await
        .map_err(|e| format!("{:#}", e))
}

/// Save confirmed fund label mappings
#[tauri::command]
#[specta::specta]
pub async fn save_bank_fund_label_mappings(
    bank_account_id: String,
    mappings: Vec<SaveLabelMappingRequest>,
    orchestrator: State<'_, Arc<BankStatementOrchestrator>>,
) -> Result<(), String> {
    let mapping_tuples: Vec<(String, String)> = mappings
        .into_iter()
        .map(|m| (m.bank_label, m.fund_id))
        .collect();

    orchestrator
        .save_label_mappings(&bank_account_id, mapping_tuples)
        .await
        .map_err(|e| format!("{:#}", e))
}

/// Match resolved credit lines against unsettled fund payment groups
#[tauri::command]
#[specta::specta]
pub async fn match_bank_statement_lines(
    resolved_lines: Vec<ResolvedCreditLine>,
    orchestrator: State<'_, Arc<BankStatementOrchestrator>>,
) -> Result<BankStatementMatchResult, String> {
    orchestrator
        .match_against_unsettled_groups(resolved_lines)
        .await
        .map_err(|e| format!("{:#}", e))
}

/// Create bank transfers from confirmed matches
#[tauri::command]
#[specta::specta]
pub async fn create_bank_transfers_from_statement(
    bank_account_id: String,
    confirmed_matches: Vec<ConfirmedMatch>,
    orchestrator: State<'_, Arc<BankStatementOrchestrator>>,
) -> Result<u32, String> {
    orchestrator
        .create_transfers(&bank_account_id, confirmed_matches)
        .await
        .map_err(|e| format!("{:#}", e))
}

/// Get bank statement reconciliation configuration
#[tauri::command]
#[specta::specta]
pub fn get_bank_statement_reconciliation_config() -> BankStatementReconciliationConfig {
    BankStatementReconciliationConfig::instance()
}

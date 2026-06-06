use crate::shared::logger::BACKEND;
use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::State;

use crate::use_cases::excel_import::amount_mapping_repo::{
    ExcelAmountMapping, ExcelAmountMappingRepository, SaveExcelAmountMappingRequest,
    SqliteExcelAmountMappingRepository,
};
use crate::use_cases::excel_import::error::ExcelImportError;
use crate::use_cases::excel_import::excel_codec::{
    ExcelFund, ExcelPatient, ExcelProcedure, ParsedExcelData, ParsingIssues, SkippedRow,
};
use crate::use_cases::excel_import::orchestrator::ExcelImportOrchestrator;
use crate::use_cases::excel_import::parser::ExcelParserService;

// ============ Response Types ============

/// Parsed Excel file with metadata (total record count)
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ParseExcelResponse {
    pub patients: Vec<ExcelPatient>,
    pub funds: Vec<ExcelFund>,
    pub procedures: Vec<ExcelProcedure>,
    pub total_records: u32,
    pub parsing_issues: ParsingIssues,
}

impl From<ParsedExcelData> for ParseExcelResponse {
    fn from(data: ParsedExcelData) -> Self {
        let total_records = (data.patients.len() + data.funds.len() + data.procedures.len()) as u32;
        ParseExcelResponse {
            patients: data.patients,
            funds: data.funds,
            procedures: data.procedures,
            total_records,
            parsing_issues: data.parsing_issues,
        }
    }
}

/// Result of a completed Excel import execution
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ImportExecutionResult {
    pub patients_created: u32,
    pub patients_reused: u32,
    pub funds_created: u32,
    pub funds_reused: u32,
    pub procedures_created: u32,
    /// Counter of skipped procedures. Covers parse-time mapping skips (R25)
    /// AND execute-time row skips (EXI-280/281); only the latter are
    /// itemised in `skipped_procedures` below.
    pub procedures_skipped: u32,
    pub procedures_deleted: u32,
    /// Months (YYYY-MM) that were blocked because they contain reconciliated/fund-payed procedures.
    pub blocked_months: Vec<String>,
    /// EXI-290 — per-row execute-time skip report (reuses the EXI-220 `SkippedRow` shape).
    /// Each entry: source sheet name + 1-based row number + human-readable reason
    /// authored on the backend in the user's runtime locale.
    pub skipped_procedures: Vec<SkippedRow>,
}

// ============ Tauri Commands ============

/// Tauri command: Parse Excel file (preview step — no DB writes)
#[tauri::command]
#[specta::specta]
pub async fn parse_excel_file(file_path: String) -> Result<ParseExcelResponse, ExcelImportError> {
    tracing::debug!(target: BACKEND, "Processing parse_excel_file request");

    let data = ExcelParserService::parse_excel(&file_path).await?;
    let response = ParseExcelResponse::from(data);
    tracing::info!(
        target: BACKEND,
        patients = response.patients.len(),
        funds = response.funds.len(),
        procedures = response.procedures.len(),
        "Excel file parsed successfully"
    );
    Ok(response)
}

/// Tauri command: Execute Excel import (creates patients, funds, and procedures)
///
/// `parsed_data` must be the exact response from `parse_excel_file` — do NOT re-parse,
/// because `procedure_type_tmp_id` UUIDs are generated randomly and must match the mapping.
///
/// `procedure_type_mapping` maps `procedure_type_tmp_id → procedure_type_id` as selected
/// by the user in the type-mapping UI step.
#[tauri::command]
#[specta::specta]
pub async fn execute_excel_import(
    parsed_data: ParseExcelResponse,
    procedure_type_mapping: HashMap<String, String>,
    selected_sheets: Vec<String>,
    service: State<'_, Arc<ExcelImportOrchestrator>>,
) -> Result<ImportExecutionResult, ExcelImportError> {
    tracing::debug!(
        target: BACKEND,
        patients = parsed_data.patients.len(),
        funds = parsed_data.funds.len(),
        procedures = parsed_data.procedures.len(),
        selected_sheets = ?selected_sheets,
        "Processing execute_excel_import request"
    );

    // reviewer-arch FP: no api-level error log here by design — the orchestrator
    // already logs at every error site; adding one would double-log (see PR #59).
    service
        .execute_import(parsed_data, procedure_type_mapping, selected_sheets)
        .await
        .inspect(|result| {
            tracing::info!(
                target: BACKEND,
                patients_created = result.patients_created,
                patients_reused = result.patients_reused,
                funds_created = result.funds_created,
                funds_reused = result.funds_reused,
                procedures_created = result.procedures_created,
                procedures_skipped = result.procedures_skipped,
                skipped_procedures_count = result.skipped_procedures.len(),
                "Excel import completed successfully"
            );
        })
}

/// Tauri command: Return all saved Excel amount → procedure type mappings
#[tauri::command]
#[specta::specta]
pub async fn get_excel_amount_mappings(
    repo: State<'_, Arc<SqliteExcelAmountMappingRepository>>,
) -> Result<Vec<ExcelAmountMapping>, ExcelImportError> {
    tracing::debug!(target: BACKEND, "Processing get_excel_amount_mappings request");
    repo.find_all().await.map_err(|e| {
        tracing::error!(target: BACKEND, err = ?e, "Failed to get excel amount mappings");
        ExcelImportError::DatabaseError
    })
}

/// Tauri command: Save (upsert) Excel amount → procedure type mappings
#[tauri::command]
#[specta::specta]
pub async fn save_excel_amount_mappings(
    mappings: Vec<SaveExcelAmountMappingRequest>,
    repo: State<'_, Arc<SqliteExcelAmountMappingRepository>>,
) -> Result<(), ExcelImportError> {
    tracing::debug!(
        target: BACKEND,
        count = mappings.len(),
        "Processing save_excel_amount_mappings request"
    );
    repo.save_mappings(mappings).await.map_err(|e| {
        tracing::error!(target: BACKEND, err = ?e, "Failed to save excel amount mappings");
        ExcelImportError::DatabaseError
    })
}

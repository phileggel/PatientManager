use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::State;

use crate::use_cases::excel_import::amount_mapping_repo::{
    ExcelAmountMapping, ExcelAmountMappingRepository, SaveExcelAmountMappingRequest,
    SqliteExcelAmountMappingRepository,
};
use crate::use_cases::excel_import::domain::{
    ExcelFund, ExcelPatient, ExcelProcedure, ParsedExcelData, ParsingIssues,
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
    pub procedures_skipped: u32,
    pub procedures_deleted: u32,
    /// Months (YYYY-MM) that were blocked because they contain reconciliated/fund-payed procedures.
    pub blocked_months: Vec<String>,
}

// ============ Tauri Commands ============

/// Tauri command: Parse Excel file (preview step — no DB writes)
#[tauri::command]
#[specta::specta]
pub async fn parse_excel_file(file_path: String) -> Result<ParseExcelResponse, String> {
    tracing::info!(path = %file_path, "Processing parse_excel_file request");

    ExcelParserService::parse_excel(&file_path)
        .await
        .map(|data| {
            let response = ParseExcelResponse::from(data);
            tracing::info!(
                patients = response.patients.len(),
                funds = response.funds.len(),
                procedures = response.procedures.len(),
                "Excel file parsed successfully"
            );
            response
        })
        .map_err(|e| {
            tracing::error!(error = %e, "Failed to parse Excel file");
            format!("{:#}", e)
        })
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
    selected_months: Vec<String>,
    service: State<'_, Arc<ExcelImportOrchestrator>>,
) -> Result<ImportExecutionResult, String> {
    tracing::info!(
        patients = parsed_data.patients.len(),
        funds = parsed_data.funds.len(),
        procedures = parsed_data.procedures.len(),
        selected_months = ?selected_months,
        "Processing execute_excel_import request"
    );

    service
        .execute_import(parsed_data, procedure_type_mapping, selected_months)
        .await
        .inspect(|result| {
            tracing::info!(
                patients_created = result.patients_created,
                patients_reused = result.patients_reused,
                funds_created = result.funds_created,
                funds_reused = result.funds_reused,
                procedures_created = result.procedures_created,
                procedures_skipped = result.procedures_skipped,
                "Excel import completed successfully"
            );
        })
        .map_err(|e| {
            tracing::error!(error = %e, "Failed to execute Excel import");
            format!("{:#}", e)
        })
}

/// Tauri command: Return all saved Excel amount → procedure type mappings
#[tauri::command]
#[specta::specta]
pub async fn get_excel_amount_mappings(
    repo: State<'_, Arc<SqliteExcelAmountMappingRepository>>,
) -> Result<Vec<ExcelAmountMapping>, String> {
    tracing::debug!("Processing get_excel_amount_mappings request");
    repo.find_all().await.map_err(|e| {
        tracing::error!(error = %e, "Failed to get excel amount mappings");
        format!("{:#}", e)
    })
}

/// Tauri command: Save (upsert) Excel amount → procedure type mappings
#[tauri::command]
#[specta::specta]
pub async fn save_excel_amount_mappings(
    mappings: Vec<SaveExcelAmountMappingRequest>,
    repo: State<'_, Arc<SqliteExcelAmountMappingRepository>>,
) -> Result<(), String> {
    tracing::info!(
        count = mappings.len(),
        "Processing save_excel_amount_mappings request"
    );
    repo.save_mappings(mappings).await.map_err(|e| {
        tracing::error!(error = %e, "Failed to save excel amount mappings");
        format!("{:#}", e)
    })
}

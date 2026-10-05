use crate::shared::logger::BACKEND;
use crate::shared::secure_path::{self, PathPolicy};
use std::collections::HashMap;
use std::sync::Arc;

use tauri::State;

use crate::use_cases::excel_import::amount_mapping_repo::{
    ExcelAmountMapping, ExcelAmountMappingRepository, SaveExcelAmountMappingRequest,
    SqliteExcelAmountMappingRepository,
};
use crate::use_cases::excel_import::error::ExcelImportError;
use crate::use_cases::excel_import::orchestrator::ExcelImportOrchestrator;
use crate::use_cases::excel_import::parser::ExcelParserService;

use super::dto::{ImportExecutionResult, ParseExcelResponse};

// ============ Tauri Commands ============

/// The one format the parser reads; the import file picker offers the same.
const EXCEL_EXTENSIONS: &[&str] = &["xlsx"];

/// Tauri command: Parse Excel file (preview step — no DB writes)
///
/// The frontend-supplied `file_path` is validated as an existing regular file
/// under the user's home directory before the parser opens it.
#[tauri::command]
#[specta::specta]
pub async fn parse_excel_file(file_path: String) -> Result<ParseExcelResponse, ExcelImportError> {
    tracing::debug!(target: BACKEND, "Processing parse_excel_file request");

    let allowed_root = secure_path::user_home().ok_or_else(|| {
        tracing::error!(target: BACKEND, "Cannot resolve user home directory");
        ExcelImportError::PathRejected
    })?;
    let canonical = secure_path::validate_user_path(
        &file_path,
        &allowed_root,
        PathPolicy::ExistingFile {
            extensions: EXCEL_EXTENSIONS,
        },
    )
    .map_err(|e| {
        tracing::warn!(target: BACKEND, error = %e, "Excel path rejected by validator");
        ExcelImportError::PathRejected
    })?;

    let data = ExcelParserService::parse_excel(&canonical).await?;
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

#[cfg(test)]
mod tests {
    use super::*;

    /// A path that does not exist is rejected before the parser runs.
    #[tokio::test]
    async fn parse_excel_file_rejects_a_missing_file() {
        let result = parse_excel_file("/no/such/file/at/all.xlsx".to_string()).await;

        assert!(
            matches!(result, Err(ExcelImportError::PathRejected)),
            "a missing file must return PathRejected, got: {:?}",
            result.err(),
        );
    }

    /// An existing file outside the home directory is never opened. Unix
    /// only: the Windows temp directory sits inside the user profile.
    #[cfg(unix)]
    #[tokio::test]
    async fn parse_excel_file_rejects_a_file_outside_the_home_directory() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("book.xlsx");
        std::fs::write(&path, b"x").expect("write file");

        let result = parse_excel_file(path.to_string_lossy().into_owned()).await;

        assert!(
            matches!(result, Err(ExcelImportError::PathRejected)),
            "a file outside the home directory must return PathRejected, got: {:?}",
            result.err(),
        );
    }

    /// A file inside the home directory with another extension is rejected,
    /// the old Excel format included: the parser reads `.xlsx` only.
    #[tokio::test]
    async fn parse_excel_file_rejects_another_extension() {
        let home = secure_path::user_home().expect("home directory");
        let dir = tempfile::tempdir_in(home).expect("tempdir in home");
        let path = dir.path().join("book.xls");
        std::fs::write(&path, b"x").expect("write file");

        let result = parse_excel_file(path.to_string_lossy().into_owned()).await;

        assert!(
            matches!(result, Err(ExcelImportError::PathRejected)),
            "another extension must return PathRejected, got: {:?}",
            result.err(),
        );
    }
}

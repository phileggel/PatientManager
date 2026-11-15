//! Types the core and the command adapters both use: they live in the core (B47).

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::use_cases::excel_import::excel_codec::{
    ExcelFund, ExcelPatient, ExcelProcedure, ParsedExcelData, ParsingIssues, SkippedRow,
};

/// Parsed Excel file with metadata (total record count)
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields)]
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
    /// Counter of the rows the import skipped (EXI-210): a row of an
    /// unselected sheet is only counted; every other one is also itemised in
    /// `skipped_procedures` below.
    pub procedures_skipped: u32,
    pub procedures_deleted: u32,
    /// Months (YYYY-MM) that were blocked: they hold a procedure with a blocking status (EXI-160), or one a fund payment line, a bank entry or a procedure refund names (EXI-161).
    pub blocked_months: Vec<String>,
    /// EXI-290 — every skipped row of a selected sheet (the EXI-220 `SkippedRow`
    /// shape): source sheet name, 1-based row number and a typed reason.
    pub skipped_procedures: Vec<SkippedRow>,
}

use chrono::{Duration, NaiveDate};
use serde::{Deserialize, Serialize};
use specta::Type;

/// Parsed patient data from Excel Patiente sheet
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ExcelPatient {
    pub temp_id: String,
    pub name: String,
    pub ssn: String,
    pub latest_fund: Option<String>,
}

/// Parsed fund data from Excel Secu sheet
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ExcelFund {
    pub temp_id: String,
    pub fund_identifier: String,
    pub fund_name: String,
    pub fund_address: Option<String>,
}

/// Parsed procedure data from Excel monthly sheets
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ExcelProcedure {
    pub patient_temp_id: String,
    pub fund_temp_id: Option<String>,
    pub procedure_type_tmp_id: String,
    pub amount: i64,
    pub procedure_date: String,
    pub sheet_month: String,
    pub payment_method: Option<String>,
    pub confirmed_payment_date: Option<String>,
    pub actual_payment_amount: Option<i64>,
    pub awaited_amount: Option<i64>,
}

/// Information about a skipped row during parsing
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SkippedRow {
    pub sheet: String,
    pub row_number: u32,
    pub reason: String,
}

/// Parsing issues encountered during Excel file parsing
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ParsingIssues {
    pub skipped_rows: Vec<SkippedRow>,
    pub missing_sheets: Vec<String>,
}

/// Parsed Excel file containing all extracted data
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ParsedExcelData {
    pub patients: Vec<ExcelPatient>,
    pub funds: Vec<ExcelFund>,
    pub procedures: Vec<ExcelProcedure>,
    pub parsing_issues: ParsingIssues,
}

/// Parse a text date string in common formats to ISO 8601 (YYYY-MM-DD).
///
/// Tries the following formats in order: DD/MM/YYYY, D/M/YYYY, YYYY-MM-DD, DD-MM-YYYY.
/// Returns None if no format matches.
pub fn parse_text_date_to_iso(text: &str) -> Option<String> {
    let formats = ["%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"];
    for fmt in &formats {
        if let Ok(date) = NaiveDate::parse_from_str(text, fmt) {
            return Some(date.format("%Y-%m-%d").to_string());
        }
    }
    None
}

/// Convert Excel serial date number to ISO 8601 format (YYYY-MM-DD)
///
/// Excel stores all dates internally as serial numbers: days since January 1, 1900.
/// Serial 1 = January 1, 1900 (not 0).
/// Accounts for Excel's leap year bug (incorrectly treats 1900 as a leap year).
///
/// Returns: ISO format date string (YYYY-MM-DD), or None if conversion fails
pub fn convert_excel_date_to_iso(serial: f64) -> Option<String> {
    // Excel serial 1 = Jan 1, 1900, so subtract 1 to get day offset from base date
    // For dates > 60, also subtract 1 more to account for Excel's leap year bug
    let days_offset = if serial > 60.0 {
        serial - 2.0
    } else {
        serial - 1.0
    };

    // January 1, 1900 is the base date
    if let Some(base_date) = NaiveDate::from_ymd_opt(1900, 1, 1) {
        if let Some(target_date) = base_date.checked_add_signed(Duration::days(days_offset as i64))
        {
            return Some(target_date.format("%Y-%m-%d").to_string());
        }
    }
    None
}

//! Hardcoded scenario builders for the Excel surface (IFC-031, IFC-032).
//!
//! Each builder returns a `ParsedExcelData` value declaring the expected
//! parse output for its scenario. The writer module produces an `.xlsx` file
//! that, when re-parsed by the production Excel parser, yields exactly this
//! value (modulo the IFC-021 UUID carve-out).
//!
//! Scenarios are intentionally written as straightforward functions returning
//! literal data. There is no scenario builder framework, no fluent API, no
//! parameterization — each scenario is a self-contained, hand-written
//! `ParsedExcelData` literal.

use patient_manager_app::use_cases::excel_import::{
    ExcelFund, ExcelPatient, ExcelProcedure, ParsedExcelData, ParsingIssues, SkippedRow,
};

/// Happy-path scenario per IFC-032 §1: covers all three sheet kinds, three
/// patients, two funds, two procedures on a single monthly sheet (Mars). No
/// parsing issues.
///
/// Note on `missing_sheets`: the writer creates every canonical monthly sheet
/// (Jan..Déc) with just a header row when no procedures are scheduled. The
/// parser detects the sheet as present and emits no `missing_sheets` entry,
/// keeping `parsing_issues` empty as IFC-032 §1 requires.
pub fn happy_path_3_patients_2_funds() -> ParsedExcelData {
    ParsedExcelData {
        patients: vec![
            ExcelPatient {
                temp_id: "patient-1".into(),
                name: "Alice Martin".into(),
                ssn: "1234567890123".into(),
                latest_fund: None,
            },
            ExcelPatient {
                temp_id: "patient-2".into(),
                name: "Bob Durand".into(),
                ssn: "9876543210987".into(),
                latest_fund: Some("FUND-A".into()),
            },
            ExcelPatient {
                temp_id: "patient-3".into(),
                name: "Carol Bernard".into(),
                ssn: "5555555555555".into(),
                latest_fund: Some("FUND-B".into()),
            },
        ],
        funds: vec![
            ExcelFund {
                temp_id: "fund-1".into(),
                fund_identifier: "FUND-A".into(),
                fund_name: "Caisse Primaire".into(),
                fund_address: None,
            },
            ExcelFund {
                temp_id: "fund-2".into(),
                fund_identifier: "FUND-B".into(),
                fund_name: "MGEN".into(),
                fund_address: None,
            },
        ],
        procedures: vec![
            ExcelProcedure {
                patient_temp_id: "patient-2".into(),
                fund_temp_id: Some("fund-1".into()),
                procedure_type_tmp_id: "ptype-75".into(),
                amount: 75_000,
                procedure_date: "2026-03-15".into(),
                sheet_month: "Mars".into(),
                payment_method: None,
                confirmed_payment_date: None,
                paid_amount: None,
                awaited_amount: None,
                // IFC-026 — scenarios MUST NOT specify source_row; the writer
                // assigns from output position. Sentinel value; ignored by writer
                // and stripped from round-trip equality by `to_comparable_json`.
                source_row: 0,
            },
            ExcelProcedure {
                patient_temp_id: "patient-3".into(),
                fund_temp_id: Some("fund-2".into()),
                procedure_type_tmp_id: "ptype-125".into(),
                amount: 125_500,
                procedure_date: "2026-03-22".into(),
                sheet_month: "Mars".into(),
                payment_method: None,
                confirmed_payment_date: None,
                paid_amount: None,
                awaited_amount: None,
                source_row: 0,
            },
        ],
        parsing_issues: ParsingIssues {
            skipped_rows: vec![],
            missing_sheets: vec![],
        },
    }
}

/// Parsing-issues scenario per IFC-032 §2: monthly sheet contains a row whose
/// date cell is non-empty but unparseable (`"not-a-date"`). The parser MUST
/// emit one `SkippedRow` with `reason = "Unrecognized date format: 'not-a-date'"`.
///
/// One patient and one fund are present in the workbook so the bad row is the
/// only thing that fails — confirming the failure is due to the bad date and
/// not a missing reference. `procedures` is empty because the bad row is
/// dropped before being added to the procedure list.
pub fn skipped_rows_invalid_dates() -> ParsedExcelData {
    ParsedExcelData {
        patients: vec![ExcelPatient {
            temp_id: "patient-1".into(),
            name: "Alice Martin".into(),
            ssn: "1234567890123".into(),
            latest_fund: None,
        }],
        funds: vec![ExcelFund {
            temp_id: "fund-1".into(),
            fund_identifier: "FUND-A".into(),
            fund_name: "Caisse Primaire".into(),
            fund_address: None,
        }],
        procedures: vec![],
        parsing_issues: ParsingIssues {
            skipped_rows: vec![SkippedRow {
                sheet: "Mars".into(),
                row_number: 2,
                reason: "Unrecognized date format: 'not-a-date'".into(),
            }],
            missing_sheets: vec![],
        },
    }
}

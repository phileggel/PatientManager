use chrono::{Duration, NaiveDate};
use serde::{Deserialize, Serialize};
use specta::Type;

// =============================================================================
// IFC codec — data mapping
// =============================================================================
//
// The constants below describe the source document's data mapping — which
// sheet holds what, which header label corresponds to which field, where
// each fixed-position field lives, and which cell value means "absence".
// Both the production parser (which scans for these strings) and the dev
// fixture generator (which writes these strings) reference this module.
//
// Validation rules, fallback offsets, parser-emitted strings, and any
// optional/heuristic behavior stay inside the parser — the codec is
// data-mapping only. The round-trip integration test (IFC-021) catches any
// drift between parser and writer for things that are NOT centralised here.

/// Sheet name carrying the patients list. Header-less; data rows from row 0.
pub const PATIENTE_SHEET: &str = "Patiente";

/// Sheet name carrying the funds list. Header-less; data rows from row 0.
pub const SECU_SHEET: &str = "Secu";

/// Canonical monthly sheet names paired with their accepted variations.
/// The first element of each pair is the canonical name written by the
/// generator and stored in `ExcelProcedure.sheet_month`. The variations
/// are alternative names the parser also accepts when reading.
pub const MONTHLY_SHEET_VARIATIONS: &[(&str, &[&str])] = &[
    ("Jan", &["Jan", "Janvier"]),
    ("Fév", &["Fév", "Février"]),
    ("Mars", &["Mars"]),
    ("Avr", &["Avr", "Avril"]),
    ("Mai", &["Mai"]),
    ("Juin", &["Juin"]),
    ("Juil", &["Juil", "Juillet"]),
    ("Août", &["Août", "Aout"]),
    ("Sep", &["Sep", "Sept", "Septembre"]),
    ("Oct", &["Oct", "Octobre"]),
    ("Nov", &["Nov", "Novembre"]),
    ("Déc", &["Déc", "Décembre"]),
];

/// Canonical sheet name → 1-based month ordinal. Matches the canonical
/// entries in `MONTHLY_SHEET_VARIATIONS`. EXI-281 uses this to validate
/// that `procedure_date.month()` equals the source sheet's nominal month.
///
/// Cross-language mirror: the frontend keeps the same 12 entries at
/// `src/features/excel-import/shared/sheetOrder.ts`. Keep both aligned.
pub const CANONICAL_SHEET_MONTH: &[(&str, u32)] = &[
    ("Jan", 1),
    ("Fév", 2),
    ("Mars", 3),
    ("Avr", 4),
    ("Mai", 5),
    ("Juin", 6),
    ("Juil", 7),
    ("Août", 8),
    ("Sep", 9),
    ("Oct", 10),
    ("Nov", 11),
    ("Déc", 12),
];

/// Look up the 1-based month ordinal for a canonical sheet name.
/// Returns `None` if the name is not a canonical monthly sheet — callers
/// MUST handle this case (typically a soft skip; never a panic).
pub fn sheet_nominal_month(sheet: &str) -> Option<u32> {
    CANONICAL_SHEET_MONTH
        .iter()
        .find(|(canonical, _)| *canonical == sheet)
        .map(|(_, month)| *month)
}

/// Header labels of the monthly procedure sheets, plus the patient column's
/// fixed position. Fallback offsets for absent optional labels are NOT here
/// — they are parser fallback logic, not data mapping.
pub mod monthly_header {
    // --- Required labels (case-insensitive after `to_uppercase()`). ---

    /// Header label for the fund-identifier column.
    pub const FUND: &str = "CAISSE";
    /// Header label for the procedure-amount column (in euros).
    pub const AMOUNT: &str = "TARIF";
    /// Header label for the procedure-date column.
    pub const DATE: &str = "DATE";

    // --- Optional labels (case-insensitive after `to_uppercase()`). ---

    /// Header label for the payment-method column.
    pub const PAYMENT_METHOD: &str = "T";
    /// Header label for the confirmed-payment-date column.
    pub const CONFIRMED_PAYMENT_DATE: &str = "REMBSE";

    // --- Optional labels (case-sensitive — accented characters). ---

    /// Header label for the paid-amount column (in euros).
    pub const PAID_AMOUNT: &str = "Versé";
    /// Header label for the awaited-amount column (in euros).
    pub const AWAITED_AMOUNT: &str = "En attente";

    // --- Fixed positions. ---

    /// The parser always reads patient name from this column index,
    /// regardless of the header layout. The writer emits the patient
    /// name at the same column.
    pub const PATIENT_COL: usize = 1;
}

/// Cell value the parser treats as "no fund" alongside `""`. The dev
/// generator emits this value for `latest_fund: None` on Patiente rows.
pub const NO_FUND_PLACEHOLDER: &str = "0";

// =============================================================================
// IFC codec — typed data structures
// =============================================================================

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
    pub paid_amount: Option<i64>,
    pub awaited_amount: Option<i64>,
    /// 1-based row index in the source sheet. Transport metadata — excluded
    /// from codec round-trip equality per IFC-026. Populated by the parser
    /// when reading; the dev generator assigns from output position.
    pub source_row: u32,
}

/// Why a row was skipped during Excel parsing (EXI-020/220) or import
/// execution (EXI-280/281/290).
///
/// Wire shape: `{ "code": "<Variant>", ...params }` — the frontend translates
/// the code through its i18n pipeline; the backend authors no display text.
/// Params carry the offending cell values the report table shows; the sheet
/// name lives on the enclosing [`SkippedRow`], so sheet-related variants do
/// not repeat it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(tag = "code")]
pub enum SkipReason {
    /// EXI-020 — the sheet row has fewer columns than the layout requires.
    InsufficientColumns {
        needed: u32,
    },
    MissingPatientName,
    MissingFundIdentifier,
    MissingFundName,
    /// EXI-220 — the date cell matches no accepted format.
    UnrecognizedDateFormat {
        value: String,
    },
    /// The row references a patient absent from the parsed patient sheet.
    PatientNotFound {
        name: String,
    },
    /// The row references a fund absent from the parsed fund sheet.
    FundNotFound {
        identifier: String,
    },
    InvalidAmount {
        value: String,
    },
    /// EXI-280 — procedure_date does not parse as `YYYY-MM-DD`.
    InvalidProcedureDate {
        value: String,
    },
    /// EXI-280 — confirmed_payment_date does not parse as `YYYY-MM-DD`.
    InvalidConfirmedPaymentDate {
        value: String,
    },
    /// EXI-281 (defensive) — the sheet name maps to no nominal month.
    UnknownSheetName,
    /// EXI-281 — procedure_date's month differs from the sheet's nominal month.
    DateOutsideSheetMonth {
        date: String,
    },
}

impl SkipReason {
    /// Stable variant code for `tracing` fields. Never includes payload
    /// values, so PII-bearing variants (the patient name in
    /// [`SkipReason::PatientNotFound`]) stay out of the logs.
    pub fn code(&self) -> &'static str {
        match self {
            SkipReason::InsufficientColumns { .. } => "InsufficientColumns",
            SkipReason::MissingPatientName => "MissingPatientName",
            SkipReason::MissingFundIdentifier => "MissingFundIdentifier",
            SkipReason::MissingFundName => "MissingFundName",
            SkipReason::UnrecognizedDateFormat { .. } => "UnrecognizedDateFormat",
            SkipReason::PatientNotFound { .. } => "PatientNotFound",
            SkipReason::FundNotFound { .. } => "FundNotFound",
            SkipReason::InvalidAmount { .. } => "InvalidAmount",
            SkipReason::InvalidProcedureDate { .. } => "InvalidProcedureDate",
            SkipReason::InvalidConfirmedPaymentDate { .. } => "InvalidConfirmedPaymentDate",
            SkipReason::UnknownSheetName => "UnknownSheetName",
            SkipReason::DateOutsideSheetMonth { .. } => "DateOutsideSheetMonth",
        }
    }
}

/// Information about a skipped row during parsing
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct SkippedRow {
    pub sheet: String,
    pub row_number: u32,
    pub reason: SkipReason,
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

#[cfg(test)]
mod tests {
    use super::*;

    // --- parse_text_date_to_iso ---

    #[test]
    fn parse_date_dd_slash_mm_slash_yyyy() {
        assert_eq!(
            parse_text_date_to_iso("25/04/2025"),
            Some("2025-04-25".to_string())
        );
    }

    #[test]
    fn parse_date_iso_passthrough() {
        assert_eq!(
            parse_text_date_to_iso("2025-04-25"),
            Some("2025-04-25".to_string())
        );
    }

    #[test]
    fn parse_date_dd_dash_mm_dash_yyyy() {
        assert_eq!(
            parse_text_date_to_iso("25-04-2025"),
            Some("2025-04-25".to_string())
        );
    }

    #[test]
    fn parse_date_invalid_string_returns_none() {
        assert!(parse_text_date_to_iso("not-a-date").is_none());
    }

    #[test]
    fn parse_date_empty_string_returns_none() {
        assert!(parse_text_date_to_iso("").is_none());
    }

    #[test]
    fn parse_date_partial_format_returns_none() {
        assert!(parse_text_date_to_iso("25/04").is_none());
    }

    // --- convert_excel_date_to_iso ---

    #[test]
    fn excel_serial_1_is_epoch_jan_1_1900() {
        // Serial 1: days_offset = 1 - 1 = 0 → 1900-01-01
        assert_eq!(
            convert_excel_date_to_iso(1.0),
            Some("1900-01-01".to_string())
        );
    }

    #[test]
    fn excel_serial_59_is_last_day_before_fake_leap_day() {
        // Serial 59 (≤60): days_offset = 58 → 1900-02-28
        assert_eq!(
            convert_excel_date_to_iso(59.0),
            Some("1900-02-28".to_string())
        );
    }

    #[test]
    fn excel_serial_61_is_first_day_after_fake_leap_day() {
        // Serial 61 (>60): days_offset = 61 - 2 = 59 → 1900-03-01
        // Excel's fake Feb 29 (serial 60) and serial 61 both map to 1900-03-01
        assert_eq!(
            convert_excel_date_to_iso(61.0),
            Some("1900-03-01".to_string())
        );
    }

    #[test]
    fn excel_serial_modern_date_converted_correctly() {
        // Verify against programmatically computed value to avoid hardcoding calendar math
        let serial = 45000.0_f64;
        let days_offset = serial - 2.0; // > 60
        let expected = chrono::NaiveDate::from_ymd_opt(1900, 1, 1)
            .unwrap()
            .checked_add_signed(chrono::Duration::days(days_offset as i64))
            .unwrap()
            .format("%Y-%m-%d")
            .to_string();
        assert_eq!(convert_excel_date_to_iso(serial), Some(expected));
    }
}

#[cfg(test)]
mod skip_reason_tests {
    use super::*;
    use serde_json::{json, to_value};

    /// Every variant must emit `{ "code": ..., ...params }` on the wire and
    /// report the matching stable code for logs.
    #[test]
    fn each_variant_emits_its_code_and_payload() {
        let cases: Vec<(SkipReason, serde_json::Value)> = vec![
            (
                SkipReason::InsufficientColumns { needed: 4 },
                json!({ "code": "InsufficientColumns", "needed": 4 }),
            ),
            (
                SkipReason::MissingPatientName,
                json!({ "code": "MissingPatientName" }),
            ),
            (
                SkipReason::MissingFundIdentifier,
                json!({ "code": "MissingFundIdentifier" }),
            ),
            (
                SkipReason::MissingFundName,
                json!({ "code": "MissingFundName" }),
            ),
            (
                SkipReason::UnrecognizedDateFormat {
                    value: "not-a-date".into(),
                },
                json!({ "code": "UnrecognizedDateFormat", "value": "not-a-date" }),
            ),
            (
                SkipReason::PatientNotFound {
                    name: "Alice".into(),
                },
                json!({ "code": "PatientNotFound", "name": "Alice" }),
            ),
            (
                SkipReason::FundNotFound {
                    identifier: "440".into(),
                },
                json!({ "code": "FundNotFound", "identifier": "440" }),
            ),
            (
                SkipReason::InvalidAmount {
                    value: "abc".into(),
                },
                json!({ "code": "InvalidAmount", "value": "abc" }),
            ),
            (
                SkipReason::InvalidProcedureDate {
                    value: "31/12/2026".into(),
                },
                json!({ "code": "InvalidProcedureDate", "value": "31/12/2026" }),
            ),
            (
                SkipReason::InvalidConfirmedPaymentDate {
                    value: "garbage".into(),
                },
                json!({ "code": "InvalidConfirmedPaymentDate", "value": "garbage" }),
            ),
            (
                SkipReason::UnknownSheetName,
                json!({ "code": "UnknownSheetName" }),
            ),
            (
                SkipReason::DateOutsideSheetMonth {
                    date: "2026-02-15".into(),
                },
                json!({ "code": "DateOutsideSheetMonth", "date": "2026-02-15" }),
            ),
        ];

        for (reason, expected) in cases {
            let wire = to_value(&reason).unwrap();
            assert_eq!(wire, expected);
            assert_eq!(
                wire["code"],
                reason.code(),
                "code() must match the wire tag"
            );
            // Codec round trip: expected.json files deserialize back to the enum.
            let back: SkipReason = serde_json::from_value(wire).unwrap();
            assert_eq!(back, reason);
        }
    }
}

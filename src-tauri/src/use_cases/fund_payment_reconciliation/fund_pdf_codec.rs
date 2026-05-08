//! IFC codec — fund-payment-reconciliation PDF surface (IFC-060..IFC-065).
//!
//! Holds the typed contract (`PdfParseResult` and sub-types) and the
//! data-mapping constants the production parser scans for and the dev
//! fixture generator emits.
//!
//! Validation rules (regex patterns, SSN length, nature-code shape),
//! heuristic filters (the unparsed-line length threshold, the sample cap),
//! and parser-emitted strings stay inline in `parsing/pdf_parser.rs` per
//! IFC-063 — they are not data mapping and do not belong here.

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use specta::Type;

// =============================================================================
// IFC codec — data mapping
// =============================================================================
//
// The constants below describe the source document's data mapping — the
// fixed text markers the parser scans for and the dev generator emits.
// Parser internals (regex patterns, validation thresholds, fallback
// heuristics, emitted skip reasons) stay inline in `pdf_parser.rs`.

/// Opening marker of a total line (e.g. `"Total réglé le 02/05/2025 …"`).
pub const TOTAL_LINE_PREFIX: &str = "Total réglé le ";

/// Separator between the total-line payment date and the fund description
/// (e.g. `"… le 02/05/2025 par la Caisse …"`).
pub const TOTAL_LINE_SEPARATOR: &str = " par ";

/// Opening of the optional fund-number marker on the total line
/// (e.g. `"… la Caisse (n° 931) 38,40 €"`).
pub const TOTAL_LINE_FUND_NUMBER_OPEN: &str = "(n° ";

/// Closing of the optional fund-number marker on the total line.
pub const TOTAL_LINE_FUND_NUMBER_CLOSE: &str = ")";

/// Separator between the start and end of a procedure date range on a
/// data line (e.g. `"28/04/2025 au 30/04/2025"`).
pub const DATE_RANGE_SEPARATOR: &str = " au ";

/// Currency suffix on amount tokens (e.g. `"38,40 €"`).
pub const CURRENCY_SUFFIX: &str = "€";

// =============================================================================
// IFC codec — typed data structures
// =============================================================================

/// A normalized PDF procedure line — the ONE domain object for reconciliation.
///
/// All dates are NaiveDate (serialized as ISO YYYY-MM-DD via serde/specta).
/// Produced by the parser after normalization; used throughout the backend
/// and sent to the frontend via Tauri/Specta.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct NormalizedPdfLine {
    /// Unique index of the line in the original PDF
    pub line_index: u32,
    /// Payment date
    #[specta(type = String)]
    pub payment_date: NaiveDate,
    /// Invoice number
    pub invoice_number: String,
    /// Fund/organism name (e.g., "CPAM n° 931")
    pub fund_name: String,
    /// Patient name as registered with the fund
    pub patient_name: String,
    /// Social security number (13 digits)
    pub ssn: String,
    /// Nature of the act (e.g., "SF")
    pub nature: String,
    /// Start date of the act or period
    #[specta(type = String)]
    pub procedure_start_date: NaiveDate,
    /// End date (same as start for single-date acts)
    #[specta(type = String)]
    pub procedure_end_date: NaiveDate,
    /// True if this line covers a period (start ≠ end)
    pub is_period: bool,
    /// Amount in thousandths of a euro (e.g. 1234 = 1.234 €)
    pub amount: i64,
}

/// A group of procedure lines paid by the same fund on the same date
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct PdfProcedureGroup {
    /// Fund short label from data lines (e.g., "CPAM n° 931")
    pub fund_label: String,
    /// Full fund description from the total line
    pub fund_full_name: String,
    /// Payment date for this group
    #[specta(type = String)]
    pub payment_date: NaiveDate,
    /// Total amount stated in the PDF (thousandths of a euro)
    pub total_amount: i64,
    /// Whether the sum of line amounts matches the stated total
    pub is_total_valid: bool,
    /// Individual procedure lines in this group
    pub lines: Vec<NormalizedPdfLine>,
}

/// Complete parse result for a PDF statement
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct PdfParseResult {
    /// All procedure groups found in the document
    pub groups: Vec<PdfProcedureGroup>,
    /// Number of lines that could not be parsed
    pub unparsed_line_count: u32,
    /// Sample unparsed lines for debugging (max 5)
    pub unparsed_lines: Vec<String>,
}

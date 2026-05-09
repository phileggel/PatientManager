//! IFC codec — bank-statement-reconciliation PDF surface (IFC-100..IFC-105).
//!
//! Holds the typed contract (`BankStatementParseResult` and sub-types) and
//! the data-mapping constants the production parser scans for and the dev
//! fixture generator emits.
//!
//! Validation rules (regex patterns, IBAN length threshold, label cleanup
//! logic), heuristic filters, and parser-emitted strings stay inline in
//! `parser.rs` per IFC-103 — they are not data mapping and do not belong here.

use serde::{Deserialize, Serialize};
use specta::Type;

// =============================================================================
// IFC codec — data mapping
// =============================================================================
//
// The constants below describe the source document's data mapping — the
// fixed text markers the parser scans for and the dev generator emits.
// Parser internals (regex shapes, IBAN-length threshold, cleanup logic,
// helper conversions) stay inline in `parser.rs`.

/// IBAN line header marker (e.g. `"I.B.A.N. FR76…"`).
pub const IBAN_HEADER_MARKER: &str = "I.B.A.N.";

/// IBAN country prefix captured by the parser (e.g. `"FR"`).
pub const IBAN_COUNTRY_PREFIX: &str = "FR";

/// Opening token of the statement period line (e.g. `"du 01/05/2025 au …"`).
pub const PERIOD_PREFIX: &str = "du ";

/// Date-range separator in the period line (e.g. `"… 01/05/2025 au 30/05/2025"`).
pub const PERIOD_SEPARATOR: &str = " au ";

/// Credit-line VIR SEPA marker — single space is the canonical emit-side form
/// (IFC-102 §1); the parser regex uses `\s+` for read-side robustness.
pub const VIR_SEPA_MARKER: &str = "VIR SEPA";

/// Trailing-suffix cleaned from raw fund labels by the parser
/// (e.g. `"MUTUELLEGENERALEEDUCATIONNATSEPA"` → `"MUTUELLEGENERALEEDUCATIONNAT"`).
pub const LABEL_TRAILING_SUFFIX: &str = "SEPA";

/// French amount decimal separator (e.g. `"148,80"`).
pub const FRENCH_AMOUNT_DECIMAL: &str = ",";

// =============================================================================
// IFC codec — typed data structures
// =============================================================================

/// A single credit line from a bank statement (VIR SEPA only)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct BankStatementCreditLine {
    /// ISO date YYYY-MM-DD
    pub date: String,
    /// Fund label extracted from VIR SEPA, e.g. "CPAM93", "MUTUELLEGENERALEEDUCATIONNAT"
    pub label: String,
    /// Credit amount in thousandths of a euro (1 € = 1000)
    pub amount: i64,
}

/// Result of parsing a bank statement PDF
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct BankStatementParseResult {
    /// IBAN extracted from PDF header (normalized, no spaces)
    pub iban: Option<String>,
    /// Statement period, e.g. "du 01/05/2025 au 30/05/2025"
    pub period: Option<String>,
    /// Credit lines from VIR SEPA entries
    pub credit_lines: Vec<BankStatementCreditLine>,
    /// Sum of all credit amounts in thousandths of a euro
    pub total_credits: i64,
    /// Number of lines that couldn't be parsed
    pub unparsed_count: u32,
}

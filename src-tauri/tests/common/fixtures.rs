// Each integration-test binary pulls in this `common` module but uses only
// one surface's helpers; the other surface's functions look unused to the
// per-binary dead-code check. The warning is misleading — the code IS used,
// just from a sibling binary.
#![allow(dead_code)]

//! Typed fixture access helper — IFC-050.
//!
//! Each function returns `(PathBuf, ParsedExcelData)` for one named scenario:
//! - `PathBuf` points to the committed `.xlsx` fixture under
//!   `src-tauri/tests/fixtures/excel/`.
//! - `ParsedExcelData` is loaded from the sibling `.expected.json` snapshot
//!   the dev binary wrote at the same time as the `.xlsx` (IFC-030).
//!
//! Single source of truth: the scenario builder in
//! `src-tauri/dev/fixtures_excel/scenarios.rs` produces both files. This
//! helper deserializes the JSON snapshot — no scenario logic is duplicated
//! here.

use patient_manager_app::use_cases::excel_import::ParsedExcelData;
use patient_manager_app::use_cases::fund_payment_reconciliation::fund_pdf_codec::PdfParseResult;
use std::path::{Path, PathBuf};

/// Excel surface scenarios.
pub mod excel {
    use super::*;

    /// Happy-path scenario per IFC-032 §1: 3 patients, 2 funds, 2 procedures
    /// on Mars, no parsing issues.
    pub fn happy_path() -> (PathBuf, ParsedExcelData) {
        load("happy_path_3_patients_2_funds")
    }

    /// Parsing-issues scenario per IFC-032 §2: 1 patient, 1 fund, 0 valid
    /// procedures, 1 row skipped for unrecognized date format.
    pub fn skipped_rows_invalid_dates() -> (PathBuf, ParsedExcelData) {
        load("skipped_rows_invalid_dates")
    }

    fn load(scenario: &str) -> (PathBuf, ParsedExcelData) {
        let root = fixtures_root().join("excel");
        let xlsx_path = root.join(format!("{scenario}.xlsx"));
        let json_path = root.join(format!("{scenario}.expected.json"));

        let json_bytes = std::fs::read(&json_path).unwrap_or_else(|e| {
            panic!(
                "failed to read expected.json for scenario '{scenario}' at {}: {e}\n\
                 Did you forget to run `just regen-fixtures`?",
                json_path.display()
            )
        });
        let expected: ParsedExcelData = serde_json::from_slice(&json_bytes).unwrap_or_else(|e| {
            panic!(
                "failed to deserialize expected.json for scenario '{scenario}' at {}: {e}",
                json_path.display()
            )
        });

        assert!(
            xlsx_path.exists(),
            "fixture xlsx for scenario '{scenario}' is missing at {}; \
             run `just regen-fixtures` to regenerate",
            xlsx_path.display()
        );

        (xlsx_path, expected)
    }
}

/// Fund-PDF surface scenarios.
///
/// Per IFC-050: each function returns `(PathBuf, PdfParseResult)` — the committed
/// `.pdf` fixture path and the expected parse result loaded from the sibling
/// `.expected.json` snapshot. Both files are produced by the dev binary
/// (`just regen-fixtures fund-pdf`) from a single scenario builder, so they
/// cannot drift.
pub mod fund_pdf {
    use super::*;

    /// Multi-fund happy-path scenario per IFC-062 §1:
    /// 2 procedure groups, at least one period date range, no unparsed lines.
    pub fn happy_path_multi_fund() -> (PathBuf, PdfParseResult) {
        load("happy_path_multi_fund")
    }

    /// Unparsed-line scenario per IFC-062 §2:
    /// 1 procedure group + 1 declared unparsed line; unparsed_line_count >= 1.
    pub fn unparsed_line_present() -> (PathBuf, PdfParseResult) {
        load("unparsed_line_present")
    }

    fn load(scenario: &str) -> (PathBuf, PdfParseResult) {
        let root = fixtures_root().join("fund_pdf");
        let pdf_path = root.join(format!("{scenario}.pdf"));
        let json_path = root.join(format!("{scenario}.expected.json"));

        let json_bytes = std::fs::read(&json_path).unwrap_or_else(|e| {
            panic!(
                "failed to read expected.json for fund-pdf scenario '{scenario}' at {}: {e}\n\
                 Did you forget to run `just regen-fixtures fund-pdf`?",
                json_path.display()
            )
        });
        let expected: PdfParseResult = serde_json::from_slice(&json_bytes).unwrap_or_else(|e| {
            panic!(
                "failed to deserialize expected.json for fund-pdf scenario '{scenario}' at {}: {e}",
                json_path.display()
            )
        });

        assert!(
            pdf_path.exists(),
            "fixture pdf for fund-pdf scenario '{scenario}' is missing at {}; \
             run `just regen-fixtures fund-pdf` to regenerate",
            pdf_path.display()
        );

        (pdf_path, expected)
    }
}

/// Bank-PDF surface scenarios.
///
/// Per IFC-050: each function returns `(PathBuf, BankStatementParseResult)` — the committed
/// `.pdf` fixture path and the expected parse result loaded from the sibling
/// `.expected.json` snapshot. Both files are produced by the dev binary
/// (`just regen-fixtures bank-pdf`) from a single scenario builder, so they
/// cannot drift.
pub mod bank_pdf {
    use patient_manager_app::use_cases::bank_statement_reconciliation::bank_pdf_codec::BankStatementParseResult;
    use std::path::PathBuf;

    /// Multi-label happy-path scenario per IFC-102 §1:
    /// IBAN + period in header, multiple VIR SEPA credit lines, `unparsed_count = 0`.
    pub fn happy_path_multi_label() -> (PathBuf, BankStatementParseResult) {
        load("happy_path_multi_label")
    }

    /// IBAN + period only, no credit lines per IFC-102 §2:
    /// IBAN + period present, `credit_lines` empty, `total_credits = 0`, `unparsed_count = 0`.
    /// Produces the shape that would trigger R26 NoVirSepaLines at the command layer —
    /// the round-trip verifies the parser result only.
    pub fn iban_period_only_no_credits() -> (PathBuf, BankStatementParseResult) {
        load("iban_period_only_no_credits")
    }

    fn load(scenario: &str) -> (PathBuf, BankStatementParseResult) {
        let root = super::fixtures_root().join("bank_pdf");
        let pdf_path = root.join(format!("{scenario}.pdf"));
        let json_path = root.join(format!("{scenario}.expected.json"));

        let json_bytes = std::fs::read(&json_path).unwrap_or_else(|e| {
            panic!(
                "failed to read expected.json for bank-pdf scenario '{scenario}' at {}: {e}\n\
                 Did you forget to run `just regen-fixtures bank-pdf`?",
                json_path.display()
            )
        });
        let expected: BankStatementParseResult =
            serde_json::from_slice(&json_bytes).unwrap_or_else(|e| {
                panic!(
                    "failed to deserialize expected.json for bank-pdf scenario '{scenario}' at {}: {e}",
                    json_path.display()
                )
            });

        assert!(
            pdf_path.exists(),
            "fixture pdf for bank-pdf scenario '{scenario}' is missing at {}; \
             run `just regen-fixtures bank-pdf` to regenerate",
            pdf_path.display()
        );

        (pdf_path, expected)
    }
}

fn fixtures_root() -> PathBuf {
    // Integration tests run with CWD = the crate directory (src-tauri/),
    // so a relative path `tests/fixtures` resolves correctly. Falling back
    // to CARGO_MANIFEST_DIR keeps the helper robust if a future test runner
    // changes the CWD.
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    Path::new(manifest_dir).join("tests").join("fixtures")
}

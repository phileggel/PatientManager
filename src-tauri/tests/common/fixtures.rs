//! Typed fixture access helper — IFC-050.
//!
//! Each function returns `(PathBuf, ParsedExcelData)` for one named scenario:
//! - `PathBuf` points to the committed `.xlsx` fixture under
//!   `src-tauri/tests/fixtures/excel/`.
//! - `ParsedExcelData` is loaded from the sibling `.expected.json` snapshot
//!   the dev binary wrote at the same time as the `.xlsx` (IFC-030).
//!
//! Single source of truth: the scenario builder in
//! `src-tauri/src/bin/fixtures_excel/scenarios.rs` produces both files. This
//! helper deserializes the JSON snapshot — no scenario logic is duplicated
//! here.

use patient_manager_app::use_cases::excel_import::ParsedExcelData;
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

fn fixtures_root() -> PathBuf {
    // Integration tests run with CWD = the crate directory (src-tauri/),
    // so a relative path `tests/fixtures` resolves correctly. Falling back
    // to CARGO_MANIFEST_DIR keeps the helper robust if a future test runner
    // changes the CWD.
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    Path::new(manifest_dir).join("tests").join("fixtures")
}

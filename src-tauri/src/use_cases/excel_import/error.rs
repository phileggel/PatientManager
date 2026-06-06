use serde::Serialize;
use specta::Type;
use thiserror::Error;

/// Error surface for the Excel import use case.
///
/// A flat `#[serde(tag = "code")]` enum — NOT an untagged composite. The
/// excel-import contract deliberately keeps the error surface coarse: per-row
/// failures are reported in-band via `ParsingIssues` / `skipped_procedures`,
/// never as command errors, and infrastructure failures collapse to a single
/// catch-all (`ImportFailed` for execution, `DatabaseError` for the mapping
/// repo). There are no FE-meaningful bounded-context errors to wrap with
/// `#[from]`, so the use-case enum is the FE-facing type directly.
///
/// The frontend narrows on `code` per F27.
#[derive(Debug, Clone, PartialEq, Error, Serialize, Type)]
#[serde(tag = "code")]
pub enum ExcelImportError {
    /// `parse_excel_file` — the path does not exist on disk.
    #[error("File not found: {path}")]
    FileNotFound { path: String },

    /// `parse_excel_file` — the file exists but cannot be opened or read as an
    /// xlsx workbook.
    #[error("The file is not a readable Excel workbook")]
    InvalidFormat,

    /// `parse_excel_file` — the workbook opened but a required sheet could not
    /// be parsed.
    #[error("The Excel file could not be parsed")]
    ParseError,

    /// `execute_excel_import` — catch-all for infrastructure failures (repo /
    /// service writes). Per the contract, all per-row failures surface via
    /// `ImportExecutionResult.skipped_procedures`, so this covers only
    /// infrastructure-level faults. Logged at the call site; the wire surface
    /// carries no detail.
    #[error("The import could not be completed")]
    ImportFailed,

    /// `get_excel_amount_mappings` / `save_excel_amount_mappings` — a failure
    /// from the amount-mapping repository. Logged at the call site.
    #[error("An unexpected database error occurred")]
    DatabaseError,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, to_value};

    // reviewer-backend FP: name matches the gold sibling tests in
    // overpayment/error.rs and patient/error.rs — intentional (see PR #59).
    #[test]
    fn each_variant_emits_a_code() {
        // Payload-bearing variant.
        let not_found = ExcelImportError::FileNotFound {
            path: "/tmp/x.xlsx".into(),
        };
        assert_eq!(
            to_value(&not_found).unwrap(),
            json!({ "code": "FileNotFound", "path": "/tmp/x.xlsx" }),
        );

        // Unit variants must still emit their code (never null).
        let cases: &[(&str, ExcelImportError)] = &[
            ("InvalidFormat", ExcelImportError::InvalidFormat),
            ("ParseError", ExcelImportError::ParseError),
            ("ImportFailed", ExcelImportError::ImportFailed),
            ("DatabaseError", ExcelImportError::DatabaseError),
        ];
        for (code, variant) in cases {
            assert_eq!(
                to_value(variant).unwrap(),
                json!({ "code": code }),
                "variant {code} must serialize to {{\"code\": \"{code}\"}}",
            );
        }
    }
}

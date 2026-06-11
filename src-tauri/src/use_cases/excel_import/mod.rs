/// Excel import use case
///
/// Handles parsing Excel files and orchestrating the full import workflow
/// (patients, funds, procedures). Moved from context/excel_import because
/// this is an application use case that spans multiple bounded contexts,
/// not a domain-specific context.
mod amount_mapping_repo;
mod api;
pub mod error;
pub mod excel_codec;
mod orchestrator;
mod parser;

pub use amount_mapping_repo::{
    ExcelAmountMapping, ExcelAmountMappingRepository, SaveExcelAmountMappingRequest,
    SqliteExcelAmountMappingRepository,
};
pub use api::*;
pub use error::ExcelImportError;
pub use orchestrator::ExcelImportOrchestrator;

// IFC codec — public surface of the Excel import contract (IFC-020, IFC-024).
// `excel_codec` contains both the typed data structures AND the declarative
// format constants (sheet names, header labels, fixed column positions) that
// describe the source document's shape. Consumed by the production parser
// internally and by the dev fixture generator + round-trip integration tests
// externally. The module stays private; only the codec types and the parser
// entry point are exported.
pub use excel_codec::{
    ExcelFund, ExcelPatient, ExcelProcedure, ParsedExcelData, ParsingIssues, SkipReason, SkippedRow,
};

// `ExcelParserService` is reachable internally by `api.rs` and `orchestrator.rs`
// via the in-module `parser::` path. The public re-export exists only so the
// dev fixture binary and the round-trip integration tests can drive the
// parser end-to-end. Both external callers of `ExcelParserService` are gated
// by `dev-fixtures`, so the prod build's public API does not expose it.
#[cfg(feature = "dev-fixtures")]
pub use parser::ExcelParserService;

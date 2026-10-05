/// Excel import use case
///
/// Handles parsing Excel files and orchestrating the full import workflow
/// (patients, funds, procedures). Moved from context/excel_import because
/// this is an application use case that spans multiple bounded contexts,
/// not a domain-specific context.
mod amount_mapping_repo;
#[cfg(feature = "app")]
mod api;
/// Types the core and the command adapters both use (B47).
mod dto;
pub mod error;
pub mod excel_codec;
mod orchestrator;
mod parser;

pub use amount_mapping_repo::{
    ExcelAmountMapping, ExcelAmountMappingRepository, SaveExcelAmountMappingRequest,
    SqliteExcelAmountMappingRepository,
};
#[cfg(feature = "app")]
pub use api::*;
pub use dto::*;
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

// `ExcelParserService` is the parse step an adapter drives before the import: the
// Tauri command today, the command line next, the dev fixture binary and the
// round-trip tests. It is part of the core's surface (B47).
pub use parser::ExcelParserService;

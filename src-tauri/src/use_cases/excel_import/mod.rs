/// Excel import use case
///
/// Handles parsing Excel files and orchestrating the full import workflow
/// (patients, funds, procedures). Moved from context/excel_import because
/// this is an application use case that spans multiple bounded contexts,
/// not a domain-specific context.
mod amount_mapping_repo;
mod api;
mod domain;
mod orchestrator;
mod parser;

pub use amount_mapping_repo::{
    ExcelAmountMapping, ExcelAmountMappingRepository, SaveExcelAmountMappingRequest,
    SqliteExcelAmountMappingRepository,
};
pub use api::*;
pub use orchestrator::ExcelImportOrchestrator;

// IFC codec — public surface of the Excel import contract (IFC-020, IFC-024).
// Consumed by the production parser internally and by the dev fixture
// generator + round-trip integration tests externally. Modules stay private;
// only the codec types and the parser entry point are exported.
pub use domain::{
    ExcelFund, ExcelPatient, ExcelProcedure, ParsedExcelData, ParsingIssues, SkippedRow,
};

// `ExcelParserService` is reachable internally by `api.rs` and `orchestrator.rs`
// via the in-module `parser::` path. The public re-export exists only so the
// dev fixture binary and the round-trip integration tests can drive the
// parser end-to-end. Both consumers are gated by `dev-fixtures`, so the prod
// build's public API is unaffected by this re-export.
#[cfg(feature = "dev-fixtures")]
pub use parser::ExcelParserService;

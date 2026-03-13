/// Excel import use case
///
/// Handles parsing Excel files and orchestrating the full import workflow
/// (patients, funds, procedures). Moved from context/excel_import because
/// this is an application use case that spans multiple bounded contexts,
/// not a domain-specific context.
mod api;
mod domain;
mod orchestrator;
mod parser;

pub use api::*;
pub use orchestrator::ExcelImportOrchestrator;

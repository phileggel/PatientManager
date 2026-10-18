/// Reconciliation module for PDF payment statement processing
///
/// Architecture (organized by responsibility):
/// - core/: Pure matching algorithm (processor.rs) and types (InternalAmount)
/// - parsing/: PDF extraction, text parsing, and date utilities
/// - data/: Database access and caching (pool builder, fund cache)
/// - reconciliation/: Matching orchestration (passes, anomaly detection, perfect match checking)
/// - output/: Result transformations (CSV export, candidate grouping)
mod core;
mod data;
mod output;
pub mod parsing;
mod reconciliation;

// IFC codec — public surface of the fund-PDF import contract
// (IFC-060, IFC-024). Holds the typed contract (`PdfParseResult` and
// sub-types) plus data-mapping constants (total-line markers, date-range
// separator, currency suffix) that the parser scans for and the dev
// fixture generator emits. Sibling to `excel_codec.rs` under
// `use_cases/excel_import/` per IFC-023 — independent, no shared
// abstraction.
pub mod fund_pdf_codec;

// Public API layer
#[cfg(feature = "app")]
pub mod api;
/// Types the core and the command adapters both use (B47).
mod dto;
pub mod error;
/// What a log may say of a fund label read from a statement (B44).
mod fund_label;
pub mod orchestrator;
pub mod service;
/// Splitting one PDF line into several procedures (FPA-255 to FPA-258).
mod split;
/// The validation's unit of work over SQLite (ADR-003, B26).
mod sqlx_uow;
/// The validation's unit of work, as the orchestrator sees it (FPA-076).
mod uow;

// Re-export commonly used types and services
#[cfg(feature = "app")]
pub use api::*;
pub use dto::*;
pub use error::{FundPaymentReconciliationError, FundPaymentReconciliationTask};
pub use orchestrator::FundPaymentReconciliationOrchestrator;
pub use service::ReconciliationService;
pub use split::{read_split, SplitInvalidReason, SplitPart, SplitPartInvalidReason};
pub use uow::{
    StatementValidationOperation, StatementValidationTransactionManager,
    StatementValidationUnitOfWork,
};

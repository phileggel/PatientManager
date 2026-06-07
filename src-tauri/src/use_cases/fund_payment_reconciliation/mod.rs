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
pub mod api;
pub mod error;
pub mod orchestrator;
pub mod service;

// Re-export commonly used types and services
pub use api::*;
pub use error::{FundPaymentReconciliationError, FundPaymentReconciliationTask};
pub use orchestrator::FundPaymentReconciliationOrchestrator;
pub use service::ReconciliationService;

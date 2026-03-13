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

// Public API layer
pub mod api;
pub mod orchestrator;
pub mod service;

// Re-export commonly used types and services
pub use api::*;
pub use orchestrator::FundPaymentReconciliationOrchestrator;
pub use service::ReconciliationService;

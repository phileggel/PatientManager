/// PDF report generation for the fund payment reconciliation session.
///
/// Architecture:
/// - `api.rs` — Tauri command handler (deserialize → orchestrator → serialize, B21)
/// - `orchestrator.rs` — coordinates validation + rendering (B22)
/// - `request.rs` — pre-resolved request types (`ReportGenerationRequest`,
///   `UnreconciledSection`, `UnreconciledRow`, `UnreconciledColumns`,
///   `CorrectionGroup`) and structural validation
/// - `renderer.rs` — pure Rust PDF rendering using `printpdf`. The renderer
///   only places strings — translation, currency formatting, and date
///   formatting are all performed by the frontend before invocation.
/// - `error.rs` — `ReportPdfError` enum
pub mod api;
pub mod error;
pub mod orchestrator;
pub mod renderer;
pub mod request;

// Glob re-export captures the specta-generated `__specta__fn__*` helpers
// alongside the public command, matching the project convention used by
// `fund_payment_reconciliation`.
pub use api::*;
pub use error::ReportPdfError;
pub use orchestrator::generate;
pub use renderer::render;
pub use request::{
    CorrectionGroup, ReportGenerationRequest, UnreconciledColumns, UnreconciledRow,
    UnreconciledSection,
};

//! Diagnostic report (DGR): a text file the user sends to support, holding the
//! state of the installation and no patient data.
#[cfg(feature = "app")]
mod api;
mod error;
mod orchestrator;
mod report;

#[cfg(feature = "app")]
pub use api::*;
pub use error::DiagnosticReportError;
pub use orchestrator::{DiagnosticReportOrchestrator, DiagnosticReportResult};
pub use report::reset_log_on_version_change;

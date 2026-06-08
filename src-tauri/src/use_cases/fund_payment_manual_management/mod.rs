//! Manual management of fund payment groups.
//!
//! User-driven CRUD on `FundPaymentGroup` entities from the FundPaymentManager
//! page: row delete, Add Fund Payment panel create, Edit modal update. Each
//! command coordinates writes across the `fund` and `procedure` bounded
//! contexts (group + linked procedure statuses), which is why it lives as a
//! use case rather than inside `context/fund/`.
//!
//! Distinct from `fund_payment_reconciliation` (PDF-driven auto-reconciliation):
//! no PDF, no matching algorithm, no anomaly detection — just user-selected
//! procedures and a manual fund payment group.

pub mod api;
pub mod error;
pub mod orchestrator;

pub use error::{FundPaymentManualManagementError, FundPaymentManualManagementTask};
pub use orchestrator::FundPaymentManualManagementOrchestrator;

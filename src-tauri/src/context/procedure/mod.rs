#[cfg(feature = "app")]
mod api;
mod domain;
/// Types the core and the command adapters both use (B47).
mod dto;
mod error;
mod repository;
mod service;

// Export all domain types, traits, and projections
pub use domain::*;
pub use error::*;

// Export infra implementations
pub use repository::{
    SqliteProcedureRefundRepository, SqliteProcedureRepository, SqliteProcedureTypeRepository,
};

// Export services
pub use service::{ProcedureService, ProcedureTypeService};

// Export API handlers
#[cfg(feature = "app")]
pub use api::*;
pub use dto::*;

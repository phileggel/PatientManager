mod api;
mod domain;
mod repository;
mod service;

// Export domain types (entities, enums, traits)
pub use domain::{PaymentMethod, Procedure, ProcedureStatus, ProcedureType};

// Export repository traits and implementations
pub use repository::{
    ProcedureRepository, ProcedureTypeRepository, SqliteProcedureRepository,
    SqliteProcedureTypeRepository, UnreconciledProcedureRow,
};

// Export services
pub use service::{ProcedureService, ProcedureTypeService};

// Export API handlers
pub use api::*;

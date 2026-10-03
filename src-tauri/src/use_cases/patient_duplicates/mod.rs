//! Patient duplicates (PDU): list the patients that carry the same name, merge a
//! pair into one patient, or record that the two are different people.
mod api;
mod error;
mod orchestrator;
mod pairs;
mod sqlx_uow;
mod uow;

pub use api::*;
pub use error::{PatientDuplicatesError, PatientDuplicatesTask};
pub use orchestrator::PatientDuplicatesOrchestrator;
pub use pairs::{DuplicatePair, PatientSummary};
pub use uow::{PatientMergeOperation, PatientMergeTransactionManager, PatientMergeUnitOfWork};

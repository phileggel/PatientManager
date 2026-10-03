//! Unit of work for merging two patients (ADR-003, PDU-024).
//!
//! A merge writes two bounded contexts: the procedures move (procedure), the
//! kept patient changes and the other is deleted (patient), and the dismissals
//! of the deleted patient go. All of it happens, or none.

use crate::context::patient::Patient;
use crate::shared::uow::UnitOfWorkFuture;

/// The writes a merge makes, on one transaction.
#[async_trait::async_trait]
pub trait PatientMergeUnitOfWork: Send {
    async fn reassign_procedures(&mut self, from_id: &str, to_id: &str) -> anyhow::Result<()>;
    async fn update_patient(&mut self, patient: &Patient) -> anyhow::Result<()>;
    async fn delete_patient(&mut self, patient_id: &str) -> anyhow::Result<()>;
    async fn delete_dismissals_of(&mut self, patient_id: &str) -> anyhow::Result<()>;
}

/// What the orchestrator asks to run atomically.
pub type PatientMergeOperation =
    Box<dyn for<'a> FnOnce(&'a mut dyn PatientMergeUnitOfWork) -> UnitOfWorkFuture<'a> + Send>;

/// Runs an operation in one transaction: committed when it returns `Ok`,
/// rolled back when it returns `Err`.
#[async_trait::async_trait]
pub trait PatientMergeTransactionManager: Send + Sync {
    async fn run(&self, operation: PatientMergeOperation) -> anyhow::Result<()>;
}

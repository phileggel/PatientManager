//! Unit of work for validating a fund statement (ADR-003, FPA-076).
//!
//! A validation writes three bounded contexts: the funds it creates and the
//! fund payment groups (fund), the patients it creates or corrects (patient),
//! the procedures it creates, corrects and reconciles (procedure). All of it
//! happens, or none.

use crate::context::fund::{Fund, FundPaymentGroup};
use crate::context::patient::Patient;
use crate::context::procedure::Procedure;
use crate::shared::uow::UnitOfWorkFuture;

/// The writes a validation makes, on one transaction.
#[async_trait::async_trait]
pub trait StatementValidationUnitOfWork: Send {
    async fn create_funds(&mut self, funds: &[Fund]) -> anyhow::Result<()>;
    async fn create_patients(&mut self, patients: &[Patient]) -> anyhow::Result<()>;
    async fn update_patients(&mut self, patients: &[Patient]) -> anyhow::Result<()>;
    async fn create_procedures(&mut self, procedures: &[Procedure]) -> anyhow::Result<()>;
    async fn update_procedures(&mut self, procedures: &[Procedure]) -> anyhow::Result<()>;
    /// Each group with its lines.
    async fn create_groups(&mut self, groups: &[FundPaymentGroup]) -> anyhow::Result<()>;
}

/// What the orchestrator asks to run atomically.
pub type StatementValidationOperation = Box<
    dyn for<'a> FnOnce(&'a mut dyn StatementValidationUnitOfWork) -> UnitOfWorkFuture<'a> + Send,
>;

/// Runs an operation in one transaction: committed when it returns `Ok`,
/// rolled back when it returns `Err`.
#[async_trait::async_trait]
pub trait StatementValidationTransactionManager: Send + Sync {
    async fn run(&self, operation: StatementValidationOperation) -> anyhow::Result<()>;
}

//! Unit of work for deleting a procedure type or a fund (ADR-003, PRO-280,
//! PRO-290).
//!
//! A deletion writes two bounded contexts: the procedure type or the fund is
//! soft-deleted, and the patients whose latest-procedure defaults name it lose
//! them. All of it happens, or none.

use crate::shared::uow::UnitOfWorkFuture;

/// The writes a deletion makes, on one transaction.
#[async_trait::async_trait]
pub trait DeletionUnitOfWork: Send {
    async fn delete_procedure_type(&mut self, procedure_type_id: &str) -> anyhow::Result<()>;
    async fn clear_procedure_type_defaults(
        &mut self,
        procedure_type_id: &str,
    ) -> anyhow::Result<()>;
    async fn delete_fund(&mut self, fund_id: &str) -> anyhow::Result<()>;
    async fn clear_fund_defaults(&mut self, fund_id: &str) -> anyhow::Result<()>;
}

/// What the orchestrator asks to run atomically.
pub type DeletionOperation =
    Box<dyn for<'a> FnOnce(&'a mut dyn DeletionUnitOfWork) -> UnitOfWorkFuture<'a> + Send>;

/// Runs an operation in one transaction: committed when it returns `Ok`,
/// rolled back when it returns `Err`.
#[async_trait::async_trait]
pub trait DeletionTransactionManager: Send + Sync {
    async fn run(&self, operation: DeletionOperation) -> anyhow::Result<()>;
}

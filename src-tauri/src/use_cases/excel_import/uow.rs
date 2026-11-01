//! Unit of work for an Excel import (ADR-003, EXI-175).
//!
//! An import writes three bounded contexts: new patients (patient), new funds
//! (fund), the months it replaces and their new procedures (procedure), and the
//! patients' tracking fields. All of it happens, or none.

use crate::context::fund::Fund;
use crate::context::patient::Patient;
use crate::context::procedure::Procedure;
use crate::shared::uow::UnitOfWorkFuture;

/// The writes an import makes, on one transaction.
#[async_trait::async_trait]
pub trait ExcelImportUnitOfWork: Send {
    async fn insert_patient(&mut self, patient: &Patient) -> anyhow::Result<()>;
    async fn insert_fund(&mut self, fund: &Fund) -> anyhow::Result<()>;
    /// Hard-deletes every procedure of a month (YYYY-MM), returning how many went.
    async fn delete_procedures_of_month(&mut self, month: &str) -> anyhow::Result<u64>;
    async fn insert_procedure(&mut self, procedure: &Procedure) -> anyhow::Result<()>;
    async fn update_patient(&mut self, patient: &Patient) -> anyhow::Result<()>;
}

/// What the orchestrator asks to run atomically.
pub type ExcelImportOperation =
    Box<dyn for<'a> FnOnce(&'a mut dyn ExcelImportUnitOfWork) -> UnitOfWorkFuture<'a> + Send>;

/// Runs an operation in one transaction: committed when it returns `Ok`,
/// rolled back when it returns `Err`.
#[async_trait::async_trait]
pub trait ExcelImportTransactionManager: Send + Sync {
    async fn run(&self, operation: ExcelImportOperation) -> anyhow::Result<()>;
}

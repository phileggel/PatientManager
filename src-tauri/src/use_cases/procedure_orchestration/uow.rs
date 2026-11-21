//! Units of work of the procedure orchestration (ADR-003): deleting a procedure
//! type, a fund or a patient (PRO-280, PRO-290, PRO-296), and creating or
//! deleting a procedure with its patient's tracking (#705).
//!
//! A deletion writes two bounded contexts: the procedure type or the fund is
//! deleted, and the patients whose latest-procedure defaults name it lose them.
//! All of it happens, or none.

use crate::context::patient::Patient;
use crate::context::procedure::Procedure;
use crate::shared::uow::UnitOfWorkFuture;

/// The writes a deletion makes, on one transaction.
#[async_trait::async_trait]
pub trait DeletionUnitOfWork: Send {
    /// False when a procedure still uses the type, or no row matched (R6, R24).
    async fn delete_procedure_type(&mut self, procedure_type_id: &str) -> anyhow::Result<bool>;
    async fn count_procedures_of_type(&mut self, procedure_type_id: &str) -> anyhow::Result<usize>;
    async fn clear_procedure_type_defaults(
        &mut self,
        procedure_type_id: &str,
    ) -> anyhow::Result<()>;
    /// False when a procedure or a fund payment group still uses the fund, or no row
    /// matched (PRO-291).
    async fn delete_fund(&mut self, fund_id: &str) -> anyhow::Result<bool>;
    /// (procedures, fund payment groups) that use the fund.
    async fn count_fund_uses(&mut self, fund_id: &str) -> anyhow::Result<(usize, usize)>;
    async fn clear_fund_defaults(&mut self, fund_id: &str) -> anyhow::Result<()>;
    /// Whether the row is still there: a refused delete nothing counted is a fault.
    async fn procedure_type_exists(&mut self, procedure_type_id: &str) -> anyhow::Result<bool>;
    async fn fund_exists(&mut self, fund_id: &str) -> anyhow::Result<bool>;
    /// False when a procedure still names the patient, or no row matched (PRO-296).
    async fn delete_patient(&mut self, patient_id: &str) -> anyhow::Result<bool>;
    /// How many procedures name the patient, for the refusal (PRO-296).
    async fn count_procedures_of_patient(&mut self, patient_id: &str) -> anyhow::Result<usize>;
    /// The duplicate dismissals that involve the patient go first (PRO-297).
    async fn delete_patient_dismissals(&mut self, patient_id: &str) -> anyhow::Result<()>;
    /// Whether the refused patient is still stored: then nothing counted it, a fault.
    async fn patient_exists(&mut self, patient_id: &str) -> anyhow::Result<bool>;
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

/// #705 — creating or deleting a procedure writes two bounded contexts: the
/// procedure (procedure) and its patient's latest-procedure tracking (patient).
/// Both happen, or neither (ADR-003).
#[async_trait::async_trait]
pub trait ProcedureTrackingUnitOfWork: Send {
    async fn insert_procedure(&mut self, procedure: &Procedure) -> anyhow::Result<()>;
    /// False when a payment record still refers to it, or no row matched (PRO-030).
    async fn delete_procedure(&mut self, procedure_id: &str) -> anyhow::Result<bool>;
    /// Whether the refused procedure is still stored: then a reference refused it.
    async fn procedure_exists(&mut self, procedure_id: &str) -> anyhow::Result<bool>;
    async fn update_patient(&mut self, patient: &Patient) -> anyhow::Result<()>;
}

/// What the orchestrator asks to run atomically.
pub type ProcedureTrackingOperation =
    Box<dyn for<'a> FnOnce(&'a mut dyn ProcedureTrackingUnitOfWork) -> UnitOfWorkFuture<'a> + Send>;

/// Runs an operation in one transaction: committed when it returns `Ok`,
/// rolled back when it returns `Err`.
#[async_trait::async_trait]
pub trait ProcedureTrackingTransactionManager: Send + Sync {
    async fn run(&self, operation: ProcedureTrackingOperation) -> anyhow::Result<()>;
}

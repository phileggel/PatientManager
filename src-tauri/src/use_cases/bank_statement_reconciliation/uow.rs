//! Unit of work for settling a fund payment group against the bank (ADR-003).
//!
//! Settling a group, or reverting it, writes two aggregates: the procedures of
//! the group and the group's own status. They change together or not at all:
//! a failure between the two leaves neither written.
//!
//! Declared per use case (B18: a use case imports no other use case). The
//! orchestrator loads and decides outside the unit of work, then hands the
//! writes to [`GroupSettlementTransactionManager::run`] and notifies through
//! the owning services once it has committed.

use crate::context::fund::FundPaymentGroupStatus;
use crate::context::procedure::Procedure;
use crate::shared::uow::UnitOfWorkFuture;

/// The writes a group settlement makes, on one transaction.
#[async_trait::async_trait]
pub trait GroupSettlementUnitOfWork: Send {
    async fn update_procedures(&mut self, procedures: Vec<Procedure>) -> anyhow::Result<()>;

    async fn update_group_status(
        &mut self,
        group_id: &str,
        status: FundPaymentGroupStatus,
    ) -> anyhow::Result<()>;
}

/// What a use case asks to run atomically.
pub type GroupSettlementOperation =
    Box<dyn for<'a> FnOnce(&'a mut dyn GroupSettlementUnitOfWork) -> UnitOfWorkFuture<'a> + Send>;

/// Runs an operation in one transaction: committed when it returns `Ok`,
/// rolled back when it returns `Err`.
#[async_trait::async_trait]
pub trait GroupSettlementTransactionManager: Send + Sync {
    async fn run(&self, operation: GroupSettlementOperation) -> anyhow::Result<()>;
}

/// Write the procedures of a group and the group's status in one transaction.
pub async fn settle_group(
    manager: &dyn GroupSettlementTransactionManager,
    procedures: Vec<Procedure>,
    group_id: &str,
    status: FundPaymentGroupStatus,
) -> anyhow::Result<()> {
    let group_id = group_id.to_string();
    manager
        .run(Box::new(move |uow| {
            Box::pin(async move {
                uow.update_procedures(procedures).await?;
                uow.update_group_status(&group_id, status).await
            })
        }))
        .await
}

/// Test double for orchestrator tests built on mocked repositories: it sends
/// the two writes to the repositories the test already observes. Not atomic —
/// atomicity is proven against SQLite in `sqlx_uow.rs`.
#[cfg(test)]
pub struct RepositoryGroupSettlement {
    pub procedures: std::sync::Arc<dyn crate::context::procedure::ProcedureRepository>,
    pub groups: std::sync::Arc<dyn crate::context::fund::FundPaymentRepository>,
}

#[cfg(test)]
#[async_trait::async_trait]
impl GroupSettlementUnitOfWork for RepositoryGroupSettlement {
    async fn update_procedures(&mut self, procedures: Vec<Procedure>) -> anyhow::Result<()> {
        self.procedures.update_batch(procedures).await.map(|_| ())
    }

    async fn update_group_status(
        &mut self,
        group_id: &str,
        status: FundPaymentGroupStatus,
    ) -> anyhow::Result<()> {
        self.groups.update_group_status(group_id, status).await
    }
}

#[cfg(test)]
#[async_trait::async_trait]
impl GroupSettlementTransactionManager for RepositoryGroupSettlement {
    async fn run(&self, operation: GroupSettlementOperation) -> anyhow::Result<()> {
        let mut uow = RepositoryGroupSettlement {
            procedures: self.procedures.clone(),
            groups: self.groups.clone(),
        };
        operation(&mut uow).await
    }
}

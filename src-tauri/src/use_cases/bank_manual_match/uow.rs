//! Units of work of manual bank matching (ADR-003): settling a fund payment
//! group against the bank, and writing a bank entry with all it changes.
//!
//! Settling a group, or reverting it, writes two aggregates: the procedures of
//! the group and the group's own status. They change together or not at all:
//! a failure between the two leaves neither written.
//!
//! Declared per use case (B18: a use case imports no other use case). The
//! orchestrator loads and decides outside the unit of work, then hands the
//! writes to [`GroupSettlementTransactionManager::run`] and notifies through
//! the owning services once it has committed.

use crate::context::bank::BankEntry;
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

/// The bank entry a command writes.
pub enum BankEntryChange {
    New(BankEntry),
    Edited(BankEntry),
}

/// What the bank entry ends up linked to; the previous links go.
pub enum BankEntrySelection {
    FundGroups(Vec<String>),
    Procedures(Vec<String>),
}

/// Everything a creation or an edit changes, decided before any write.
pub struct BankEntryWrites {
    pub entry: BankEntryChange,
    pub selection: BankEntrySelection,
    pub procedures: Vec<Procedure>,
    pub group_statuses: Vec<(String, FundPaymentGroupStatus)>,
}

/// The writes of a bank entry creation or edit, on one transaction.
#[async_trait::async_trait]
pub trait BankEntryUnitOfWork: Send {
    async fn insert_entry(&mut self, entry: &BankEntry) -> anyhow::Result<()>;

    async fn update_entry(&mut self, entry: &BankEntry) -> anyhow::Result<()>;

    async fn replace_fund_group_links(
        &mut self,
        entry_id: &str,
        group_ids: &[String],
    ) -> anyhow::Result<()>;

    async fn replace_procedure_links(
        &mut self,
        entry_id: &str,
        procedure_ids: &[String],
    ) -> anyhow::Result<()>;

    async fn update_procedures(&mut self, procedures: Vec<Procedure>) -> anyhow::Result<()>;

    async fn update_group_status(
        &mut self,
        group_id: &str,
        status: FundPaymentGroupStatus,
    ) -> anyhow::Result<()>;
}

/// What a use case asks to run atomically.
pub type BankEntryOperation =
    Box<dyn for<'a> FnOnce(&'a mut dyn BankEntryUnitOfWork) -> UnitOfWorkFuture<'a> + Send>;

/// Runs an operation in one transaction: committed when it returns `Ok`,
/// rolled back when it returns `Err`.
#[async_trait::async_trait]
pub trait BankEntryTransactionManager: Send + Sync {
    async fn write(&self, operation: BankEntryOperation) -> anyhow::Result<()>;
}

/// Write a bank entry, its links, its procedures and its groups' statuses in
/// one transaction.
pub async fn write_bank_entry(
    manager: &dyn BankEntryTransactionManager,
    writes: BankEntryWrites,
) -> anyhow::Result<()> {
    manager
        .write(Box::new(move |uow| {
            Box::pin(async move {
                let entry_id = match &writes.entry {
                    BankEntryChange::New(entry) => {
                        uow.insert_entry(entry).await?;
                        entry.id.as_str()
                    }
                    BankEntryChange::Edited(entry) => {
                        uow.update_entry(entry).await?;
                        entry.id.as_str()
                    }
                };
                match &writes.selection {
                    BankEntrySelection::FundGroups(group_ids) => {
                        uow.replace_fund_group_links(entry_id, group_ids).await?;
                    }
                    BankEntrySelection::Procedures(procedure_ids) => {
                        uow.replace_procedure_links(entry_id, procedure_ids).await?;
                    }
                }
                uow.update_procedures(writes.procedures).await?;
                for (group_id, status) in writes.group_statuses {
                    uow.update_group_status(&group_id, status).await?;
                }
                Ok(())
            })
        }))
        .await
}

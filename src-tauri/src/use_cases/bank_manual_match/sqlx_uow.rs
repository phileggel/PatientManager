//! The unit of work of manual bank matching over SQLite: the repositories' row
//! writers on one transaction of the shared `SqlxTransactionManager`.

use anyhow::Context;

use crate::context::bank::{BankEntry, SqliteBankEntryLinkRepository, SqliteBankEntryRepository};
use crate::context::fund::{FundPaymentGroupStatus, SqliteFundPaymentRepository};
use crate::context::procedure::{Procedure, SqliteProcedureRepository};
use crate::shared::uow::SqlxTransactionManager;

use super::uow::{BankEntryOperation, BankEntryTransactionManager, BankEntryUnitOfWork};

struct SqlxBankEntryUnitOfWork {
    tx: sqlx::Transaction<'static, sqlx::Sqlite>,
}

#[async_trait::async_trait]
impl BankEntryUnitOfWork for SqlxBankEntryUnitOfWork {
    async fn insert_entry(&mut self, entry: &BankEntry) -> anyhow::Result<()> {
        SqliteBankEntryRepository::insert_in(&mut self.tx, entry).await
    }

    async fn update_entry(&mut self, entry: &BankEntry) -> anyhow::Result<()> {
        SqliteBankEntryRepository::update_in(&mut self.tx, entry).await
    }

    async fn delete_entry(&mut self, entry_id: &str) -> anyhow::Result<()> {
        SqliteBankEntryRepository::delete_in(&mut self.tx, entry_id).await
    }

    async fn replace_fund_group_links(
        &mut self,
        entry_id: &str,
        group_ids: &[String],
    ) -> anyhow::Result<()> {
        SqliteBankEntryLinkRepository::unlink_all_fund_groups_in(&mut self.tx, entry_id).await?;
        SqliteBankEntryLinkRepository::link_fund_groups_in(&mut self.tx, entry_id, group_ids).await
    }

    async fn replace_procedure_links(
        &mut self,
        entry_id: &str,
        procedure_ids: &[String],
    ) -> anyhow::Result<()> {
        SqliteBankEntryLinkRepository::unlink_all_procedures_in(&mut self.tx, entry_id).await?;
        SqliteBankEntryLinkRepository::link_procedures_in(&mut self.tx, entry_id, procedure_ids)
            .await
    }

    async fn update_procedures(&mut self, procedures: Vec<Procedure>) -> anyhow::Result<()> {
        for procedure in &procedures {
            SqliteProcedureRepository::update_in(&mut self.tx, procedure).await?;
        }
        Ok(())
    }

    async fn update_group_status(
        &mut self,
        group_id: &str,
        status: FundPaymentGroupStatus,
    ) -> anyhow::Result<()> {
        SqliteFundPaymentRepository::update_group_status_in(&mut self.tx, group_id, status).await
    }
}

#[async_trait::async_trait]
impl BankEntryTransactionManager for SqlxTransactionManager {
    async fn write(&self, operation: BankEntryOperation) -> anyhow::Result<()> {
        let tx = self.begin().await?;
        let mut uow = SqlxBankEntryUnitOfWork { tx };
        // An `Err` returns here: dropping the transaction rolls it back.
        operation(&mut uow).await?;
        uow.tx
            .commit()
            .await
            .context("Failed to commit the bank entry")?;
        Ok(())
    }
}

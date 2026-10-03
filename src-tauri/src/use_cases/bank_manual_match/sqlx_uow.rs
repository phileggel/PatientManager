//! The group settlement unit of work over SQLite: the two repositories' row
//! writers on one transaction of the shared `SqlxTransactionManager`.

use anyhow::Context;

use crate::context::fund::{FundPaymentGroupStatus, SqliteFundPaymentRepository};
use crate::context::procedure::{Procedure, SqliteProcedureRepository};
use crate::shared::uow::SqlxTransactionManager;

use super::uow::{
    GroupSettlementOperation, GroupSettlementTransactionManager, GroupSettlementUnitOfWork,
};

struct SqlxGroupSettlementUnitOfWork {
    tx: sqlx::Transaction<'static, sqlx::Sqlite>,
}

#[async_trait::async_trait]
impl GroupSettlementUnitOfWork for SqlxGroupSettlementUnitOfWork {
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
impl GroupSettlementTransactionManager for SqlxTransactionManager {
    async fn run(&self, operation: GroupSettlementOperation) -> anyhow::Result<()> {
        let tx = self.begin().await?;
        let mut uow = SqlxGroupSettlementUnitOfWork { tx };
        // An `Err` returns here: dropping the transaction rolls it back.
        operation(&mut uow).await?;
        uow.tx
            .commit()
            .await
            .context("Failed to commit the group settlement")?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use sqlx::sqlite::SqlitePoolOptions;

    use sqlx::SqlitePool;

    use super::super::uow::settle_group;
    use super::*;
    use crate::context::procedure::{ProcedureRepository, ProcedureStatus};

    const PROCEDURE_ID: &str = "procedure-1";
    const GROUP_ID: &str = "group-1";

    async fn seeded_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory database");
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("migrations");
        for statement in [
            "INSERT INTO patient (id, is_anonymous, is_deleted) VALUES ('patient-1', 0, 0)",
            "INSERT INTO fund (id, fund_identifier, name, is_deleted) VALUES ('fund-1', 'F1', 'Fund 1', 0)",
            "INSERT INTO procedure_type (id, name, default_amount, is_deleted) VALUES ('type-1', 'Type 1', 100000, 0)",
            r#"INSERT INTO "procedure" (id, patient_id, procedure_type_id, procedure_date, billed_amount, payment_status, is_deleted) VALUES ('procedure-1', 'patient-1', 'type-1', '2026-03-10', 100000, 'RECONCILIATED', 0)"#,
            "INSERT INTO fund_payment_group (id, fund_id, payment_date, total_amount, status, is_deleted) VALUES ('group-1', 'fund-1', '2026-03-12', 100000, 'ACTIVE', 0)",
        ] {
            sqlx::query(statement)
                .execute(&pool)
                .await
                .expect("seed row");
        }
        pool
    }

    async fn fund_paid_procedure(pool: &SqlitePool) -> Procedure {
        let mut procedure = SqliteProcedureRepository::new(pool.clone())
            .read_procedures_by_ids(&[PROCEDURE_ID.to_string()])
            .await
            .expect("read procedure")
            .remove(0);
        procedure.payment_status = ProcedureStatus::FundPaid;
        procedure
    }

    async fn stored_statuses(pool: &SqlitePool) -> (String, String) {
        let procedure: (String,) =
            sqlx::query_as(r#"SELECT payment_status FROM "procedure" WHERE id = ?"#)
                .bind(PROCEDURE_ID)
                .fetch_one(pool)
                .await
                .expect("procedure status");
        let group: (String,) = sqlx::query_as("SELECT status FROM fund_payment_group WHERE id = ?")
            .bind(GROUP_ID)
            .fetch_one(pool)
            .await
            .expect("group status");
        (procedure.0, group.0)
    }

    #[tokio::test]
    async fn test_todo_017_settle_group_writes_the_procedures_and_the_status() {
        let pool = seeded_pool().await;
        let before = stored_statuses(&pool).await;
        let procedure = fund_paid_procedure(&pool).await;
        let manager = SqlxTransactionManager::new(pool.clone());

        settle_group(
            &manager,
            vec![procedure],
            GROUP_ID,
            FundPaymentGroupStatus::BankPaid,
        )
        .await
        .expect("settlement commits");

        let after = stored_statuses(&pool).await;
        assert_ne!(after.0, before.0, "the procedure status changed");
        assert_ne!(after.1, before.1, "the group status changed");
    }

    #[tokio::test]
    async fn test_todo_017_a_failure_between_the_two_writes_applies_neither() {
        let pool = seeded_pool().await;
        let before = stored_statuses(&pool).await;
        let procedure = fund_paid_procedure(&pool).await;
        let manager = SqlxTransactionManager::new(pool.clone());

        let result = manager
            .run(Box::new(move |uow| {
                Box::pin(async move {
                    uow.update_procedures(vec![procedure]).await?;
                    anyhow::bail!("forced failure before the group status is written")
                })
            }))
            .await;

        assert!(result.is_err());
        assert_eq!(
            stored_statuses(&pool).await,
            before,
            "the procedure write is rolled back with the failed unit of work"
        );
    }

    #[tokio::test]
    async fn test_todo_017_a_failed_status_write_rolls_the_procedures_back() {
        let pool = seeded_pool().await;
        let before = stored_statuses(&pool).await;
        let procedure = fund_paid_procedure(&pool).await;
        let manager = SqlxTransactionManager::new(pool.clone());
        // The status write fails on its own: the table it targets is gone.
        sqlx::query("ALTER TABLE fund_payment_group RENAME TO fund_payment_group_moved")
            .execute(&pool)
            .await
            .expect("rename table");

        let result = settle_group(
            &manager,
            vec![procedure],
            GROUP_ID,
            FundPaymentGroupStatus::BankPaid,
        )
        .await;

        sqlx::query("ALTER TABLE fund_payment_group_moved RENAME TO fund_payment_group")
            .execute(&pool)
            .await
            .expect("rename table back");
        assert!(result.is_err());
        assert_eq!(stored_statuses(&pool).await, before);
    }
}

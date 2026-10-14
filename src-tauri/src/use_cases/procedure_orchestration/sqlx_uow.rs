//! The deletion unit of work over SQLite: the repositories' row writers on one
//! transaction of the shared `SqlxTransactionManager` (ADR-003).

use anyhow::Context;

use crate::context::fund::SqliteFundRepository;
use crate::context::patient::SqlitePatientRepository;
use crate::context::procedure::SqliteProcedureTypeRepository;
use crate::shared::uow::SqlxTransactionManager;

use super::uow::{DeletionOperation, DeletionTransactionManager, DeletionUnitOfWork};

struct SqlxDeletionUnitOfWork {
    tx: sqlx::Transaction<'static, sqlx::Sqlite>,
}

#[async_trait::async_trait]
impl DeletionUnitOfWork for SqlxDeletionUnitOfWork {
    async fn delete_procedure_type(&mut self, procedure_type_id: &str) -> anyhow::Result<()> {
        SqliteProcedureTypeRepository::soft_delete_in(&mut self.tx, procedure_type_id).await
    }

    async fn clear_procedure_type_defaults(
        &mut self,
        procedure_type_id: &str,
    ) -> anyhow::Result<()> {
        SqlitePatientRepository::clear_procedure_type_defaults_in(&mut self.tx, procedure_type_id)
            .await
    }

    async fn delete_fund(&mut self, fund_id: &str) -> anyhow::Result<()> {
        SqliteFundRepository::soft_delete_in(&mut self.tx, fund_id).await
    }

    async fn clear_fund_defaults(&mut self, fund_id: &str) -> anyhow::Result<()> {
        SqlitePatientRepository::clear_fund_defaults_in(&mut self.tx, fund_id).await
    }
}

#[async_trait::async_trait]
impl DeletionTransactionManager for SqlxTransactionManager {
    async fn run(&self, operation: DeletionOperation) -> anyhow::Result<()> {
        let tx = self.begin().await?;
        let mut uow = SqlxDeletionUnitOfWork { tx };
        // An `Err` returns here: dropping the transaction rolls it back.
        operation(&mut uow).await?;
        uow.tx
            .commit()
            .await
            .context("Failed to commit the deletion")?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use anyhow::anyhow;
    use sqlx::sqlite::SqlitePoolOptions;
    use sqlx::SqlitePool;

    use super::*;

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
            "INSERT INTO procedure_type (id, name, default_amount, is_deleted) VALUES ('gone-type', 'Gone', 100000, 0)",
            "INSERT INTO procedure_type (id, name, default_amount, is_deleted) VALUES ('kept-type', 'Kept', 100000, 0)",
            "INSERT INTO fund (id, fund_identifier, name, is_deleted) VALUES ('gone-fund', '75', 'Fund 75', 0)",
            "INSERT INTO fund (id, fund_identifier, name, is_deleted) VALUES ('kept-fund', '93', 'Fund 93', 0)",
            "INSERT INTO patient (id, name, is_anonymous, is_deleted, latest_procedure_type, latest_fund, latest_date) VALUES ('on-gone', 'Patient A', 0, 0, 'gone-type', 'gone-fund', '2026-03-10')",
            "INSERT INTO patient (id, name, is_anonymous, is_deleted, latest_procedure_type, latest_fund, latest_date) VALUES ('on-kept', 'Patient B', 0, 0, 'kept-type', 'kept-fund', '2026-03-11')",
        ] {
            sqlx::query(statement)
                .execute(&pool)
                .await
                .expect("seed");
        }
        pool
    }

    /// (latest_procedure_type, latest_fund, latest_date) of a patient.
    async fn defaults(
        pool: &SqlitePool,
        patient_id: &str,
    ) -> (Option<String>, Option<String>, Option<String>) {
        sqlx::query_as(
            "SELECT latest_procedure_type, latest_fund, latest_date FROM patient WHERE id = ?",
        )
        .bind(patient_id)
        .fetch_one(pool)
        .await
        .expect("patient")
    }

    async fn is_deleted(pool: &SqlitePool, sql: &'static str, id: &str) -> bool {
        let (deleted,): (bool,) = sqlx::query_as(sql)
            .bind(id)
            .fetch_one(pool)
            .await
            .expect("row");
        deleted
    }

    const PROCEDURE_TYPE_DELETED: &str = "SELECT is_deleted FROM procedure_type WHERE id = ?";
    const FUND_DELETED: &str = "SELECT is_deleted FROM fund WHERE id = ?";

    #[tokio::test]
    async fn pro_280_a_deleted_procedure_type_leaves_no_patient_default() {
        let pool = seeded_pool().await;

        SqlxTransactionManager::new(pool.clone())
            .run(Box::new(|uow| {
                Box::pin(async move {
                    uow.delete_procedure_type("gone-type").await?;
                    uow.clear_procedure_type_defaults("gone-type").await
                })
            }))
            .await
            .unwrap();

        assert!(is_deleted(&pool, PROCEDURE_TYPE_DELETED, "gone-type").await);
        assert_eq!(
            defaults(&pool, "on-gone").await,
            (None, Some("gone-fund".into()), None)
        );
        assert_eq!(
            defaults(&pool, "on-kept").await,
            (
                Some("kept-type".into()),
                Some("kept-fund".into()),
                Some("2026-03-11".into())
            )
        );
    }

    #[tokio::test]
    async fn pro_290_a_deleted_fund_leaves_no_patient_default() {
        let pool = seeded_pool().await;

        SqlxTransactionManager::new(pool.clone())
            .run(Box::new(|uow| {
                Box::pin(async move {
                    uow.delete_fund("gone-fund").await?;
                    uow.clear_fund_defaults("gone-fund").await
                })
            }))
            .await
            .unwrap();

        assert!(is_deleted(&pool, FUND_DELETED, "gone-fund").await);
        assert_eq!(
            defaults(&pool, "on-gone").await,
            (Some("gone-type".into()), None, Some("2026-03-10".into()))
        );
        assert_eq!(defaults(&pool, "on-kept").await.1, Some("kept-fund".into()));
    }

    #[tokio::test]
    async fn a_failed_deletion_keeps_the_fund_and_the_defaults() {
        let pool = seeded_pool().await;

        let result = SqlxTransactionManager::new(pool.clone())
            .run(Box::new(|uow| {
                Box::pin(async move {
                    uow.delete_fund("gone-fund").await?;
                    uow.clear_fund_defaults("gone-fund").await?;
                    Err(anyhow!("a later write failed"))
                })
            }))
            .await;

        assert!(result.is_err());
        assert!(!is_deleted(&pool, FUND_DELETED, "gone-fund").await);
        assert_eq!(defaults(&pool, "on-gone").await.1, Some("gone-fund".into()));
    }
}

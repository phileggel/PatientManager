//! The patient merge unit of work over SQLite: the repositories' row writers on
//! one transaction of the shared `SqlxTransactionManager` (ADR-003).

use anyhow::Context;

use crate::context::patient::{Patient, SqlitePatientRepository};
use crate::context::procedure::SqliteProcedureRepository;
use crate::shared::uow::SqlxTransactionManager;

use super::uow::{PatientMergeOperation, PatientMergeTransactionManager, PatientMergeUnitOfWork};

struct SqlxPatientMergeUnitOfWork {
    tx: sqlx::Transaction<'static, sqlx::Sqlite>,
}

#[async_trait::async_trait]
impl PatientMergeUnitOfWork for SqlxPatientMergeUnitOfWork {
    async fn reassign_procedures(&mut self, from_id: &str, to_id: &str) -> anyhow::Result<()> {
        SqliteProcedureRepository::reassign_patient_in(&mut self.tx, from_id, to_id)
            .await
            .map(|_| ())
    }

    async fn update_patient(&mut self, patient: &Patient) -> anyhow::Result<()> {
        SqlitePatientRepository::update_in(&mut self.tx, patient).await
    }

    async fn delete_patient(&mut self, patient_id: &str) -> anyhow::Result<()> {
        SqlitePatientRepository::soft_delete_in(&mut self.tx, patient_id).await
    }

    async fn delete_dismissals_of(&mut self, patient_id: &str) -> anyhow::Result<()> {
        SqlitePatientRepository::delete_duplicate_dismissals_of_in(&mut self.tx, patient_id).await
    }
}

#[async_trait::async_trait]
impl PatientMergeTransactionManager for SqlxTransactionManager {
    async fn run(&self, operation: PatientMergeOperation) -> anyhow::Result<()> {
        let tx = self.begin().await?;
        let mut uow = SqlxPatientMergeUnitOfWork { tx };
        // An `Err` returns here: dropping the transaction rolls it back.
        operation(&mut uow).await?;
        uow.tx
            .commit()
            .await
            .context("Failed to commit the patient merge")?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use sqlx::sqlite::SqlitePoolOptions;
    use sqlx::SqlitePool;

    use super::*;
    use crate::context::patient::PatientRepository;

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
            "INSERT INTO patient (id, name, is_anonymous, is_deleted) VALUES ('kept', 'Marie Dupont', 0, 0)",
            "INSERT INTO patient (id, name, ssn, is_anonymous, is_deleted) VALUES ('other', 'Marie Dupont', '1234567890123', 0, 0)",
            "INSERT INTO patient (id, name, is_anonymous, is_deleted) VALUES ('third', 'Marie Dupont', 0, 0)",
            "INSERT INTO procedure_type (id, name, default_amount, is_deleted) VALUES ('type-1', 'Type 1', 100000, 0)",
            r#"INSERT INTO "procedure" (id, patient_id, procedure_type_id, procedure_date, billed_amount, payment_status, is_deleted) VALUES ('live', 'other', 'type-1', '2026-03-10', 100000, 'RECONCILIATED', 0)"#,
            r#"INSERT INTO "procedure" (id, patient_id, procedure_type_id, procedure_date, billed_amount, payment_status, is_deleted) VALUES ('deleted', 'other', 'type-1', '2026-03-11', 100000, 'NONE', 1)"#,
            "INSERT INTO patient_duplicate_dismissal (id, patient_a_id, patient_b_id) VALUES ('d1', 'other', 'third')",
        ] {
            sqlx::query(statement)
                .execute(&pool)
                .await
                .expect("seed");
        }
        pool
    }

    /// (procedures on `kept`, procedures on `other`, `other` is deleted, dismissals left)
    async fn stored(pool: &SqlitePool) -> (i64, i64, bool, i64) {
        let count = |sql: &'static str| async move {
            let (n,): (i64,) = sqlx::query_as(sql).fetch_one(pool).await.expect("count");
            n
        };
        (
            count(r#"SELECT COUNT(*) FROM "procedure" WHERE patient_id = 'kept'"#).await,
            count(r#"SELECT COUNT(*) FROM "procedure" WHERE patient_id = 'other'"#).await,
            count("SELECT is_deleted FROM patient WHERE id = 'other'").await == 1,
            count("SELECT COUNT(*) FROM patient_duplicate_dismissal").await,
        )
    }

    async fn merged_patient(pool: &SqlitePool) -> Patient {
        let repo = SqlitePatientRepository::new(pool.clone());
        let kept = repo
            .read_patient("kept")
            .await
            .expect("read")
            .expect("kept");
        let other = repo
            .read_patient("other")
            .await
            .expect("read")
            .expect("other");
        kept.absorb(&other)
    }

    #[tokio::test]
    async fn test_pdu_021_a_merge_moves_every_procedure_and_deletes_the_other_patient() {
        let pool = seeded_pool().await;
        let merged = merged_patient(&pool).await;

        SqlxTransactionManager::new(pool.clone())
            .run(Box::new(move |uow| {
                Box::pin(async move {
                    uow.reassign_procedures("other", "kept").await?;
                    uow.update_patient(&merged).await?;
                    uow.delete_patient("other").await?;
                    uow.delete_dismissals_of("other").await
                })
            }))
            .await
            .expect("merge");

        // PDU-021: the deleted procedure moved too. PDU-026: the dismissal is gone.
        assert_eq!(stored(&pool).await, (2, 0, true, 0));
        let kept = SqlitePatientRepository::new(pool.clone())
            .read_patient("kept")
            .await
            .expect("read")
            .expect("kept");
        assert_eq!(kept.ssn.as_deref(), Some("1234567890123"), "PDU-022");
    }

    #[tokio::test]
    async fn test_pdu_024_a_failure_after_the_first_writes_applies_none_of_them() {
        let pool = seeded_pool().await;
        let merged = merged_patient(&pool).await;

        let result = SqlxTransactionManager::new(pool.clone())
            .run(Box::new(move |uow| {
                Box::pin(async move {
                    uow.reassign_procedures("other", "kept").await?;
                    uow.update_patient(&merged).await?;
                    uow.delete_patient("other").await?;
                    anyhow::bail!("failure before the last write")
                })
            }))
            .await;

        assert!(result.is_err());
        assert_eq!(stored(&pool).await, (0, 2, false, 1));
        let kept = SqlitePatientRepository::new(pool.clone())
            .read_patient("kept")
            .await
            .expect("read")
            .expect("kept");
        assert_eq!(kept.ssn, None);
    }
}

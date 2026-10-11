//! The statement validation unit of work over SQLite: the repositories' row
//! writers on one transaction of the shared `SqlxTransactionManager` (ADR-003).

use anyhow::Context;

use crate::context::fund::{
    Fund, FundPaymentGroup, SqliteFundPaymentRepository, SqliteFundRepository,
};
use crate::context::patient::{Patient, SqlitePatientRepository};
use crate::context::procedure::{Procedure, SqliteProcedureRepository};
use crate::shared::uow::SqlxTransactionManager;

use super::uow::{
    StatementValidationOperation, StatementValidationTransactionManager,
    StatementValidationUnitOfWork,
};

struct SqlxStatementValidationUnitOfWork {
    tx: sqlx::Transaction<'static, sqlx::Sqlite>,
}

#[async_trait::async_trait]
impl StatementValidationUnitOfWork for SqlxStatementValidationUnitOfWork {
    async fn create_funds(&mut self, funds: &[Fund]) -> anyhow::Result<()> {
        for fund in funds {
            SqliteFundRepository::insert_in(&mut self.tx, fund).await?;
        }
        Ok(())
    }

    async fn create_patients(&mut self, patients: &[Patient]) -> anyhow::Result<()> {
        for patient in patients {
            SqlitePatientRepository::insert_in(&mut self.tx, patient).await?;
        }
        Ok(())
    }

    async fn update_patients(&mut self, patients: &[Patient]) -> anyhow::Result<()> {
        for patient in patients {
            SqlitePatientRepository::update_in(&mut self.tx, patient).await?;
        }
        Ok(())
    }

    async fn create_procedures(&mut self, procedures: &[Procedure]) -> anyhow::Result<()> {
        for procedure in procedures {
            SqliteProcedureRepository::insert_in(&mut self.tx, procedure).await?;
        }
        Ok(())
    }

    async fn update_procedures(&mut self, procedures: &[Procedure]) -> anyhow::Result<()> {
        for procedure in procedures {
            SqliteProcedureRepository::update_in(&mut self.tx, procedure).await?;
        }
        Ok(())
    }

    async fn create_groups(&mut self, groups: &[FundPaymentGroup]) -> anyhow::Result<()> {
        for group in groups {
            SqliteFundPaymentRepository::insert_group_in(&mut self.tx, group).await?;
        }
        Ok(())
    }
}

#[async_trait::async_trait]
impl StatementValidationTransactionManager for SqlxTransactionManager {
    async fn run(&self, operation: StatementValidationOperation) -> anyhow::Result<()> {
        let tx = self.begin().await?;
        let mut uow = SqlxStatementValidationUnitOfWork { tx };
        // An `Err` returns here: dropping the transaction rolls it back.
        operation(&mut uow).await?;
        uow.tx
            .commit()
            .await
            .context("Failed to commit the statement validation")?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use chrono::NaiveDate;
    use sqlx::sqlite::SqlitePoolOptions;
    use sqlx::SqlitePool;

    use super::*;
    use crate::context::fund::FundPaymentLine;
    use crate::context::procedure::{PaymentMethod, ProcedureStatus};

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
            "INSERT INTO patient (id, name, is_anonymous, is_deleted) VALUES ('known', 'Known Patient', 0, 0)",
            "INSERT OR IGNORE INTO procedure_type (id, name, default_amount, is_deleted) VALUES ('type-1', 'Type 1', 100000, 0)",
            r#"INSERT INTO "procedure" (id, patient_id, procedure_type_id, procedure_date, billed_amount, payment_status, is_deleted) VALUES ('existing', 'known', 'type-1', '2026-03-10', 100000, 'CREATED', 0)"#,
        ] {
            sqlx::query(statement)
                .execute(&pool)
                .await
                .expect("seed");
        }
        pool
    }

    /// What one validation writes: a fund, a patient, a procedure of that
    /// patient, a correction of an existing procedure and of a patient, and a
    /// group holding both procedures.
    struct Writes {
        fund: Fund,
        patient: Patient,
        known: Patient,
        created: Procedure,
        corrected: Procedure,
        group: FundPaymentGroup,
    }

    async fn writes(pool: &SqlitePool) -> Writes {
        use crate::context::patient::PatientRepository;
        use crate::context::procedure::ProcedureRepository;

        let date = NaiveDate::from_ymd_opt(2026, 3, 20).expect("date");
        let fund = Fund::new("931".to_string(), "CPAM n° 931".to_string()).expect("fund");
        let patient = Patient::new(
            false,
            Some("New Patient".to_string()),
            Some("1234567890123".to_string()),
        )
        .expect("patient");
        let mut known = SqlitePatientRepository::new(pool.clone())
            .read_patient("known")
            .await
            .expect("read")
            .expect("known");
        known.ssn = Some("2234567890123".to_string());
        let created = Procedure::new(
            patient.id.clone(),
            Some(fund.id.clone()),
            "type-1".to_string(),
            date,
            40_000,
            PaymentMethod::None,
            Some(date),
            None,
            Some(40_000),
            ProcedureStatus::Reconciled,
        )
        .expect("procedure");
        let mut corrected = SqliteProcedureRepository::new(pool.clone())
            .read_procedures_by_ids(&["existing".to_string()])
            .await
            .expect("read")
            .remove(0);
        corrected.billed_amount = 60_000;
        corrected.paid_amount = Some(60_000);
        corrected.payment_status = ProcedureStatus::Reconciled;
        let mut group =
            FundPaymentGroup::new(fund.id.clone(), "2026-03-20".to_string(), 100_000, vec![])
                .expect("group");
        group.lines = vec![
            FundPaymentLine::new(group.id.clone(), created.id.clone()).expect("line"),
            FundPaymentLine::new(group.id.clone(), corrected.id.clone()).expect("line"),
        ];
        Writes {
            fund,
            patient,
            known,
            created,
            corrected,
            group,
        }
    }

    /// (funds, patients, procedures, groups, lines, the existing procedure's
    /// billed amount, whether the known patient has an SSN)
    async fn stored(pool: &SqlitePool) -> (i64, i64, i64, i64, i64, i64, bool) {
        let count = |sql: &'static str| async move {
            let (n,): (i64,) = sqlx::query_as(sql).fetch_one(pool).await.expect("count");
            n
        };
        (
            count("SELECT COUNT(*) FROM fund WHERE fund_identifier = '931'").await,
            count("SELECT COUNT(*) FROM patient").await,
            count(r#"SELECT COUNT(*) FROM "procedure""#).await,
            count("SELECT COUNT(*) FROM fund_payment_group").await,
            count("SELECT COUNT(*) FROM fund_payment_line").await,
            count(r#"SELECT billed_amount FROM "procedure" WHERE id = 'existing'"#).await,
            count("SELECT COUNT(*) FROM patient WHERE id = 'known' AND ssn IS NOT NULL").await == 1,
        )
    }

    async fn run_all(pool: &SqlitePool, w: Writes, then_fail: bool) -> anyhow::Result<()> {
        SqlxTransactionManager::new(pool.clone())
            .run(Box::new(move |uow| {
                Box::pin(async move {
                    uow.create_funds(&[w.fund]).await?;
                    uow.create_patients(&[w.patient]).await?;
                    uow.create_procedures(&[w.created]).await?;
                    uow.update_procedures(&[w.corrected]).await?;
                    uow.update_patients(&[w.known]).await?;
                    uow.create_groups(std::slice::from_ref(&w.group)).await?;
                    if then_fail {
                        // The same group again: the database refuses its identifier.
                        uow.create_groups(&[w.group]).await?;
                    }
                    Ok(())
                })
            }))
            .await
    }

    #[tokio::test]
    async fn test_fpa_076_a_validation_writes_everything_together() {
        let pool = seeded_pool().await;
        let before = stored(&pool).await;
        let w = writes(&pool).await;

        run_all(&pool, w, false).await.expect("validation");

        assert_eq!(
            stored(&pool).await,
            (1, before.1 + 1, before.2 + 1, 1, 2, 60_000, true)
        );
    }

    #[tokio::test]
    async fn test_fpa_076_a_failure_on_the_last_write_keeps_none_of_them() {
        let pool = seeded_pool().await;
        let before = stored(&pool).await;
        let w = writes(&pool).await;

        let result = run_all(&pool, w, true).await;

        assert!(result.is_err());
        assert_eq!(stored(&pool).await, before);
        assert_eq!(before.5, 100_000);
    }
}

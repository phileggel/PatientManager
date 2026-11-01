//! The Excel import unit of work over SQLite: the repositories' row writers on
//! one transaction of the shared `SqlxTransactionManager` (ADR-003).

use anyhow::Context;

use crate::context::fund::{Fund, SqliteFundRepository};
use crate::context::patient::{Patient, SqlitePatientRepository};
use crate::context::procedure::{Procedure, SqliteProcedureRepository};
use crate::shared::uow::SqlxTransactionManager;

use super::uow::{ExcelImportOperation, ExcelImportTransactionManager, ExcelImportUnitOfWork};

struct SqlxExcelImportUnitOfWork {
    tx: sqlx::Transaction<'static, sqlx::Sqlite>,
}

#[async_trait::async_trait]
impl ExcelImportUnitOfWork for SqlxExcelImportUnitOfWork {
    async fn insert_patient(&mut self, patient: &Patient) -> anyhow::Result<()> {
        SqlitePatientRepository::insert_in(&mut self.tx, patient).await
    }

    async fn insert_fund(&mut self, fund: &Fund) -> anyhow::Result<()> {
        SqliteFundRepository::insert_in(&mut self.tx, fund).await
    }

    async fn delete_procedures_of_month(&mut self, month: &str) -> anyhow::Result<u64> {
        SqliteProcedureRepository::delete_by_month_in(&mut self.tx, month).await
    }

    async fn insert_procedure(&mut self, procedure: &Procedure) -> anyhow::Result<()> {
        SqliteProcedureRepository::insert_in(&mut self.tx, procedure).await
    }

    async fn update_patient(&mut self, patient: &Patient) -> anyhow::Result<()> {
        SqlitePatientRepository::update_in(&mut self.tx, patient).await
    }
}

#[async_trait::async_trait]
impl ExcelImportTransactionManager for SqlxTransactionManager {
    async fn run(&self, operation: ExcelImportOperation) -> anyhow::Result<()> {
        let tx = self.begin().await?;
        let mut uow = SqlxExcelImportUnitOfWork { tx };
        // An `Err` returns here: dropping the transaction rolls it back.
        operation(&mut uow).await?;
        uow.tx
            .commit()
            .await
            .context("Failed to commit the Excel import")?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::sync::Arc;

    use sqlx::sqlite::SqlitePoolOptions;
    use sqlx::SqlitePool;

    use crate::context::fund::{FundService, SqliteFundRepository};
    use crate::context::patient::{PatientService, SqlitePatientRepository};
    use crate::context::procedure::{
        ProcedureService, SqliteProcedureRefundRepository, SqliteProcedureRepository,
        SqliteProcedureTypeRepository,
    };
    use crate::shared::event_bus::{EventBus, FundUpdated, PatientUpdated, ProcedureUpdated};
    use crate::shared::uow::SqlxTransactionManager;
    use crate::use_cases::excel_import::dto::ParseExcelResponse;
    use crate::use_cases::excel_import::excel_codec::{
        ExcelFund, ExcelPatient, ExcelProcedure, ParsingIssues,
    };
    use crate::use_cases::excel_import::orchestrator::ExcelImportOrchestrator;
    use crate::use_cases::procedure_orchestration::ProcedureOrchestrationService;

    /// January and February each hold one `Created` procedure, neither blocking.
    /// February's is still referenced by the line of a deleted fund payment, so
    /// the database refuses to purge that month (the failure #435 removes).
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
            "INSERT INTO patient (id, name, ssn, is_anonymous, is_deleted) VALUES ('known', 'Marie Dupont', '1234567890123', 0, 0)",
            "INSERT INTO procedure_type (id, name, default_amount, is_deleted) VALUES ('type-1', 'Type 1', 100000, 0)",
            "INSERT INTO fund (id, fund_identifier, name, is_deleted) VALUES ('fund-1', '75', 'Caisse 75', 0)",
            r#"INSERT INTO "procedure" (id, patient_id, procedure_type_id, procedure_date, billed_amount, payment_status, is_deleted) VALUES ('jan-old', 'known', 'type-1', '2026-01-10', 100000, 'CREATED', 0)"#,
            r#"INSERT INTO "procedure" (id, patient_id, procedure_type_id, procedure_date, billed_amount, payment_status, is_deleted) VALUES ('feb-old', 'known', 'type-1', '2026-02-10', 100000, 'CREATED', 0)"#,
            "INSERT INTO fund_payment_group (id, fund_id, payment_date, total_amount, status, is_deleted) VALUES ('group-1', 'fund-1', '2026-02-20', 100000, 'ACTIVE', 1)",
            "INSERT INTO fund_payment_line (id, fund_payment_group_id, procedure_id, is_deleted) VALUES ('line-1', 'group-1', 'feb-old', 1)",
        ] {
            sqlx::query(statement)
                .execute(&pool)
                .await
                .expect("seed");
        }
        pool
    }

    fn orchestrator(pool: &SqlitePool) -> ExcelImportOrchestrator {
        orchestrator_on(pool, Arc::new(EventBus::new()))
    }

    fn orchestrator_on(pool: &SqlitePool, bus: Arc<EventBus>) -> ExcelImportOrchestrator {
        let patient_repo = Arc::new(SqlitePatientRepository::new(pool.clone()));
        let fund_repo = Arc::new(SqliteFundRepository::new(pool.clone()));
        let procedure_service = Arc::new(ProcedureService::new(
            Arc::new(SqliteProcedureRepository::new(pool.clone())),
            bus.clone(),
        ));
        ExcelImportOrchestrator::new(
            Arc::new(PatientService::new(patient_repo.clone(), bus.clone())),
            Arc::new(FundService::new(fund_repo.clone(), bus.clone())),
            procedure_service.clone(),
            Arc::new(ProcedureOrchestrationService::new(
                procedure_service,
                patient_repo,
                Arc::new(SqliteProcedureTypeRepository::new(pool.clone())),
                fund_repo,
                Arc::new(SqliteProcedureRefundRepository::new(pool.clone())),
            )),
            Arc::new(SqlxTransactionManager::new(pool.clone())),
        )
    }

    fn row(sheet: &str, date: &str) -> ExcelProcedure {
        ExcelProcedure {
            patient_temp_id: "tmp-new".to_string(),
            fund_temp_id: Some("tmp-fund".to_string()),
            procedure_type_tmp_id: "tmp-type".to_string(),
            amount: 100000,
            procedure_date: date.to_string(),
            sheet_month: sheet.to_string(),
            payment_method: None,
            confirmed_payment_date: None,
            paid_amount: None,
            awaited_amount: None,
            source_row: 2,
        }
    }

    /// A workbook bringing one patient and one fund the database does not hold.
    fn workbook(procedures: Vec<ExcelProcedure>) -> ParseExcelResponse {
        ParseExcelResponse {
            patients: vec![ExcelPatient {
                temp_id: "tmp-new".to_string(),
                name: "Jean Martin".to_string(),
                ssn: "9876543210987".to_string(),
                latest_fund: None,
            }],
            funds: vec![ExcelFund {
                temp_id: "tmp-fund".to_string(),
                fund_identifier: "59".to_string(),
                fund_name: "Caisse 59".to_string(),
                fund_address: None,
            }],
            total_records: procedures.len() as u32,
            procedures,
            parsing_issues: ParsingIssues {
                skipped_rows: vec![],
                missing_sheets: vec![],
            },
        }
    }

    fn mapping(type_id: &str) -> HashMap<String, String> {
        HashMap::from([("tmp-type".to_string(), type_id.to_string())])
    }

    /// (procedure ids, patients, funds) in the database.
    async fn stored(pool: &SqlitePool) -> (Vec<String>, i64, i64) {
        let ids: Vec<(String,)> = sqlx::query_as(r#"SELECT id FROM "procedure" ORDER BY id"#)
            .fetch_all(pool)
            .await
            .expect("procedures");
        let (patients,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM patient")
            .fetch_one(pool)
            .await
            .expect("patients");
        let (funds,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM fund")
            .fetch_one(pool)
            .await
            .expect("funds");
        (ids.into_iter().map(|(id,)| id).collect(), patients, funds)
    }

    fn untouched() -> (Vec<String>, i64, i64) {
        (vec!["feb-old".to_string(), "jan-old".to_string()], 1, 1)
    }

    #[tokio::test]
    async fn test_580_a_failure_on_the_second_month_changes_nothing() {
        let pool = seeded_pool().await;

        let result = orchestrator(&pool)
            .execute_import(
                workbook(vec![row("Jan", "2026-01-15"), row("Fév", "2026-02-15")]),
                mapping("type-1"),
                vec!["Jan".to_string(), "Fév".to_string()],
            )
            .await;

        assert!(result.is_err());
        assert_eq!(stored(&pool).await, untouched());
    }

    #[tokio::test]
    async fn test_580_a_failure_at_the_creation_changes_nothing() {
        let pool = seeded_pool().await;

        // No such procedure type: the database refuses the new procedure.
        let result = orchestrator(&pool)
            .execute_import(
                workbook(vec![row("Jan", "2026-01-15")]),
                mapping("no-such-type"),
                vec!["Jan".to_string()],
            )
            .await;

        assert!(result.is_err());
        assert_eq!(stored(&pool).await, untouched());
    }

    #[tokio::test]
    async fn test_exi_177_a_failed_import_raises_no_event_and_a_successful_one_each_once() {
        let pool = seeded_pool().await;
        let bus = Arc::new(EventBus::new());
        let mut patients = bus.subscribe::<PatientUpdated>().expect("subscribe");
        let mut funds = bus.subscribe::<FundUpdated>().expect("subscribe");
        let mut procedures = bus.subscribe::<ProcedureUpdated>().expect("subscribe");
        let orchestrator = orchestrator_on(&pool, bus);

        let failed = orchestrator
            .execute_import(
                workbook(vec![row("Jan", "2026-01-15")]),
                mapping("no-such-type"),
                vec!["Jan".to_string()],
            )
            .await;
        assert!(failed.is_err());
        assert!(patients.try_recv().is_err());
        assert!(funds.try_recv().is_err());
        assert!(procedures.try_recv().is_err());

        orchestrator
            .execute_import(
                workbook(vec![row("Jan", "2026-01-15")]),
                mapping("type-1"),
                vec!["Jan".to_string()],
            )
            .await
            .expect("the import succeeds");
        for received in [
            patients.try_recv().is_ok(),
            funds.try_recv().is_ok(),
            procedures.try_recv().is_ok(),
        ] {
            assert!(received);
        }
        assert!(patients.try_recv().is_err());
        assert!(funds.try_recv().is_err());
        assert!(procedures.try_recv().is_err());
    }

    #[tokio::test]
    async fn test_580_a_failure_at_the_tracking_update_changes_nothing() {
        let pool = seeded_pool().await;
        sqlx::query(
            "CREATE TRIGGER refuse_tracking BEFORE UPDATE ON patient BEGIN SELECT RAISE(ABORT, 'refused'); END",
        )
        .execute(&pool)
        .await
        .expect("trigger");

        let result = orchestrator(&pool)
            .execute_import(
                workbook(vec![row("Jan", "2026-01-15")]),
                mapping("type-1"),
                vec!["Jan".to_string()],
            )
            .await;

        assert!(result.is_err());
        assert_eq!(stored(&pool).await, untouched());
    }

    /// EXI-179: a workbook patient the domain refuses has its own error, and nothing changes.
    #[tokio::test]
    async fn test_exi_179_a_patient_that_fails_validation_changes_nothing() {
        let pool = seeded_pool().await;
        let mut parsed = workbook(vec![row("Jan", "2026-01-15")]);
        for patient in &mut parsed.patients {
            patient.name = String::new();
            patient.ssn = String::new();
        }

        let err = orchestrator(&pool)
            .execute_import(parsed, mapping("type-1"), vec!["Jan".to_string()])
            .await
            .expect_err("the import fails");

        assert_eq!(
            err,
            crate::use_cases::excel_import::ExcelImportError::PatientInvalid
        );
        assert_eq!(stored(&pool).await, untouched());
    }

    /// EXI-176: a blocked month is left alone while the other month is imported.
    #[tokio::test]
    async fn test_exi_176_the_import_goes_on_beside_a_blocked_month() {
        let pool = seeded_pool().await;
        sqlx::query(
            r#"UPDATE "procedure" SET payment_status = 'RECONCILIATED' WHERE id = 'feb-old'"#,
        )
        .execute(&pool)
        .await
        .expect("block February");

        let result = orchestrator(&pool)
            .execute_import(
                workbook(vec![row("Jan", "2026-01-15"), row("Fév", "2026-02-15")]),
                mapping("type-1"),
                vec!["Jan".to_string(), "Fév".to_string()],
            )
            .await
            .expect("the import succeeds");

        assert_eq!(result.blocked_months, vec!["2026-02"]);
        assert_eq!(result.procedures_deleted, 1);
        assert_eq!(result.procedures_created, 1);
        let (procedures, _, _) = stored(&pool).await;
        assert!(procedures.contains(&"feb-old".to_string()));
        assert!(!procedures.contains(&"jan-old".to_string()));
    }

    /// PRO-300 and EXI-190: a batch raises one event, and the patient tracks its most recent row.
    #[tokio::test]
    async fn test_pro_300_a_batch_raises_one_event_and_tracks_the_most_recent_row() {
        let pool = seeded_pool().await;
        let bus = Arc::new(EventBus::new());
        let mut procedures = bus.subscribe::<ProcedureUpdated>().expect("subscribe");

        orchestrator_on(&pool, bus)
            .execute_import(
                workbook(vec![
                    row("Jan", "2026-01-15"),
                    row("Jan", "2026-01-20"),
                    row("Jan", "2026-01-05"),
                ]),
                mapping("type-1"),
                vec!["Jan".to_string()],
            )
            .await
            .expect("the import succeeds");

        assert!(procedures.try_recv().is_ok());
        assert!(procedures.try_recv().is_err());
        let (latest_date,): (Option<String>,) =
            sqlx::query_as("SELECT latest_date FROM patient WHERE ssn = '9876543210987'")
                .fetch_one(&pool)
                .await
                .expect("the new patient");
        assert_eq!(latest_date.as_deref(), Some("2026-01-20"));
    }

    /// EXI-177: an import that writes nothing raises nothing, even with a month to replace.
    #[tokio::test]
    async fn test_exi_177_an_import_that_writes_nothing_raises_no_event() {
        let pool = seeded_pool().await;
        let bus = Arc::new(EventBus::new());
        let mut patients = bus.subscribe::<PatientUpdated>().expect("subscribe");
        let mut funds = bus.subscribe::<FundUpdated>().expect("subscribe");
        let mut procedures = bus.subscribe::<ProcedureUpdated>().expect("subscribe");

        // March holds nothing; the row's type is unmapped, so nothing is created.
        let mut parsed = workbook(vec![row("Mar", "2026-03-15")]);
        parsed.patients.clear();
        parsed.funds.clear();
        let result = orchestrator_on(&pool, bus)
            .execute_import(parsed, HashMap::new(), vec!["Mar".to_string()])
            .await
            .expect("the import succeeds");

        assert_eq!(result.procedures_deleted, 0);
        assert_eq!(result.procedures_created, 0);
        assert!(patients.try_recv().is_err());
        assert!(funds.try_recv().is_err());
        assert!(procedures.try_recv().is_err());
    }

    #[tokio::test]
    async fn test_580_a_successful_import_replaces_the_month_and_tracks_the_new_patient() {
        let pool = seeded_pool().await;

        let result = orchestrator(&pool)
            .execute_import(
                workbook(vec![row("Jan", "2026-01-15")]),
                mapping("type-1"),
                vec!["Jan".to_string()],
            )
            .await
            .expect("the import succeeds");

        assert_eq!(result.procedures_deleted, 1);
        assert_eq!(result.procedures_created, 1);
        assert_eq!(result.patients_created, 1);
        assert_eq!(result.funds_created, 1);

        let (procedures, patients, funds) = stored(&pool).await;
        assert_eq!(procedures.len(), 2);
        assert!(procedures.contains(&"feb-old".to_string()));
        assert!(!procedures.contains(&"jan-old".to_string()));
        assert_eq!((patients, funds), (2, 2));

        let (latest_date, latest_type): (Option<String>, Option<String>) = sqlx::query_as(
            "SELECT latest_date, latest_procedure_type FROM patient WHERE ssn = '9876543210987'",
        )
        .fetch_one(&pool)
        .await
        .expect("the new patient");
        assert_eq!(latest_date.as_deref(), Some("2026-01-15"));
        assert_eq!(latest_type.as_deref(), Some("type-1"));
    }
}

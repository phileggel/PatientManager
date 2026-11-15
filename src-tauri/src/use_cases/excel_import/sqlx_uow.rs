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

    use crate::context::fund::{
        FundPaymentRepository, FundService, SqliteFundPaymentRepository, SqliteFundRepository,
    };
    use crate::context::patient::{PatientService, SqlitePatientRepository};
    use crate::context::procedure::{
        ProcedureService, ProcedureTypeService, SqliteProcedureRefundRepository,
        SqliteProcedureRepository, SqliteProcedureTypeRepository,
    };
    use crate::shared::event_bus::{EventBus, FundUpdated, PatientUpdated, ProcedureUpdated};
    use crate::shared::uow::SqlxTransactionManager;
    use crate::use_cases::excel_import::dto::ParseExcelResponse;
    use crate::use_cases::excel_import::excel_codec::{
        ExcelFund, ExcelPatient, ExcelProcedure, ParsingIssues, SkipReason, SkippedRow,
    };
    use crate::use_cases::excel_import::orchestrator::ExcelImportOrchestrator;
    use crate::use_cases::excel_import::ExcelImportError;
    use crate::use_cases::procedure_orchestration::ProcedureOrchestrationService;

    /// January and February each hold one `Created` procedure, neither blocking.
    /// February's is still referenced by a procedure refund, so the database refuses
    /// to purge that month: the failure these tests need.
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
            "INSERT INTO patient (id, name, ssn, is_anonymous) VALUES ('known', 'Marie Dupont', '1234567890123', 0)",
            "INSERT INTO procedure_type (id, name, default_amount) VALUES ('type-1', 'Type 1', 100000)",
            "INSERT INTO fund (id, fund_identifier, name) VALUES ('fund-1', '75', 'Caisse 75')",
            r#"INSERT INTO "procedure" (id, patient_id, procedure_type_id, procedure_date, billed_amount, payment_status) VALUES ('jan-old', 'known', 'type-1', '2026-01-10', 100000, 'CREATED')"#,
            r#"INSERT INTO "procedure" (id, patient_id, procedure_type_id, procedure_date, billed_amount, payment_status) VALUES ('feb-old', 'known', 'type-1', '2026-02-10', 100000, 'CREATED')"#,
            "INSERT INTO fund_payment_group (id, fund_id, payment_date, total_amount, status) VALUES ('group-1', 'fund-1', '2026-02-20', 100000, 'ACTIVE')",
            "INSERT INTO bank_account (id, name) VALUES ('acc-1', 'Compte')",
            "INSERT INTO bank_transfer (id, transfer_date, amount, transfer_type, bank_account_id) VALUES ('transfer-1', '2026-02-20', 100000, 'CHECK', 'acc-1')",
            "INSERT INTO procedure_refund (id, source_procedure_id, refund_procedure_id, refund_fund_payment_group_id, refund_bank_transfer_id, refund_date, previous_payment_status) VALUES ('refund-1', 'feb-old', 'feb-old', 'group-1', 'transfer-1', '2026-02-20', 'CREATED')",
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
            Arc::new(ProcedureTypeService::new(
                Arc::new(SqliteProcedureTypeRepository::new(pool.clone())),
                bus.clone(),
            )),
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

    /// Triggers refusing any procedure dated in one month: a write failure after
    /// the earlier months' writes, whatever EXI-151 and EXI-161 catch.
    const REFUSE_JANUARY: &str = r#"CREATE TRIGGER refuse_january BEFORE INSERT ON "procedure" WHEN NEW.procedure_date LIKE '2026-01-%' BEGIN SELECT RAISE(ABORT, 'refused'); END"#;
    const REFUSE_FEBRUARY: &str = r#"CREATE TRIGGER refuse_february BEFORE INSERT ON "procedure" WHEN NEW.procedure_date LIKE '2026-02-%' BEGIN SELECT RAISE(ABORT, 'refused'); END"#;

    async fn refuse_procedures(pool: &SqlitePool, trigger: &'static str) {
        sqlx::query(trigger).execute(pool).await.expect("trigger");
    }

    fn untouched() -> (Vec<String>, i64, i64) {
        (vec!["feb-old".to_string(), "jan-old".to_string()], 1, 1)
    }

    #[tokio::test]
    async fn test_580_a_failure_on_the_second_month_changes_nothing() {
        let pool = seeded_pool().await;
        sqlx::query("DELETE FROM procedure_refund")
            .execute(&pool)
            .await
            .expect("February unblocked");
        refuse_procedures(&pool, REFUSE_FEBRUARY).await;

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

        refuse_procedures(&pool, REFUSE_JANUARY).await;

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

    async fn deleted_fund_payment_on(pool: &SqlitePool, procedure_id: &str) {
        sqlx::query("INSERT INTO fund_payment_group (id, fund_id, payment_date, total_amount, status) VALUES ('deleted-group', 'fund-1', '2026-01-20', 100000, 'ACTIVE')")
            .execute(pool)
            .await
            .expect("seed the group");
        sqlx::query("INSERT INTO fund_payment_line (id, fund_payment_group_id, procedure_id) VALUES ('deleted-line', 'deleted-group', ?)")
            .bind(procedure_id)
            .execute(pool)
            .await
            .expect("seed the line");
        let payments = SqliteFundPaymentRepository::new(pool.clone());
        payments
            .delete_lines_by_group("deleted-group")
            .await
            .expect("delete the lines");
        payments
            .delete_group("deleted-group")
            .await
            .expect("delete the group");
    }

    /// #585: a month re-imports after one of its fund payments was deleted.
    #[tokio::test]
    async fn test_585_a_month_re_imports_after_its_fund_payment_was_deleted() {
        let pool = seeded_pool().await;
        deleted_fund_payment_on(&pool, "jan-old").await;

        let result = orchestrator(&pool)
            .execute_import(
                workbook(vec![row("Jan", "2026-01-15")]),
                mapping("type-1"),
                vec!["Jan".to_string()],
            )
            .await
            .expect("the import succeeds");

        assert!(result.blocked_months.is_empty());
        assert_eq!(result.procedures_deleted, 1);
        assert_eq!(result.procedures_created, 1);
    }

    /// EXI-161: a line blocks its month whatever its procedure's status: the import never
    /// touches a real payment.
    #[tokio::test]
    async fn test_585_exi_161_a_line_on_a_created_procedure_blocks_its_month() {
        let pool = seeded_pool().await;
        for statement in [
            "INSERT INTO fund_payment_group (id, fund_id, payment_date, total_amount, status) VALUES ('live-group', 'fund-1', '2026-01-20', 100000, 'ACTIVE')",
            "INSERT INTO fund_payment_line (id, fund_payment_group_id, procedure_id) VALUES ('live-line', 'live-group', 'jan-old')",
        ] {
            sqlx::query(statement).execute(&pool).await.expect("seed");
        }

        let result = orchestrator(&pool)
            .execute_import(
                workbook(vec![row("Jan", "2026-01-15")]),
                mapping("type-1"),
                vec!["Jan".to_string()],
            )
            .await
            .expect("the import succeeds");

        assert_eq!(result.blocked_months, vec!["2026-01"]);
        assert_eq!(result.procedures_deleted, 0);
        let lines: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM fund_payment_line WHERE id = 'live-line'")
                .fetch_one(&pool)
                .await
                .expect("count");
        assert_eq!(lines, 1);
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

        // March holds nothing to replace; the row's patient is not in the workbook,
        // so nothing is created.
        let mut parsed = workbook(vec![row("Mars", "2026-03-15")]);
        parsed.patients.clear();
        parsed.funds.clear();
        let result = orchestrator_on(&pool, bus)
            .execute_import(parsed, HashMap::new(), vec!["Mars".to_string()])
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

    #[tokio::test]
    async fn test_581_exi_131_the_default_type_imports_under_the_reserved_type() {
        let pool = seeded_pool().await;
        let types_before = procedure_types(&pool).await;

        let result = orchestrator(&pool)
            .execute_import(
                workbook(vec![row("Jan", "2026-01-15")]),
                mapping("imported-from-excel"),
                vec!["Jan".to_string()],
            )
            .await
            .expect("the import succeeds");

        assert_eq!(result.procedures_created, 1);
        let (type_id,): (String,) = sqlx::query_as(
            r#"SELECT procedure_type_id FROM "procedure" WHERE procedure_date = '2026-01-15'"#,
        )
        .fetch_one(&pool)
        .await
        .expect("the imported procedure");
        assert_eq!(type_id, "import-pdf");
        assert_eq!(
            procedure_types(&pool).await,
            types_before,
            "no procedure type is created"
        );
    }

    async fn procedure_types(pool: &SqlitePool) -> i64 {
        let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM procedure_type")
            .fetch_one(pool)
            .await
            .expect("procedure types");
        count
    }

    /// EXI-161 (#621): a procedure a bank entry names blocks its month, whatever its status;
    /// the month's rows are reported (EXI-290).
    #[tokio::test]
    async fn test_621_exi_161_a_bank_entry_blocks_its_month_and_its_rows_are_reported() {
        let pool = seeded_pool().await;
        sqlx::query("INSERT INTO bank_transfer_procedure_link (id, bank_transfer_id, procedure_id) VALUES ('link-1', 'transfer-1', 'jan-old')")
            .execute(&pool)
            .await
            .expect("seed");

        let result = orchestrator(&pool)
            .execute_import(
                workbook(vec![row("Jan", "2026-01-15")]),
                mapping("type-1"),
                vec!["Jan".to_string()],
            )
            .await
            .expect("the import succeeds");

        assert_eq!(result.blocked_months, vec!["2026-01"]);
        assert_eq!(result.procedures_deleted, 0);
        assert_eq!(
            result.skipped_procedures,
            vec![SkippedRow {
                sheet: "Jan".to_string(),
                row_number: 2,
                reason: SkipReason::MonthBlocked {
                    month: "2026-01".to_string(),
                },
            }]
        );
    }

    /// EXI-161 (#621): a procedure a procedure refund names blocks its month, whatever its status.
    #[tokio::test]
    async fn test_621_exi_161_a_refund_record_blocks_its_month() {
        let pool = seeded_pool().await;

        let result = orchestrator(&pool)
            .execute_import(
                workbook(vec![row("Fév", "2026-02-15")]),
                mapping("type-1"),
                vec!["Fév".to_string()],
            )
            .await
            .expect("the import succeeds");

        // The seed's procedure refund names `feb-old`, a `CREATED` procedure.
        assert_eq!(result.blocked_months, vec!["2026-02"]);
        let (procedures, _, _) = stored(&pool).await;
        assert!(procedures.contains(&"feb-old".to_string()));
    }

    /// EXI-151 (#621): a mapping naming a type that does not exist refuses the import,
    /// naming it, before anything is written.
    #[tokio::test]
    async fn test_621_exi_151_a_mapped_type_gone_refuses_the_import_and_writes_nothing() {
        let pool = seeded_pool().await;
        let before = stored(&pool).await;

        let result = orchestrator(&pool)
            .execute_import(
                workbook(vec![row("Jan", "2026-01-15")]),
                mapping("type-gone"),
                vec!["Jan".to_string()],
            )
            .await;

        let err = result.unwrap_err();
        assert_eq!(
            err,
            ExcelImportError::ProcedureTypeNotFound {
                procedure_type_id: "type-gone".to_string(),
            }
        );
        assert_eq!(stored(&pool).await, before);
    }

    /// EXI-151: the refusal holds even when no row uses the gone type's amount.
    #[tokio::test]
    async fn test_621_exi_151_a_gone_type_no_row_uses_still_refuses() {
        let pool = seeded_pool().await;
        let mut mapping = mapping("type-1");
        mapping.insert("tmp-unused".to_string(), "type-gone".to_string());

        let result = orchestrator(&pool)
            .execute_import(
                workbook(vec![row("Jan", "2026-01-15")]),
                mapping,
                vec!["Jan".to_string()],
            )
            .await;

        let err = result.unwrap_err();
        assert_eq!(
            err,
            ExcelImportError::ProcedureTypeNotFound {
                procedure_type_id: "type-gone".to_string(),
            }
        );
    }

    /// EXI-178: the mapping preferences and the types made for the mapping stay
    /// after a failed import.
    #[tokio::test]
    async fn test_621_exi_178_a_failed_import_keeps_the_mappings_and_the_types() {
        let pool = seeded_pool().await;
        for statement in [
            "INSERT INTO procedure_type (id, name, default_amount) VALUES ('type-made', 'Type made', 100000)",
            "INSERT INTO excel_amount_type_mapping (id, amount, procedure_type_id) VALUES ('map-1', 100000, 'type-made')",
        ] {
            sqlx::query(statement).execute(&pool).await.expect("seed");
        }
        refuse_procedures(&pool, REFUSE_JANUARY).await;

        let result = orchestrator(&pool)
            .execute_import(
                workbook(vec![row("Jan", "2026-01-15")]),
                mapping("type-made"),
                vec!["Jan".to_string()],
            )
            .await;

        assert!(result.is_err());
        let kept: (i64, i64) = sqlx::query_as(
            "SELECT (SELECT COUNT(*) FROM procedure_type WHERE id = 'type-made'), (SELECT COUNT(*) FROM excel_amount_type_mapping WHERE id = 'map-1')",
        )
        .fetch_one(&pool)
        .await
        .expect("count");
        assert_eq!(kept, (1, 1));
    }

    /// EXI-177: an import that only deletes raises `ProcedureUpdated` alone.
    #[tokio::test]
    async fn test_621_exi_177_a_delete_only_import_raises_procedure_updated_alone() {
        let pool = seeded_pool().await;
        let bus = Arc::new(EventBus::new());
        let mut patients = bus.subscribe::<PatientUpdated>().expect("subscribe");
        let mut funds = bus.subscribe::<FundUpdated>().expect("subscribe");
        let mut procedures = bus.subscribe::<ProcedureUpdated>().expect("subscribe");

        // January's `jan-old` is replaced by nothing: the row's patient is not in the workbook.
        let mut parsed = workbook(vec![row("Jan", "2026-01-15")]);
        parsed.patients.clear();
        parsed.funds.clear();
        let result = orchestrator_on(&pool, bus)
            .execute_import(parsed, mapping("type-1"), vec!["Jan".to_string()])
            .await
            .expect("the import succeeds");

        assert_eq!(
            (result.procedures_deleted, result.procedures_created),
            (1, 0)
        );
        assert!(procedures.try_recv().is_ok());
        assert!(procedures.try_recv().is_err());
        assert!(patients.try_recv().is_err());
        assert!(funds.try_recv().is_err());
    }

    /// EXI-177: an import that writes a known patient only through its tracking
    /// fields raises `PatientUpdated`, and no `FundUpdated` for a known fund.
    #[tokio::test]
    async fn test_621_exi_177_a_tracking_only_patient_write_raises_patient_updated() {
        let pool = seeded_pool().await;
        let bus = Arc::new(EventBus::new());
        let mut patients = bus.subscribe::<PatientUpdated>().expect("subscribe");
        let mut funds = bus.subscribe::<FundUpdated>().expect("subscribe");

        let mut parsed = workbook(vec![row("Mars", "2026-03-15")]);
        parsed.patients[0].name = "Marie Dupont".to_string();
        parsed.patients[0].ssn = "1234567890123".to_string();
        parsed.funds[0].fund_identifier = "75".to_string();
        let result = orchestrator_on(&pool, bus)
            .execute_import(parsed, mapping("type-1"), vec!["Mars".to_string()])
            .await
            .expect("the import succeeds");

        assert_eq!((result.patients_created, result.patients_reused), (0, 1));
        assert_eq!((result.funds_created, result.funds_reused), (0, 1));
        assert!(patients.try_recv().is_ok());
        assert!(patients.try_recv().is_err());
        assert!(funds.try_recv().is_err());
    }
}

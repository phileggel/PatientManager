//! The units of work of manual bank matching over SQLite: the repositories' row
//! writers on one transaction of the shared `SqlxTransactionManager`.

use anyhow::Context;

use crate::context::bank::{BankEntry, SqliteBankEntryLinkRepository, SqliteBankEntryRepository};
use crate::context::fund::{FundPaymentGroupStatus, SqliteFundPaymentRepository};
use crate::context::procedure::{Procedure, SqliteProcedureRepository};
use crate::shared::uow::SqlxTransactionManager;

use super::uow::{
    BankEntryOperation, BankEntryTransactionManager, BankEntryUnitOfWork, GroupSettlementOperation,
    GroupSettlementTransactionManager, GroupSettlementUnitOfWork,
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

#[cfg(test)]
mod bank_entry_tests {
    use std::sync::Arc;

    use chrono::NaiveDate;
    use sqlx::sqlite::SqlitePoolOptions;
    use sqlx::SqlitePool;
    use tokio::sync::broadcast::Receiver;
    use uuid::Uuid;

    use crate::context::bank::{
        BankEntryService, BankEntryType, BankError, SqliteBankAccountRepository,
        SqliteBankEntryLinkRepository, SqliteBankEntryRepository,
    };
    use crate::context::fund::{
        FundError, FundPaymentGroupStatus, FundPaymentService, SqliteFundPaymentRepository,
    };
    use crate::context::procedure::{
        PaymentMethod, ProcedureError, ProcedureService, ProcedureStatus, SqliteProcedureRepository,
    };
    use crate::shared::event_bus::{
        BankEntryUpdated, EventBus, FundPaymentGroupUpdated, ProcedureUpdated,
    };
    use crate::shared::uow::SqlxTransactionManager;

    use super::super::error::BankManualMatchError;
    use super::super::orchestrator::BankManualMatchOrchestrator;

    async fn setup_db() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("Failed to connect");
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("Migrations failed");
        pool
    }

    fn make_components_on(
        pool: &SqlitePool,
        event_bus: Arc<EventBus>,
    ) -> (
        BankManualMatchOrchestrator,
        Arc<FundPaymentService>,
        Arc<ProcedureService>,
    ) {
        let fund_svc = Arc::new(FundPaymentService::new(
            Arc::new(SqliteFundPaymentRepository::new(pool.clone())),
            event_bus.clone(),
        ));
        let proc_svc = Arc::new(ProcedureService::new(
            Arc::new(SqliteProcedureRepository::new(pool.clone())),
            event_bus.clone(),
        ));
        let bank_svc = Arc::new(BankEntryService::new(
            Arc::new(SqliteBankEntryRepository::new(pool.clone())),
            Arc::new(SqliteBankAccountRepository::new(pool.clone())),
            event_bus,
        ));
        let orchestrator = BankManualMatchOrchestrator::new(
            bank_svc,
            Arc::new(SqliteBankEntryLinkRepository::new(pool.clone())),
            fund_svc.clone(),
            proc_svc.clone(),
            Arc::new(SqlxTransactionManager::new(pool.clone())),
            Arc::new(SqlxTransactionManager::new(pool.clone())),
        );
        (orchestrator, fund_svc, proc_svc)
    }

    fn make_components(
        pool: &SqlitePool,
    ) -> (
        BankManualMatchOrchestrator,
        Arc<FundPaymentService>,
        Arc<ProcedureService>,
    ) {
        make_components_on(pool, Arc::new(EventBus::new()))
    }

    /// Seed patient, fund, and procedure_type; returns (patient_id, fund_id, proc_type_id).
    async fn seed_base(pool: &SqlitePool) -> (String, String, String) {
        let patient_id = Uuid::new_v4().to_string();
        let fund_id = Uuid::new_v4().to_string();
        let proc_type_id = Uuid::new_v4().to_string();

        sqlx::query("INSERT INTO patient (id, is_anonymous, is_deleted) VALUES (?, 0, 0)")
            .bind(&patient_id)
            .execute(pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO fund (id, fund_identifier, name, is_deleted) VALUES (?, 'CPAM93', 'CPAM 93', 0)",
        )
        .bind(&fund_id)
        .execute(pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO procedure_type (id, name, default_amount, is_deleted) VALUES (?, 'Consultation', 100000, 0)",
        )
        .bind(&proc_type_id)
        .execute(pool)
        .await
        .unwrap();

        (patient_id, fund_id, proc_type_id)
    }

    async fn seed_procedure(
        pool: &SqlitePool,
        patient_id: &str,
        proc_type_id: &str,
        procedure_date: &str,
        status: &str,
        amount: i64,
    ) -> String {
        let proc_id = Uuid::new_v4().to_string();
        sqlx::query(
            r#"INSERT INTO "procedure" (id, patient_id, procedure_type_id, procedure_date,
               billed_amount, payment_status, is_deleted) VALUES (?, ?, ?, ?, ?, ?, 0)"#,
        )
        .bind(&proc_id)
        .bind(patient_id)
        .bind(proc_type_id)
        .bind(procedure_date)
        .bind(amount)
        .bind(status)
        .execute(pool)
        .await
        .unwrap();
        proc_id
    }

    async fn seed_fund_group(
        pool: &SqlitePool,
        fund_id: &str,
        payment_date: &str,
        total_amount: i64,
        proc_ids: &[String],
        status: &str,
    ) -> String {
        let group_id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO fund_payment_group (id, fund_id, payment_date, total_amount, status, is_deleted)
             VALUES (?, ?, ?, ?, ?, 0)",
        )
        .bind(&group_id)
        .bind(fund_id)
        .bind(payment_date)
        .bind(total_amount)
        .bind(status)
        .execute(pool)
        .await
        .unwrap();

        for proc_id in proc_ids {
            let line_id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO fund_payment_line (id, fund_payment_group_id, procedure_id, is_deleted)
                 VALUES (?, ?, ?, 0)",
            )
            .bind(&line_id)
            .bind(&group_id)
            .bind(proc_id)
            .execute(pool)
            .await
            .unwrap();
        }

        group_id
    }

    /// What a bank entry command can change, to compare before and after.
    async fn stored(pool: &SqlitePool) -> Vec<String> {
        let mut rows: Vec<(String,)> = sqlx::query_as(
            r#"SELECT 'procedure ' || id || ' ' || payment_status || ' ' || payment_method || ' ' || COALESCE(confirmed_payment_date, '') || ' ' || COALESCE(paid_amount, '') FROM "procedure"
               UNION ALL SELECT 'group ' || id || ' ' || status FROM fund_payment_group
               UNION ALL SELECT 'entry ' || id || ' ' || transfer_date || ' ' || amount FROM bank_transfer
               UNION ALL SELECT 'group link ' || bank_transfer_id || ' ' || fund_payment_group_id FROM bank_transfer_fund_group_link
               UNION ALL SELECT 'procedure link ' || bank_transfer_id || ' ' || procedure_id FROM bank_transfer_procedure_link"#,
        )
        .fetch_all(pool)
        .await
        .expect("stored rows");
        rows.sort();
        rows.into_iter().map(|(row,)| row).collect()
    }

    /// The last write of a command refuses: a group that becomes bank paid.
    async fn refuse_bank_paid_group(pool: &SqlitePool) {
        sqlx::query(
            "CREATE TRIGGER refuse_group BEFORE UPDATE ON fund_payment_group WHEN NEW.status = 'BANK_PAYED' BEGIN SELECT RAISE(ABORT, 'refused'); END",
        )
        .execute(pool)
        .await
        .expect("trigger");
    }

    /// The last write of a command refuses: a procedure that becomes directly paid.
    async fn refuse_directly_paid_procedure(pool: &SqlitePool) {
        sqlx::query(
            r#"CREATE TRIGGER refuse_procedure BEFORE UPDATE ON "procedure" WHEN NEW.payment_status = 'DIRECTLY_PAYED' BEGIN SELECT RAISE(ABORT, 'refused'); END"#,
        )
        .execute(pool)
        .await
        .expect("trigger");
    }

    /// Two groups of one reconciled procedure each; the first is settled by a bank entry.
    async fn fund_scene(
        pool: &SqlitePool,
        orchestrator: &BankManualMatchOrchestrator,
    ) -> (String, String, String) {
        let (patient_id, fund_id, proc_type_id) = seed_base(pool).await;
        let mut groups = vec![];
        for date in ["2026-03-10", "2026-03-12"] {
            let procedure = seed_procedure(
                pool,
                &patient_id,
                &proc_type_id,
                date,
                "RECONCILIATED",
                100_000,
            )
            .await;
            groups.push(
                seed_fund_group(
                    pool,
                    &fund_id,
                    date,
                    100_000,
                    std::slice::from_ref(&procedure),
                    "ACTIVE",
                )
                .await,
            );
        }
        let entry = orchestrator
            .create_fund_transfer(
                "cash-account-default".to_string(),
                "2026-03-15".to_string(),
                vec![groups[0].clone()],
            )
            .await
            .expect("the first entry");
        (entry.transfer_id, groups[0].clone(), groups[1].clone())
    }

    /// Two created procedures; the first is paid by a direct entry.
    async fn direct_scene(
        pool: &SqlitePool,
        orchestrator: &BankManualMatchOrchestrator,
    ) -> (String, String, String) {
        let (patient_id, _, proc_type_id) = seed_base(pool).await;
        let first = seed_procedure(
            pool,
            &patient_id,
            &proc_type_id,
            "2026-03-10",
            "CREATED",
            100_000,
        )
        .await;
        let second = seed_procedure(
            pool,
            &patient_id,
            &proc_type_id,
            "2026-03-12",
            "CREATED",
            200_000,
        )
        .await;
        let entry = orchestrator
            .create_direct_transfer(
                "cash-account-default".to_string(),
                "2026-03-15".to_string(),
                BankEntryType::PatientCheck,
                vec![first.clone()],
            )
            .await
            .expect("the first entry");
        (entry.transfer_id, first, second)
    }

    /// The three events a bank entry command can raise, listened to from now on.
    struct Listeners {
        entries: Receiver<BankEntryUpdated>,
        groups: Receiver<FundPaymentGroupUpdated>,
        procedures: Receiver<ProcedureUpdated>,
    }

    impl Listeners {
        fn on(bus: &EventBus) -> Self {
            Self {
                entries: bus.subscribe::<BankEntryUpdated>().expect("subscribe"),
                groups: bus
                    .subscribe::<FundPaymentGroupUpdated>()
                    .expect("subscribe"),
                procedures: bus.subscribe::<ProcedureUpdated>().expect("subscribe"),
            }
        }

        fn assert_silent(&mut self) {
            assert!(self.entries.try_recv().is_err(), "no BankEntryUpdated");
            assert!(
                self.groups.try_recv().is_err(),
                "no FundPaymentGroupUpdated"
            );
            assert!(self.procedures.try_recv().is_err(), "no ProcedureUpdated");
        }
    }

    async fn on_a_bus(pool: &SqlitePool) -> (BankManualMatchOrchestrator, Arc<EventBus>) {
        let bus = Arc::new(EventBus::new());
        let (orchestrator, _, _) = make_components_on(pool, bus.clone());
        (orchestrator, bus)
    }

    const CHECK: BankEntryType = BankEntryType::PatientCheck;

    fn account() -> String {
        "cash-account-default".to_string()
    }

    fn date() -> String {
        "2026-03-16".to_string()
    }

    #[tokio::test]
    async fn test_bsm_034_a_failed_fund_creation_changes_nothing() {
        let pool = setup_db().await;
        let (orchestrator, bus) = on_a_bus(&pool).await;
        let (_, _, free_group) = fund_scene(&pool, &orchestrator).await;
        refuse_bank_paid_group(&pool).await;
        let before = stored(&pool).await;
        let mut listeners = Listeners::on(&bus);

        let result = orchestrator
            .create_fund_transfer(account(), date(), vec![free_group])
            .await;

        assert!(result.is_err());
        assert_eq!(stored(&pool).await, before);
        listeners.assert_silent();
    }

    #[tokio::test]
    async fn test_bsm_034_a_failed_direct_creation_changes_nothing() {
        let pool = setup_db().await;
        let (orchestrator, bus) = on_a_bus(&pool).await;
        let (_, _, free_procedure) = direct_scene(&pool, &orchestrator).await;
        refuse_directly_paid_procedure(&pool).await;
        let before = stored(&pool).await;
        let mut listeners = Listeners::on(&bus);

        let result = orchestrator
            .create_direct_transfer(account(), date(), CHECK, vec![free_procedure])
            .await;

        assert!(result.is_err());
        assert_eq!(stored(&pool).await, before);
        listeners.assert_silent();
    }

    #[tokio::test]
    async fn test_bsm_034_a_failed_fund_edit_changes_nothing() {
        let pool = setup_db().await;
        let (orchestrator, bus) = on_a_bus(&pool).await;
        let (entry, _, free_group) = fund_scene(&pool, &orchestrator).await;
        refuse_bank_paid_group(&pool).await;
        let before = stored(&pool).await;
        let mut listeners = Listeners::on(&bus);

        let result = orchestrator
            .update_fund_transfer(entry, date(), vec![free_group])
            .await;

        assert!(result.is_err());
        assert_eq!(stored(&pool).await, before);
        listeners.assert_silent();
    }

    #[tokio::test]
    async fn test_bsm_034_a_failed_direct_edit_changes_nothing() {
        let pool = setup_db().await;
        let (orchestrator, bus) = on_a_bus(&pool).await;
        let (entry, _, free_procedure) = direct_scene(&pool, &orchestrator).await;
        refuse_directly_paid_procedure(&pool).await;
        let before = stored(&pool).await;
        let mut listeners = Listeners::on(&bus);

        let result = orchestrator
            .update_direct_transfer(entry, date(), vec![free_procedure])
            .await;

        assert!(result.is_err());
        assert_eq!(stored(&pool).await, before);
        listeners.assert_silent();
    }

    /// The case the issue names: the new selection is refused after the old
    /// groups were reverted.
    #[tokio::test]
    async fn test_bsm_034_a_fund_edit_refused_on_its_selection_changes_nothing() {
        let pool = setup_db().await;
        let (orchestrator, _, _) = make_components(&pool);
        let (entry, _, _) = fund_scene(&pool, &orchestrator).await;
        let before = stored(&pool).await;

        let result = orchestrator
            .update_fund_transfer(entry, date(), vec!["unknown".to_string()])
            .await;

        assert!(matches!(
            result,
            Err(BankManualMatchError::Fund(
                FundError::PaymentGroupNotFound { .. }
            ))
        ));
        assert_eq!(stored(&pool).await, before);
    }

    #[tokio::test]
    async fn test_bsm_034_a_fund_creation_refused_on_its_selection_changes_nothing() {
        let pool = setup_db().await;
        let (orchestrator, _, _) = make_components(&pool);
        fund_scene(&pool, &orchestrator).await;
        let before = stored(&pool).await;

        let result = orchestrator
            .create_fund_transfer(account(), date(), vec!["unknown".to_string()])
            .await;

        assert!(matches!(
            result,
            Err(BankManualMatchError::Fund(
                FundError::PaymentGroupNotFound { .. }
            ))
        ));
        assert_eq!(stored(&pool).await, before);
    }

    #[tokio::test]
    async fn test_bsm_034_an_edit_refused_on_its_amount_changes_nothing() {
        let pool = setup_db().await;
        let (orchestrator, _, _) = make_components(&pool);
        let (entry, _, free_procedure) = direct_scene(&pool, &orchestrator).await;
        sqlx::query(r#"UPDATE "procedure" SET billed_amount = 0 WHERE id = ?"#)
            .bind(&free_procedure)
            .execute(&pool)
            .await
            .expect("no amount");
        let before = stored(&pool).await;

        let result = orchestrator
            .update_direct_transfer(entry, date(), vec![free_procedure])
            .await;

        assert!(matches!(
            result,
            Err(BankManualMatchError::Bank(BankError::AmountNotPositive))
        ));
        assert_eq!(stored(&pool).await, before);
    }

    /// BSM-035: an unknown procedure beside a known one, in a creation and an edit.
    #[tokio::test]
    async fn test_bsm_035_an_unknown_procedure_refuses_the_selection() {
        let pool = setup_db().await;
        let (orchestrator, _, _) = make_components(&pool);
        let (entry, kept, free_procedure) = direct_scene(&pool, &orchestrator).await;
        let before = stored(&pool).await;

        let created = orchestrator
            .create_direct_transfer(
                account(),
                date(),
                CHECK,
                vec![free_procedure, "unknown".to_string()],
            )
            .await;
        let edited = orchestrator
            .update_direct_transfer(entry, date(), vec![kept, "unknown".to_string()])
            .await;

        assert!(matches!(
            created,
            Err(BankManualMatchError::Procedure(
                ProcedureError::ProcedureNotFound { .. }
            ))
        ));
        assert!(matches!(
            edited,
            Err(BankManualMatchError::Procedure(
                ProcedureError::ProcedureNotFound { .. }
            ))
        ));
        assert_eq!(stored(&pool).await, before);
    }

    /// BSM-035: a deleted procedure beside a live one is not linked unpaid.
    #[tokio::test]
    async fn test_bsm_035_a_deleted_procedure_refuses_the_selection() {
        let pool = setup_db().await;
        let (orchestrator, _, _) = make_components(&pool);
        let (_, kept, free_procedure) = direct_scene(&pool, &orchestrator).await;
        sqlx::query(r#"UPDATE "procedure" SET is_deleted = 1 WHERE id = ?"#)
            .bind(&kept)
            .execute(&pool)
            .await
            .expect("delete");
        let before = stored(&pool).await;

        let created = orchestrator
            .create_direct_transfer(account(), date(), CHECK, vec![free_procedure, kept])
            .await;

        assert!(matches!(
            created,
            Err(BankManualMatchError::Procedure(
                ProcedureError::ProcedureNotFound { .. }
            ))
        ));
        assert_eq!(stored(&pool).await, before);
    }

    /// An edit raises each event once, after it committed.
    #[tokio::test]
    async fn test_bsm_034_a_committed_edit_raises_each_event_once() {
        let pool = setup_db().await;
        let (orchestrator, bus) = on_a_bus(&pool).await;
        let (entry, _, free_group) = fund_scene(&pool, &orchestrator).await;
        let mut listeners = Listeners::on(&bus);

        orchestrator
            .update_fund_transfer(entry, date(), vec![free_group])
            .await
            .expect("the edit commits");

        assert!(listeners.entries.try_recv().is_ok());
        assert!(listeners.groups.try_recv().is_ok());
        assert!(listeners.procedures.try_recv().is_ok());
        listeners.assert_silent();
    }

    /// A group or procedure kept by an edit ends settled on the new date, as if
    /// it had been reverted and applied.
    #[tokio::test]
    async fn test_bsm_036_an_edit_keeps_what_stays_selected_settled() -> anyhow::Result<()> {
        let pool = setup_db().await;
        let (orchestrator, fund_svc, proc_svc) = make_components(&pool);
        let (entry, kept, added) = fund_scene(&pool, &orchestrator).await;
        sqlx::query(r#"UPDATE "procedure" SET payment_status = 'PARTIALLY_FUND_PAYED' WHERE payment_status = 'FUND_PAYED'"#)
            .execute(&pool)
            .await?;

        orchestrator
            .update_fund_transfer(
                entry,
                "2026-03-16".to_string(),
                vec![kept.clone(), added.clone()],
            )
            .await?;

        for group_id in [&kept, &added] {
            let group = fund_svc.read_group(group_id).await?.expect("the group");
            assert_eq!(group.status, FundPaymentGroupStatus::BankPaid);
            assert!(group.is_locked);
        }
        let kept_line = fund_svc
            .read_group(&kept)
            .await?
            .expect("the group")
            .lines
            .remove(0);
        let procedure = proc_svc
            .read_procedure(&kept_line.procedure_id)
            .await?
            .expect("the procedure");
        assert_eq!(procedure.payment_status, ProcedureStatus::PartiallyFundPaid);
        assert_eq!(
            procedure.confirmed_payment_date,
            NaiveDate::from_ymd_opt(2026, 3, 16)
        );
        Ok(())
    }

    #[tokio::test]
    async fn test_bsm_036_a_direct_edit_keeps_what_stays_selected_paid() -> anyhow::Result<()> {
        let pool = setup_db().await;
        let (orchestrator, _, proc_svc) = make_components(&pool);
        let (entry, kept, added) = direct_scene(&pool, &orchestrator).await;

        orchestrator
            .update_direct_transfer(
                entry,
                "2026-03-16".to_string(),
                vec![kept.clone(), added.clone()],
            )
            .await?;

        for procedure_id in [&kept, &added] {
            let procedure = proc_svc
                .read_procedure(procedure_id)
                .await?
                .expect("the procedure");
            assert_eq!(procedure.payment_status, ProcedureStatus::DirectlyPaid);
            assert_eq!(procedure.payment_method, PaymentMethod::Check);
            assert_eq!(
                procedure.confirmed_payment_date,
                NaiveDate::from_ymd_opt(2026, 3, 16)
            );
        }
        Ok(())
    }
}

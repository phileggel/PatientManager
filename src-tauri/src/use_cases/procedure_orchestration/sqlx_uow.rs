//! The deletion and procedure tracking units of work over SQLite: the repositories' row writers on one
//! transaction of the shared `SqlxTransactionManager` (ADR-003).

use anyhow::Context;

use crate::context::fund::{SqliteFundPaymentRepository, SqliteFundRepository};
use crate::context::patient::SqlitePatientRepository;
use crate::context::procedure::{SqliteProcedureRepository, SqliteProcedureTypeRepository};
use crate::shared::uow::SqlxTransactionManager;

use super::uow::{DeletionOperation, DeletionTransactionManager, DeletionUnitOfWork};

struct SqlxDeletionUnitOfWork {
    tx: sqlx::Transaction<'static, sqlx::Sqlite>,
}

#[async_trait::async_trait]
impl DeletionUnitOfWork for SqlxDeletionUnitOfWork {
    async fn delete_procedure_type(&mut self, procedure_type_id: &str) -> anyhow::Result<bool> {
        SqliteProcedureTypeRepository::delete_in(&mut self.tx, procedure_type_id).await
    }

    async fn count_procedures_of_type(&mut self, procedure_type_id: &str) -> anyhow::Result<usize> {
        SqliteProcedureRepository::count_with_type_in(&mut self.tx, procedure_type_id).await
    }

    async fn clear_procedure_type_defaults(
        &mut self,
        procedure_type_id: &str,
    ) -> anyhow::Result<()> {
        SqlitePatientRepository::clear_procedure_type_defaults_in(&mut self.tx, procedure_type_id)
            .await
    }

    async fn delete_fund(&mut self, fund_id: &str) -> anyhow::Result<bool> {
        SqliteFundRepository::delete_in(&mut self.tx, fund_id).await
    }

    async fn count_fund_uses(&mut self, fund_id: &str) -> anyhow::Result<(usize, usize)> {
        let procedures =
            SqliteProcedureRepository::count_with_fund_in(&mut self.tx, fund_id).await?;
        let groups =
            SqliteFundPaymentRepository::count_groups_of_fund_in(&mut self.tx, fund_id).await?;
        Ok((procedures, groups))
    }

    async fn clear_fund_defaults(&mut self, fund_id: &str) -> anyhow::Result<()> {
        SqlitePatientRepository::clear_fund_defaults_in(&mut self.tx, fund_id).await
    }

    async fn procedure_type_exists(&mut self, procedure_type_id: &str) -> anyhow::Result<bool> {
        SqliteProcedureTypeRepository::exists_in(&mut self.tx, procedure_type_id).await
    }

    async fn fund_exists(&mut self, fund_id: &str) -> anyhow::Result<bool> {
        SqliteFundRepository::exists_in(&mut self.tx, fund_id).await
    }

    async fn delete_patient(&mut self, patient_id: &str) -> anyhow::Result<bool> {
        SqlitePatientRepository::delete_in(&mut self.tx, patient_id).await
    }

    async fn count_procedures_of_patient(&mut self, patient_id: &str) -> anyhow::Result<usize> {
        SqliteProcedureRepository::count_with_patient_in(&mut self.tx, patient_id).await
    }

    async fn delete_patient_dismissals(&mut self, patient_id: &str) -> anyhow::Result<()> {
        SqlitePatientRepository::delete_duplicate_dismissals_of_in(&mut self.tx, patient_id).await
    }

    async fn patient_exists(&mut self, patient_id: &str) -> anyhow::Result<bool> {
        SqlitePatientRepository::exists_in(&mut self.tx, patient_id).await
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

/// #705 — the procedure tracking unit of work: a procedure's row and its patient's
/// tracking on one transaction. Its own module keeps its `run` apart from the
/// deletion's in this file's scope.
mod tracking {
    use anyhow::Context;

    use crate::context::patient::{Patient, SqlitePatientRepository};
    use crate::context::procedure::{Procedure, SqliteProcedureRepository};
    use crate::shared::uow::SqlxTransactionManager;

    use super::super::uow::{
        ProcedureTrackingOperation, ProcedureTrackingTransactionManager,
        ProcedureTrackingUnitOfWork,
    };

    struct SqlxProcedureTrackingUnitOfWork {
        tx: sqlx::Transaction<'static, sqlx::Sqlite>,
    }

    #[async_trait::async_trait]
    impl ProcedureTrackingUnitOfWork for SqlxProcedureTrackingUnitOfWork {
        async fn insert_procedure(&mut self, procedure: &Procedure) -> anyhow::Result<()> {
            SqliteProcedureRepository::insert_in(&mut self.tx, procedure).await
        }

        async fn delete_procedure(&mut self, procedure_id: &str) -> anyhow::Result<bool> {
            SqliteProcedureRepository::delete_in(&mut self.tx, procedure_id).await
        }

        async fn procedure_exists(&mut self, procedure_id: &str) -> anyhow::Result<bool> {
            SqliteProcedureRepository::exists_in(&mut self.tx, procedure_id).await
        }

        async fn update_patient(&mut self, patient: &Patient) -> anyhow::Result<()> {
            SqlitePatientRepository::update_in(&mut self.tx, patient).await
        }
    }

    #[async_trait::async_trait]
    impl ProcedureTrackingTransactionManager for SqlxTransactionManager {
        async fn run(&self, operation: ProcedureTrackingOperation) -> anyhow::Result<()> {
            let tx = self.begin().await?;
            let mut uow = SqlxProcedureTrackingUnitOfWork { tx };
            // An `Err` returns here: dropping the transaction rolls it back.
            operation(&mut uow).await?;
            uow.tx
                .commit()
                .await
                .context("Failed to commit the procedure and its tracking")?;
            Ok(())
        }
    }

    #[cfg(test)]
    mod tests {
        use chrono::NaiveDate;
        use sqlx::sqlite::SqlitePoolOptions;
        use sqlx::SqlitePool;

        use super::*;
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
                "INSERT INTO procedure_type (id, name, default_amount) VALUES ('type-1', 'Type 1', 100000)",
                "INSERT INTO patient (id, name, is_anonymous) VALUES ('patient-1', 'Patient A', 0)",
                r#"INSERT INTO "procedure" (id, patient_id, procedure_type_id, procedure_date, billed_amount, payment_status) VALUES ('stored', 'patient-1', 'type-1', '2026-03-10', 100000, 'CREATED')"#,
            ] {
                sqlx::query(statement).execute(&pool).await.expect("seed");
            }
            pool
        }

        fn new_procedure() -> Procedure {
            Procedure::with_id(
                "new".to_string(),
                "patient-1".to_string(),
                None,
                "type-1".to_string(),
                NaiveDate::from_ymd_opt(2026, 3, 12).unwrap(),
                60000,
                PaymentMethod::None,
                None,
                None,
                None,
                ProcedureStatus::Created,
            )
            .unwrap()
        }

        async fn procedure_ids(pool: &SqlitePool) -> Vec<String> {
            sqlx::query_scalar(r#"SELECT id FROM "procedure" ORDER BY id"#)
                .fetch_all(pool)
                .await
                .expect("ids")
        }

        #[tokio::test]
        async fn test_705_a_failed_tracking_write_leaves_no_created_procedure() {
            let pool = seeded_pool().await;
            let procedure = new_procedure();

            let result = SqlxTransactionManager::new(pool.clone())
                .run(Box::new(move |uow| {
                    Box::pin(async move {
                        uow.insert_procedure(&procedure).await?;
                        anyhow::bail!("the tracking write fails")
                    })
                }))
                .await;

            assert!(result.is_err());
            assert_eq!(procedure_ids(&pool).await, ["stored"]);
        }

        #[tokio::test]
        async fn test_705_a_failed_tracking_write_leaves_the_deleted_procedure_stored() {
            let pool = seeded_pool().await;

            let result = SqlxTransactionManager::new(pool.clone())
                .run(Box::new(|uow| {
                    Box::pin(async move {
                        assert!(uow.delete_procedure("stored").await?);
                        anyhow::bail!("the tracking write fails")
                    })
                }))
                .await;

            assert!(result.is_err());
            assert_eq!(procedure_ids(&pool).await, ["stored"]);
        }

        #[tokio::test]
        async fn test_705_both_writes_land_together() {
            let pool = seeded_pool().await;
            let procedure = new_procedure();

            SqlxTransactionManager::new(pool.clone())
                .run(Box::new(move |uow| {
                    Box::pin(async move {
                        uow.insert_procedure(&procedure).await?;
                        let patient = Patient::restore(
                            "patient-1".to_string(),
                            false,
                            Some("Patient A".to_string()),
                            None,
                            Some("type-1".to_string()),
                            None,
                            Some(NaiveDate::from_ymd_opt(2026, 3, 12).unwrap()),
                            Some(60000),
                        );
                        uow.update_patient(&patient).await
                    })
                }))
                .await
                .unwrap();

            assert_eq!(procedure_ids(&pool).await, ["new", "stored"]);
            let latest: Option<String> =
                sqlx::query_scalar("SELECT latest_date FROM patient WHERE id = 'patient-1'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(latest.as_deref(), Some("2026-03-12"));
        }

        #[tokio::test]
        async fn test_705_an_unknown_procedure_deletes_nothing_and_does_not_exist() {
            let pool = seeded_pool().await;

            SqlxTransactionManager::new(pool.clone())
                .run(Box::new(|uow| {
                    Box::pin(async move {
                        assert!(!uow.delete_procedure("unknown").await?);
                        assert!(!uow.procedure_exists("unknown").await?);
                        assert!(uow.procedure_exists("stored").await?);
                        Ok(())
                    })
                }))
                .await
                .unwrap();
        }

        // #705 — the orchestrator on SQLite, its patient write failing: the procedure is
        // left as it was, on creation and on deletion.
        mod orchestrator {
            use std::sync::Arc;

            use super::*;
            use crate::context::fund::SqliteFundRepository;
            use crate::context::patient::PatientService;
            use crate::context::procedure::{
                ProcedureService, SqliteProcedureRefundRepository, SqliteProcedureTypeRepository,
            };
            use crate::shared::event_bus::{EventBus, PatientUpdated, ProcedureUpdated};
            use crate::use_cases::procedure_orchestration::{
                CreateProcedureRequest, ProcedureOrchestrationError, ProcedureOrchestrationService,
                ProcedureOrchestrationTask,
            };

            /// The real unit of work, its patient write refused.
            struct PatientWriteFails<'a>(&'a mut dyn ProcedureTrackingUnitOfWork);

            #[async_trait::async_trait]
            impl ProcedureTrackingUnitOfWork for PatientWriteFails<'_> {
                async fn insert_procedure(&mut self, procedure: &Procedure) -> anyhow::Result<()> {
                    self.0.insert_procedure(procedure).await
                }
                async fn delete_procedure(&mut self, procedure_id: &str) -> anyhow::Result<bool> {
                    self.0.delete_procedure(procedure_id).await
                }
                async fn procedure_exists(&mut self, procedure_id: &str) -> anyhow::Result<bool> {
                    self.0.procedure_exists(procedure_id).await
                }
                async fn update_patient(&mut self, _patient: &Patient) -> anyhow::Result<()> {
                    anyhow::bail!("the patient's tracking write fails")
                }
            }

            struct FailingTracking(SqlxTransactionManager);

            #[async_trait::async_trait]
            impl ProcedureTrackingTransactionManager for FailingTracking {
                async fn run(&self, operation: ProcedureTrackingOperation) -> anyhow::Result<()> {
                    self.0
                        .run(Box::new(move |uow| {
                            Box::pin(async move {
                                let mut failing = PatientWriteFails(uow);
                                operation(&mut failing).await
                            })
                        }))
                        .await
                }
            }

            /// The service on SQLite, and the bus its notices would go to.
            fn service(pool: &SqlitePool) -> (ProcedureOrchestrationService, Arc<EventBus>) {
                service_with(pool, true)
            }

            /// `failing`: the patient write is refused.
            fn service_with(
                pool: &SqlitePool,
                failing: bool,
            ) -> (ProcedureOrchestrationService, Arc<EventBus>) {
                let manager = SqlxTransactionManager::new(pool.clone());
                let tracking: Arc<dyn ProcedureTrackingTransactionManager> = if failing {
                    Arc::new(FailingTracking(manager))
                } else {
                    Arc::new(manager)
                };
                let bus = Arc::new(EventBus::new());
                let patients = Arc::new(SqlitePatientRepository::new(pool.clone()));
                (
                    ProcedureOrchestrationService::new(
                        Arc::new(ProcedureService::new(
                            Arc::new(SqliteProcedureRepository::new(pool.clone())),
                            bus.clone(),
                        )),
                        patients.clone(),
                        Arc::new(SqliteProcedureTypeRepository::new(pool.clone())),
                        Arc::new(SqliteFundRepository::new(pool.clone())),
                        Arc::new(SqliteProcedureRefundRepository::new(pool.clone())),
                        Arc::new(PatientService::new(patients, bus.clone())),
                        tracking,
                    ),
                    bus,
                )
            }

            fn is_database_error(result: Result<impl Sized, ProcedureOrchestrationError>) -> bool {
                matches!(
                    result,
                    Err(ProcedureOrchestrationError::Task(
                        ProcedureOrchestrationTask::DatabaseError
                    ))
                )
            }

            #[tokio::test]
            async fn pro_260a_a_failed_tracking_write_creates_no_procedure_and_raises_nothing() {
                let pool = seeded_pool().await;

                let (service, bus) = service(&pool);
                let mut procedure_updates = bus.subscribe::<ProcedureUpdated>().expect("subscribe");
                let mut patient_updates = bus.subscribe::<PatientUpdated>().expect("subscribe");

                let result = service
                    .create_procedure(CreateProcedureRequest {
                        patient_id: "patient-1".to_string(),
                        fund_id: None,
                        procedure_type_id: "type-1".to_string(),
                        procedure_date: NaiveDate::from_ymd_opt(2026, 3, 12).unwrap(),
                        billed_amount: 60000,
                        payment_method: None,
                        confirmed_payment_date: None,
                        paid_amount: None,
                    })
                    .await;

                assert!(is_database_error(result));
                assert_eq!(procedure_ids(&pool).await, ["stored"]);
                assert!(procedure_updates.try_recv().is_err(), "no ProcedureUpdated");
                assert!(patient_updates.try_recv().is_err(), "no PatientUpdated");
            }

            #[tokio::test]
            async fn pro_270a_a_failed_tracking_write_deletes_no_procedure_and_raises_nothing() {
                let pool = seeded_pool().await;

                let (service, bus) = service(&pool);
                let mut procedure_updates = bus.subscribe::<ProcedureUpdated>().expect("subscribe");
                let mut patient_updates = bus.subscribe::<PatientUpdated>().expect("subscribe");

                let result = service.delete_procedure("stored").await;

                assert!(is_database_error(result));
                assert_eq!(procedure_ids(&pool).await, ["stored"]);
                assert!(procedure_updates.try_recv().is_err(), "no ProcedureUpdated");
                assert!(patient_updates.try_recv().is_err(), "no PatientUpdated");
            }

            #[tokio::test]
            async fn pro_260a_a_creation_writes_both_and_raises_each_notice_once() {
                let pool = seeded_pool().await;
                let (service, bus) = service_with(&pool, false);
                let mut procedure_updates = bus.subscribe::<ProcedureUpdated>().expect("subscribe");
                let mut patient_updates = bus.subscribe::<PatientUpdated>().expect("subscribe");

                let created = service
                    .create_procedure(CreateProcedureRequest {
                        patient_id: "patient-1".to_string(),
                        fund_id: None,
                        procedure_type_id: "type-1".to_string(),
                        procedure_date: NaiveDate::from_ymd_opt(2026, 3, 12).unwrap(),
                        billed_amount: 60000,
                        payment_method: None,
                        confirmed_payment_date: None,
                        paid_amount: None,
                    })
                    .await
                    .expect("the creation commits");

                assert!(procedure_ids(&pool).await.contains(&created.id));
                let latest: Option<String> =
                    sqlx::query_scalar("SELECT latest_date FROM patient WHERE id = 'patient-1'")
                        .fetch_one(&pool)
                        .await
                        .expect("patient");
                assert_eq!(latest.as_deref(), Some("2026-03-12"));
                assert!(
                    procedure_updates.try_recv().is_ok(),
                    "ProcedureUpdated (PRO-230)"
                );
                assert!(
                    procedure_updates.try_recv().is_err(),
                    "ProcedureUpdated once"
                );
                assert!(
                    patient_updates.try_recv().is_ok(),
                    "PatientUpdated (PRO-260)"
                );
                assert!(patient_updates.try_recv().is_err(), "PatientUpdated once");
            }

            #[tokio::test]
            async fn pro_270a_a_deletion_writes_both_and_raises_each_notice_once() {
                let pool = seeded_pool().await;
                sqlx::query("UPDATE patient SET latest_date = '2026-03-10', latest_procedure_type = 'type-1' WHERE id = 'patient-1'")
                    .execute(&pool)
                    .await
                    .expect("seed tracking");
                let (service, bus) = service_with(&pool, false);
                let mut procedure_updates = bus.subscribe::<ProcedureUpdated>().expect("subscribe");
                let mut patient_updates = bus.subscribe::<PatientUpdated>().expect("subscribe");

                service
                    .delete_procedure("stored")
                    .await
                    .expect("the deletion commits");

                assert!(procedure_ids(&pool).await.is_empty());
                let latest: Option<String> =
                    sqlx::query_scalar("SELECT latest_date FROM patient WHERE id = 'patient-1'")
                        .fetch_one(&pool)
                        .await
                        .expect("patient");
                assert_eq!(
                    latest, None,
                    "no procedure left: tracking cleared (PRO-270)"
                );
                assert!(
                    procedure_updates.try_recv().is_ok(),
                    "ProcedureUpdated (PRO-030)"
                );
                assert!(
                    procedure_updates.try_recv().is_err(),
                    "ProcedureUpdated once"
                );
                assert!(
                    patient_updates.try_recv().is_ok(),
                    "PatientUpdated (PRO-270)"
                );
                assert!(patient_updates.try_recv().is_err(), "PatientUpdated once");
            }
        }
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
            "INSERT INTO procedure_type (id, name, default_amount) VALUES ('gone-type', 'Gone', 100000)",
            "INSERT INTO procedure_type (id, name, default_amount) VALUES ('kept-type', 'Kept', 100000)",
            "INSERT INTO fund (id, fund_identifier, name) VALUES ('gone-fund', '75', 'Fund 75')",
            "INSERT INTO fund (id, fund_identifier, name) VALUES ('kept-fund', '93', 'Fund 93')",
            "INSERT INTO patient (id, name, is_anonymous, latest_procedure_type, latest_fund, latest_date) VALUES ('on-gone', 'Patient A', 0, 'gone-type', 'gone-fund', '2026-03-10')",
            "INSERT INTO patient (id, name, is_anonymous, latest_procedure_type, latest_fund, latest_date) VALUES ('on-kept', 'Patient B', 0, 'kept-type', 'kept-fund', '2026-03-11')",
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

    async fn ids(pool: &SqlitePool, sql: &'static str) -> Vec<String> {
        sqlx::query_scalar(sql).fetch_all(pool).await.expect("ids")
    }

    #[tokio::test]
    async fn pro_280_a_deleted_procedure_type_leaves_no_patient_default() {
        let pool = seeded_pool().await;

        SqlxTransactionManager::new(pool.clone())
            .run(Box::new(|uow| {
                Box::pin(async move {
                    assert!(uow.delete_procedure_type("gone-type").await?);
                    uow.clear_procedure_type_defaults("gone-type").await
                })
            }))
            .await
            .expect("both writes commit");

        assert_eq!(
            ids(&pool, "SELECT id FROM procedure_type ORDER BY id").await,
            ["import-pdf", "kept-type"].map(String::from)
        );
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
                    assert!(uow.delete_fund("gone-fund").await?);
                    uow.clear_fund_defaults("gone-fund").await
                })
            }))
            .await
            .expect("the lookups commit");

        assert_eq!(
            ids(&pool, "SELECT id FROM fund").await,
            ["kept-fund"].map(String::from)
        );
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
        assert!(ids(&pool, "SELECT id FROM fund")
            .await
            .contains(&"gone-fund".to_string()));
        assert_eq!(defaults(&pool, "on-gone").await.1, Some("gone-fund".into()));
    }

    /// R24 — the foreign key refuses a type a procedure uses; the count names them.
    #[tokio::test]
    async fn test_589_a_type_in_use_is_refused_and_counted() {
        let pool = seeded_pool().await;
        sqlx::query("INSERT INTO procedure (id, patient_id, procedure_type_id, procedure_date, billed_amount, payment_status) VALUES ('p', 'on-kept', 'kept-type', '2026-03-11', 100000, 'CREATED')")
            .execute(&pool)
            .await
            .expect("seed");
        let answers = std::sync::Arc::new(std::sync::Mutex::new(None));
        let seen = answers.clone();

        SqlxTransactionManager::new(pool.clone())
            .run(Box::new(move |uow| {
                Box::pin(async move {
                    let deleted = uow.delete_procedure_type("kept-type").await?;
                    let count = uow.count_procedures_of_type("kept-type").await?;
                    *seen.lock().unwrap() = Some((deleted, count));
                    Ok(())
                })
            }))
            .await
            .unwrap();

        assert_eq!(*answers.lock().unwrap(), Some((false, 1)));
        assert!(ids(&pool, "SELECT id FROM procedure_type")
            .await
            .contains(&"kept-type".to_string()));
    }

    /// PRO-291 — the foreign keys refuse a fund a procedure or a payment group uses;
    /// the counts name them.
    #[tokio::test]
    async fn test_590_a_fund_in_use_is_refused_and_counted() {
        let pool = seeded_pool().await;
        for statement in [
            "INSERT INTO procedure (id, patient_id, fund_id, procedure_type_id, procedure_date, billed_amount, payment_status) VALUES ('p', 'on-kept', 'kept-fund', 'kept-type', '2026-03-11', 100000, 'CREATED')",
            "INSERT INTO fund_payment_group (id, fund_id, payment_date, total_amount) VALUES ('g1', 'kept-fund', '2026-03-11', 100000)",
            "INSERT INTO fund_payment_group (id, fund_id, payment_date, total_amount) VALUES ('g2', 'kept-fund', '2026-03-12', 100000)",
        ] {
            sqlx::query(statement).execute(&pool).await.expect("seed");
        }
        let answers = std::sync::Arc::new(std::sync::Mutex::new(None));
        let seen = answers.clone();

        SqlxTransactionManager::new(pool.clone())
            .run(Box::new(move |uow| {
                Box::pin(async move {
                    let deleted = uow.delete_fund("kept-fund").await?;
                    let uses = uow.count_fund_uses("kept-fund").await?;
                    *seen.lock().unwrap() = Some((deleted, uses));
                    Ok(())
                })
            }))
            .await
            .unwrap();

        assert_eq!(*answers.lock().unwrap(), Some((false, (1, 2))));
        assert!(ids(&pool, "SELECT id FROM fund")
            .await
            .contains(&"kept-fund".to_string()));
    }

    /// PRO-296, PRO-297 — a patient a procedure names is refused and counted; one
    /// nothing names goes with its dismissals.
    #[tokio::test]
    async fn test_591_a_patient_goes_with_its_dismissals_unless_a_procedure_names_it() {
        let pool = seeded_pool().await;
        for statement in [
            "INSERT INTO procedure (id, patient_id, procedure_type_id, procedure_date, billed_amount, payment_status) VALUES ('p', 'on-kept', 'kept-type', '2026-03-11', 100000, 'CREATED')",
            "INSERT INTO patient_duplicate_dismissal (id, patient_a_id, patient_b_id) VALUES ('d', 'on-gone', 'on-kept')",
        ] {
            sqlx::query(statement).execute(&pool).await.expect("seed");
        }
        let answers = std::sync::Arc::new(std::sync::Mutex::new(None));
        let seen = answers.clone();

        SqlxTransactionManager::new(pool.clone())
            .run(Box::new(move |uow| {
                Box::pin(async move {
                    let refused = uow.delete_patient("on-kept").await?;
                    let count = uow.count_procedures_of_patient("on-kept").await?;
                    uow.delete_patient_dismissals("on-gone").await?;
                    let removed = uow.delete_patient("on-gone").await?;
                    let gone_exists = uow.patient_exists("on-gone").await?;
                    *seen.lock().unwrap() = Some((refused, count, removed, gone_exists));
                    Ok(())
                })
            }))
            .await
            .unwrap();

        assert_eq!(*answers.lock().unwrap(), Some((false, 1, true, false)));
        assert_eq!(
            ids(&pool, "SELECT id FROM patient").await,
            ["on-kept"].map(String::from)
        );
        assert!(ids(&pool, "SELECT id FROM patient_duplicate_dismissal")
            .await
            .is_empty());
    }

    /// PRO-296 — through the real orchestrator, a refused patient keeps its
    /// procedure and its dismissal, and no event is raised.
    #[tokio::test]
    async fn test_591_a_refused_patient_keeps_its_dismissals_and_raises_nothing() {
        use std::sync::Arc;

        use crate::context::fund::{FundService, MockFundRepository};
        use crate::context::patient::{MockPatientRepository, PatientService};
        use crate::context::procedure::{MockProcedureTypeRepository, ProcedureTypeService};
        use crate::shared::event_bus::{EventBus, PatientUpdated};
        use crate::use_cases::procedure_orchestration::{
            DeletionOrchestrator, ProcedureOrchestrationError, ProcedureOrchestrationTask,
        };

        let pool = seeded_pool().await;
        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&pool)
            .await
            .expect("foreign keys on");
        for statement in [
            "INSERT INTO procedure (id, patient_id, procedure_type_id, procedure_date, billed_amount, payment_status) VALUES ('p', 'on-kept', 'kept-type', '2026-03-11', 100000, 'CREATED')",
            "INSERT INTO patient_duplicate_dismissal (id, patient_a_id, patient_b_id) VALUES ('d', 'on-gone', 'on-kept')",
        ] {
            sqlx::query(statement).execute(&pool).await.expect("seed");
        }
        let bus = Arc::new(EventBus::new());
        let mut changed = bus.subscribe::<PatientUpdated>().expect("subscribe");
        let orchestrator = DeletionOrchestrator::new(
            Arc::new(ProcedureTypeService::new(
                Arc::new(MockProcedureTypeRepository::new()),
                bus.clone(),
            )),
            Arc::new(FundService::new(
                Arc::new(MockFundRepository::new()),
                bus.clone(),
            )),
            Arc::new(PatientService::new(
                Arc::new(MockPatientRepository::new()),
                bus,
            )),
            Arc::new(SqlxTransactionManager::new(pool.clone())),
        );

        let result = orchestrator.delete_patient("on-kept").await;

        assert!(matches!(
            result,
            Err(ProcedureOrchestrationError::Task(
                ProcedureOrchestrationTask::PatientInUse { procedure_count: 1 }
            ))
        ));
        assert!(ids(&pool, "SELECT id FROM patient")
            .await
            .contains(&"on-kept".to_string()));
        assert_eq!(
            ids(&pool, "SELECT id FROM patient_duplicate_dismissal").await,
            ["d"].map(String::from)
        );
        assert!(changed.try_recv().is_err());
    }
}

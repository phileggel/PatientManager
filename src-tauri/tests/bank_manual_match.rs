//! Integration tests for manual bank matching against an in-memory SQLite
//! database: a refund's transfer (REF-110) is removed only by the refund's
//! cancellation (REF-210, #391); the forms are judged here (BSM-020 to
//! BSM-031, #351).

use std::sync::Arc;

use patient_manager_app::{
    context::{
        bank::{
            BankEntryInvalidReason, BankEntryService, BankEntryType, BankError,
            SqliteBankAccountRepository, SqliteBankEntryLinkRepository, SqliteBankEntryRepository,
        },
        fund::{FundPaymentService, SqliteFundPaymentRepository},
        procedure::{ProcedureService, SqliteProcedureRepository},
    },
    shared::{
        event_bus::{BankEntryUpdated, EventBus, FundPaymentGroupUpdated, ProcedureUpdated},
        uow::SqlxTransactionManager,
    },
    use_cases::bank_manual_match::{
        BankEntryEdit, BankManualMatchError, BankManualMatchOrchestrator, BankManualMatchTask,
    },
};
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

async fn setup() -> (BankManualMatchOrchestrator, SqlitePool) {
    let (orchestrator, pool, _bus) = setup_with_bus().await;
    (orchestrator, pool)
}

async fn setup_with_bus() -> (BankManualMatchOrchestrator, SqlitePool, Arc<EventBus>) {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect(":memory:")
        .await
        .expect("in-memory SQLite pool");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("migrations");

    let bus = Arc::new(EventBus::new());
    let orchestrator = BankManualMatchOrchestrator::new(
        Arc::new(BankEntryService::new(
            Arc::new(SqliteBankEntryRepository::new(pool.clone())),
            Arc::new(SqliteBankAccountRepository::new(pool.clone())),
            bus.clone(),
        )),
        Arc::new(SqliteBankEntryLinkRepository::new(pool.clone())),
        Arc::new(FundPaymentService::new(
            Arc::new(SqliteFundPaymentRepository::new(pool.clone())),
            bus.clone(),
        )),
        Arc::new(ProcedureService::new(
            Arc::new(SqliteProcedureRepository::new(pool.clone())),
            bus.clone(),
        )),
        Arc::new(SqlxTransactionManager::new(pool.clone())),
    );
    (orchestrator, pool, bus)
}

/// A refund's transfer as the refund cascade stores it (REF-110), of the
/// given type, linked to its refund group (REF-120).
async fn seed_refund_transfer(pool: &SqlitePool, transfer_type: &str) -> String {
    for statement in [
        "INSERT INTO fund (id, fund_identifier, name) VALUES ('fund-1', '93', 'CPAM n° 93')",
        "INSERT INTO fund_payment_group (id, fund_id, payment_date, total_amount, status, origin)
         VALUES ('refund-group', 'fund-1', '2026-03-10', -150000, 'BANK_PAYED', 'REFUND')",
    ] {
        sqlx::query(statement)
            .execute(pool)
            .await
            .expect("seed the refund group");
    }
    sqlx::query(
        "INSERT INTO bank_transfer (id, transfer_date, amount, transfer_type, bank_account_id)
         VALUES ('refund-transfer', '2026-03-10', -150000, ?, 'cash-account-default')",
    )
    .bind(transfer_type)
    .execute(pool)
    .await
    .expect("seed the refund transfer");
    sqlx::query(
        "INSERT INTO bank_transfer_fund_group_link (id, bank_transfer_id, fund_payment_group_id)
         VALUES ('refund-link', 'refund-transfer', 'refund-group')",
    )
    .execute(pool)
    .await
    .expect("seed the refund link");
    "refund-transfer".to_string()
}

async fn transfer_count(pool: &SqlitePool, id: &str) -> i64 {
    sqlx::query_scalar("SELECT COUNT(*) FROM bank_transfer WHERE id = ?")
        .bind(id)
        .fetch_one(pool)
        .await
        .expect("count transfers")
}

/// REF-210 (#391): whatever the type the user paid the refund with (REF-060),
/// neither direct-transfer command takes the refund's transfer; it stays.
#[tokio::test]
async fn ref_210_direct_transfer_commands_refuse_a_refund_transfer() {
    for stored_type in ["OUTGOING_WIRE", "CHECK", "CREDIT_CARD"] {
        let (orchestrator, pool) = setup().await;
        let transfer_id = seed_refund_transfer(&pool, stored_type).await;

        let update = orchestrator
            .update_direct_transfer(
                transfer_id.clone(),
                "2026-03-11".to_string(),
                vec!["proc-x".to_string()],
            )
            .await
            .expect_err("a refund's transfer is not a direct payment");
        let delete = orchestrator
            .delete_direct_transfer(transfer_id.clone())
            .await
            .expect_err("a refund's transfer is not a direct payment");

        for err in [update, delete] {
            assert!(
                matches!(
                    err,
                    BankManualMatchError::Task(BankManualMatchTask::WrongTransferType)
                ),
                "{stored_type}: {err:?}"
            );
        }
        assert_eq!(
            transfer_count(&pool, &transfer_id).await,
            1,
            "{stored_type}"
        );
    }
}

fn reasons(err: BankManualMatchError) -> Vec<BankEntryInvalidReason> {
    match err {
        BankManualMatchError::Bank(BankError::BankEntryInvalid { reasons }) => reasons,
        other => panic!("expected BankEntryInvalid, got {other:?}"),
    }
}

async fn bank_entry_count(pool: &SqlitePool) -> i64 {
    sqlx::query_scalar("SELECT COUNT(*) FROM bank_transfer")
        .fetch_one(pool)
        .await
        .expect("count bank entries")
}

/// A `Created` procedure a direct payment can take.
async fn seed_open_procedure(pool: &SqlitePool) -> String {
    for statement in [
        "INSERT INTO patient (id, is_anonymous) VALUES ('patient-1', 0)",
        "INSERT INTO procedure_type (id, name, default_amount) VALUES ('type-1', 'Consultation', 50000)",
        r#"INSERT INTO "procedure" (id, patient_id, procedure_type_id, procedure_date, billed_amount, payment_status)
           VALUES ('proc-1', 'patient-1', 'type-1', '2026-03-10', 50000, 'CREATED')"#,
    ] {
        sqlx::query(statement).execute(pool).await.expect("seed");
    }
    "proc-1".to_string()
}

/// BSM-020: every missing field of a creation at once, nothing written; an
/// unknown account is not even read (BSM-021).
#[tokio::test]
async fn bsm_020_021_a_creation_is_refused_for_all_its_fields_first() {
    let (orchestrator, pool) = setup().await;

    let fund = orchestrator
        .create_fund_transfer(String::new(), String::new(), vec![])
        .await
        .expect_err("nothing filled in");
    let direct = orchestrator
        .create_direct_transfer(
            "no-such-account".to_string(),
            "2026-31-31".to_string(),
            BankEntryType::PatientCheck,
            vec![],
        )
        .await
        .expect_err("a malformed date and nothing selected");

    assert_eq!(
        reasons(fund),
        vec![
            BankEntryInvalidReason::AccountMissing,
            BankEntryInvalidReason::DateMissing,
            BankEntryInvalidReason::NothingSelected,
        ]
    );
    assert_eq!(
        reasons(direct),
        vec![
            BankEntryInvalidReason::DateInvalid,
            BankEntryInvalidReason::NothingSelected,
        ]
    );
    assert_eq!(bank_entry_count(&pool).await, 0);
}

/// BSM-020: a cash payment needs no account from the form (R13).
#[tokio::test]
async fn bsm_020_a_cash_creation_is_not_refused_for_its_account() {
    let (orchestrator, _pool) = setup().await;

    let err = orchestrator
        .create_direct_transfer(
            String::new(),
            String::new(),
            BankEntryType::PatientCash,
            vec![],
        )
        .await
        .expect_err("no date, nothing selected");

    assert_eq!(
        reasons(err),
        vec![
            BankEntryInvalidReason::DateMissing,
            BankEntryInvalidReason::NothingSelected,
        ]
    );
}

/// BSM-030: an edit refused for its date and selection, nothing written.
#[tokio::test]
async fn bsm_030_an_edit_is_refused_for_all_its_fields() {
    let (orchestrator, pool) = setup().await;
    let proc_id = seed_open_procedure(&pool).await;
    let created = orchestrator
        .create_direct_transfer(
            "cash-account-default".to_string(),
            "2026-03-10".to_string(),
            BankEntryType::PatientCheck,
            vec![proc_id],
        )
        .await
        .expect("a valid payment");

    let err = orchestrator
        .update_direct_transfer(created.transfer_id.clone(), " ".to_string(), vec![])
        .await
        .expect_err("a blank date, nothing selected");

    assert_eq!(
        reasons(err),
        vec![
            BankEntryInvalidReason::DateMissing,
            BankEntryInvalidReason::NothingSelected,
        ]
    );
    let date: String = sqlx::query_scalar("SELECT transfer_date FROM bank_transfer WHERE id = ?")
        .bind(&created.transfer_id)
        .fetch_one(&pool)
        .await
        .expect("read the payment");
    assert_eq!(date, "2026-03-10");
}

/// BSM-031: an edit equal to the stored payment is answered unchanged.
#[tokio::test]
async fn bsm_031_an_edit_that_changes_nothing_is_answered_unchanged() {
    let (orchestrator, pool, bus) = setup_with_bus().await;
    let proc_id = seed_open_procedure(&pool).await;
    let created = orchestrator
        .create_direct_transfer(
            "cash-account-default".to_string(),
            "2026-03-10".to_string(),
            BankEntryType::PatientCheck,
            vec![proc_id.clone()],
        )
        .await
        .expect("a valid payment");

    let mut procedures = bus.subscribe::<ProcedureUpdated>().expect("subscribe");
    let mut groups = bus
        .subscribe::<FundPaymentGroupUpdated>()
        .expect("subscribe");
    let mut entries = bus.subscribe::<BankEntryUpdated>().expect("subscribe");

    let unchanged = orchestrator
        .update_direct_transfer(
            created.transfer_id.clone(),
            "2026-03-10".to_string(),
            vec![proc_id.clone()],
        )
        .await
        .expect("an edit with nothing changed");
    // Nothing written, so nothing published.
    assert!(procedures.try_recv().is_err());
    assert!(groups.try_recv().is_err());
    assert!(entries.try_recv().is_err());
    let updated = orchestrator
        .update_direct_transfer(created.transfer_id, "2026-03-11".to_string(), vec![proc_id])
        .await
        .expect("a new date");

    assert_eq!(unchanged, BankEntryEdit::Unchanged);
    assert!(matches!(updated, BankEntryEdit::Updated { .. }));
}

/// BSM-030, BSM-021: a FUND edit is refused for its fields before the entry is
/// even looked up.
#[tokio::test]
async fn bsm_030_021_a_fund_edit_is_refused_for_its_fields_first() {
    let (orchestrator, _pool) = setup().await;

    let err = orchestrator
        .update_fund_transfer("no-such-entry".to_string(), String::new(), vec![])
        .await
        .expect_err("no date, nothing selected");

    assert_eq!(
        reasons(err),
        vec![
            BankEntryInvalidReason::DateMissing,
            BankEntryInvalidReason::NothingSelected,
        ]
    );
}

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
        fund::{FundError, FundPaymentService, SqliteFundPaymentRepository},
        procedure::{ProcedureError, ProcedureService, SqliteProcedureRepository},
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

/// A bank account and two `Active` fund payment groups a FUND entry can take.
async fn seed_account_and_two_groups(pool: &SqlitePool) {
    for statement in [
        "INSERT INTO bank_account (id, name) VALUES ('bank-acc', 'Bank')",
        "INSERT INTO fund (id, fund_identifier, name) VALUES ('fund-640', '75', 'CPAM n° 75')",
        "INSERT INTO fund_payment_group (id, fund_id, payment_date, total_amount, status)
         VALUES ('group-1', 'fund-640', '2026-03-09', 50000, 'ACTIVE')",
        "INSERT INTO fund_payment_group (id, fund_id, payment_date, total_amount, status)
         VALUES ('group-2', 'fund-640', '2026-03-09', 30000, 'ACTIVE')",
    ] {
        sqlx::query(statement).execute(pool).await.expect("seed");
    }
}

/// A second `Created` procedure, beside `seed_open_procedure`'s.
async fn seed_second_open_procedure(pool: &SqlitePool) -> String {
    sqlx::query(
        r#"INSERT INTO "procedure" (id, patient_id, procedure_type_id, procedure_date, billed_amount, payment_status)
           VALUES ('proc-2', 'patient-1', 'type-1', '2026-03-10', 30000, 'CREATED')"#,
    )
    .execute(pool)
    .await
    .expect("seed");
    "proc-2".to_string()
}

/// BSM-027 (#640): a fund's wire sent to the direct path is refused as a wrong
/// type, and nothing is written.
#[tokio::test]
async fn test_640_bsm_027_a_fund_wire_is_refused_as_a_direct_payment() {
    let (orchestrator, pool) = setup().await;
    let proc_id = seed_open_procedure(&pool).await;

    let err = orchestrator
        .create_direct_transfer(
            "any-account".to_string(),
            "2026-03-10".to_string(),
            BankEntryType::FundWire,
            vec![proc_id],
        )
        .await
        .expect_err("a fund wire is no direct payment");

    assert!(matches!(
        err,
        BankManualMatchError::Task(BankManualMatchTask::WrongTransferType)
    ));
    assert_eq!(bank_entry_count(&pool).await, 0);
    let status: String =
        sqlx::query_scalar(r#"SELECT payment_status FROM "procedure" WHERE id = 'proc-1'"#)
            .fetch_one(&pool)
            .await
            .expect("status");
    assert_eq!(status, "CREATED");
}

/// BSM-027's order (#720): the field refusals come first, and no selected
/// procedure is judged before the wrong type is refused.
#[tokio::test]
async fn test_720_bsm_027_a_fund_wire_as_a_direct_payment_is_refused_in_its_order() {
    let (orchestrator, pool) = setup().await;
    seed_open_procedure(&pool).await;
    sqlx::query(r#"UPDATE "procedure" SET payment_status = 'DIRECTLY_PAYED' WHERE id = 'proc-1'"#)
        .execute(&pool)
        .await
        .expect("a procedure that is not Created");

    // Bad fields: answered before the type.
    let err = orchestrator
        .create_direct_transfer(
            "".to_string(),
            "not-a-date".to_string(),
            BankEntryType::FundWire,
            vec!["proc-1".to_string()],
        )
        .await
        .expect_err("refused for its fields");
    assert_eq!(
        reasons(err),
        vec![
            BankEntryInvalidReason::AccountMissing,
            BankEntryInvalidReason::DateInvalid,
        ]
    );

    // Good fields, a procedure that is not Created: the type is refused first.
    let err = orchestrator
        .create_direct_transfer(
            "any-account".to_string(),
            "2026-03-10".to_string(),
            BankEntryType::FundWire,
            vec!["proc-1".to_string()],
        )
        .await
        .expect_err("refused for its type");
    assert!(matches!(
        err,
        BankManualMatchError::Task(BankManualMatchTask::WrongTransferType)
    ));
    assert_eq!(bank_entry_count(&pool).await, 0);
}

fn group_already_confirmed(err: BankManualMatchError) -> String {
    match err {
        BankManualMatchError::Fund(FundError::BankPaymentAlreadyConfirmed {
            fund_payment_group_id,
        }) => fund_payment_group_id,
        other => panic!("expected BankPaymentAlreadyConfirmed, got {other:?}"),
    }
}

async fn fund_link_count(pool: &SqlitePool) -> i64 {
    sqlx::query_scalar("SELECT COUNT(*) FROM bank_transfer_fund_group_link")
        .fetch_one(pool)
        .await
        .expect("count links")
}

/// BSM-037 (#640): a group a bank entry already settled is refused by a creation
/// and by another entry's edit, named, and nothing is written.
#[tokio::test]
async fn test_640_bsm_037_a_settled_group_is_refused_at_creation_and_edit() {
    let (orchestrator, pool) = setup().await;
    seed_account_and_two_groups(&pool).await;
    let create = |groups: &[&str]| {
        orchestrator.create_fund_transfer(
            "bank-acc".to_string(),
            "2026-03-10".to_string(),
            groups.iter().map(|g| g.to_string()).collect(),
        )
    };
    create(&["group-1"]).await.expect("group-1 settled");
    let other = create(&["group-2"]).await.expect("group-2 settled");

    let created = create(&["group-1"])
        .await
        .expect_err("settled once already");
    let edited = orchestrator
        .update_fund_transfer(
            other.transfer_id,
            "2026-03-10".to_string(),
            vec!["group-2".to_string(), "group-1".to_string()],
        )
        .await
        .expect_err("group-1 belongs to another entry");

    assert_eq!(group_already_confirmed(created), "group-1");
    assert_eq!(group_already_confirmed(edited), "group-1");
    assert_eq!(bank_entry_count(&pool).await, 2);
    assert_eq!(fund_link_count(&pool).await, 2);
}

/// BSM-037 (#640): an edit keeps a group its own entry settled.
#[tokio::test]
async fn test_640_bsm_037_an_edit_keeps_its_own_group() {
    let (orchestrator, pool) = setup().await;
    seed_account_and_two_groups(&pool).await;
    let entry = orchestrator
        .create_fund_transfer(
            "bank-acc".to_string(),
            "2026-03-10".to_string(),
            vec!["group-1".to_string()],
        )
        .await
        .expect("group-1 settled");

    let edited = orchestrator
        .update_fund_transfer(
            entry.transfer_id,
            "2026-03-11".to_string(),
            vec!["group-1".to_string(), "group-2".to_string()],
        )
        .await
        .expect("group-1 kept, group-2 added");

    assert!(matches!(edited, BankEntryEdit::Updated { .. }));
    assert_eq!(fund_link_count(&pool).await, 2);
}

fn procedure_not_created(err: BankManualMatchError) -> String {
    match err {
        BankManualMatchError::Procedure(ProcedureError::ProcedureStatusNotCreated {
            procedure_id,
        }) => procedure_id,
        other => panic!("expected ProcedureStatusNotCreated, got {other:?}"),
    }
}

/// BSM-039 (#640): a procedure that is not `Created` is refused by a creation and
/// by another entry's edit, named, and nothing is written; its own entry keeps it.
#[tokio::test]
async fn test_640_bsm_039_a_procedure_not_created_is_refused_at_creation_and_edit() {
    let (orchestrator, pool) = setup().await;
    let paid = seed_open_procedure(&pool).await;
    let open = seed_second_open_procedure(&pool).await;
    let create = |procedures: Vec<String>| {
        orchestrator.create_direct_transfer(
            "cash-account-default".to_string(),
            "2026-03-10".to_string(),
            BankEntryType::PatientCheck,
            procedures,
        )
    };
    let first = create(vec![paid.clone()]).await.expect("proc-1 paid");
    let other = create(vec![open.clone()]).await.expect("proc-2 paid");

    let created = create(vec![paid.clone()]).await.expect_err("paid already");
    let edited = orchestrator
        .update_direct_transfer(
            other.transfer_id,
            "2026-03-10".to_string(),
            vec![open.clone(), paid.clone()],
        )
        .await
        .expect_err("proc-1 belongs to another entry");
    let kept = orchestrator
        .update_direct_transfer(first.transfer_id, "2026-03-11".to_string(), vec![paid])
        .await
        .expect("its own procedure, a new date");

    assert_eq!(procedure_not_created(created), "proc-1");
    assert_eq!(procedure_not_created(edited), "proc-1");
    assert!(matches!(kept, BankEntryEdit::Updated { .. }));
    assert_eq!(bank_entry_count(&pool).await, 2);
}

/// BSM-028 (#640): a group or procedure repeated in a selection counts once — in the
/// amount and the links.
#[tokio::test]
async fn test_640_bsm_028_a_repeated_selection_counts_once() {
    let (orchestrator, pool) = setup().await;
    seed_account_and_two_groups(&pool).await;
    let proc_id = seed_open_procedure(&pool).await;

    let fund = orchestrator
        .create_fund_transfer(
            "bank-acc".to_string(),
            "2026-03-10".to_string(),
            vec!["group-1".to_string(), "group-1".to_string()],
        )
        .await
        .expect("group-1 once");
    let direct = orchestrator
        .create_direct_transfer(
            "cash-account-default".to_string(),
            "2026-03-10".to_string(),
            BankEntryType::PatientCheck,
            vec![proc_id.clone(), proc_id],
        )
        .await
        .expect("proc-1 once");

    assert_eq!((fund.linked_count, direct.linked_count), (1, 1));
    let amounts: Vec<i64> = sqlx::query_scalar("SELECT amount FROM bank_transfer ORDER BY amount")
        .fetch_all(&pool)
        .await
        .expect("amounts");
    assert_eq!(amounts, vec![50000, 50000]);
    assert_eq!(fund_link_count(&pool).await, 1);
}

// ---- #712: a fund's wire with no bordereau (BSM-050 to BSM-055) ----

/// A bank account, two funds, and three `Created` procedures of `fund-712`
/// dated out of order, one of `fund-other`.
async fn seed_712(pool: &SqlitePool) {
    for statement in [
        "INSERT INTO bank_account (id, name) VALUES ('bank-acc', 'Bank')",
        "INSERT INTO fund (id, fund_identifier, name) VALUES ('fund-712', '712', 'Fund with no bordereau')",
        "INSERT INTO fund (id, fund_identifier, name) VALUES ('fund-other', '713', 'Another fund')",
        "INSERT INTO patient (id, is_anonymous) VALUES ('patient-712', 0)",
        "INSERT INTO procedure_type (id, name, default_amount) VALUES ('type-712', 'Consultation', 46000)",
        r#"INSERT INTO "procedure" (id, patient_id, fund_id, procedure_type_id, procedure_date, billed_amount, payment_status)
           VALUES ('p-march', 'patient-712', 'fund-712', 'type-712', '2026-03-10', 46000, 'CREATED'),
                  ('p-january', 'patient-712', 'fund-712', 'type-712', '2026-01-05', 62500, 'CREATED'),
                  ('p-february', 'patient-712', 'fund-712', 'type-712', '2026-02-02', 46000, 'CREATED'),
                  ('p-other-fund', 'patient-712', 'fund-other', 'type-712', '2026-02-03', 46000, 'CREATED'),
                  ('p-paid', 'patient-712', 'fund-712', 'type-712', '2026-02-04', 46000, 'DIRECTLY_PAYED'),
                  ('p-free', 'patient-712', 'fund-712', 'type-712', '2026-02-05', 0, 'CREATED'),
                  ('p-in-group', 'patient-712', 'fund-712', 'type-712', '2026-02-06', 46000, 'CREATED')"#,
        "INSERT INTO fund_payment_group (id, fund_id, payment_date, total_amount, status)
         VALUES ('group-712', 'fund-712', '2026-02-10', 46000, 'ACTIVE')",
        "INSERT INTO fund_payment_line (id, fund_payment_group_id, procedure_id)
         VALUES ('line-712', 'group-712', 'p-in-group')",
    ] {
        sqlx::query(statement).execute(pool).await.expect("seed");
    }
}

/// A procedure's payment columns: id, status, method, confirmed payment date,
/// fund reconciliation date, paid amount.
type SettledProcedureRow = (
    String,
    String,
    String,
    Option<String>,
    Option<String>,
    Option<i64>,
);

fn not_open(err: BankManualMatchError) -> String {
    match err {
        BankManualMatchError::Task(BankManualMatchTask::ProcedureNotOpen { procedure_id }) => {
            procedure_id
        }
        other => panic!("expected ProcedureNotOpen, got {other:?}"),
    }
}

async fn count(pool: &SqlitePool, table: &str) -> i64 {
    sqlx::query_scalar(sqlx::AssertSqlSafe(format!("SELECT COUNT(*) FROM {table}")))
        .fetch_one(pool)
        .await
        .expect("count")
}

/// BSM-050: the fund's open procedures (BAS-112), oldest first, whatever their
/// date; another fund's, a paid one and one with no amount are not open.
#[tokio::test]
async fn test_712_bsm_050_the_open_procedures_of_a_fund_come_oldest_first() {
    let (orchestrator, pool) = setup().await;
    seed_712(&pool).await;

    let open = orchestrator
        .get_open_procedures_of_fund("fund-712")
        .await
        .expect("the open procedures");

    let seen: Vec<(&str, &str, i64)> = open
        .iter()
        .map(|p| {
            (
                p.procedure_id.as_str(),
                p.procedure_date.as_str(),
                p.billed_amount,
            )
        })
        .collect();
    assert_eq!(
        seen,
        vec![
            ("p-january", "2026-01-05", 62500),
            ("p-february", "2026-02-02", 46000),
            ("p-march", "2026-03-10", 46000),
        ]
    );
    let unknown = orchestrator
        .get_open_procedures_of_fund("no-such-fund")
        .await
        .expect("an unknown fund");
    assert!(unknown.is_empty());
}

/// BSM-051: the wire creates the fund's group — dated on the wire, total of the
/// billed amounts, one line per procedure, `BankPaid` and locked — and each
/// procedure is `FundPaid` on the wire's date for its billed amount.
#[tokio::test]
async fn test_712_bsm_051_a_wire_on_open_procedures_creates_their_settled_group() {
    let (orchestrator, pool) = setup().await;
    seed_712(&pool).await;

    let result = orchestrator
        .create_fund_wire_from_procedures(
            "bank-acc".to_string(),
            "2026-03-20".to_string(),
            "fund-712".to_string(),
            vec![
                "p-january".to_string(),
                "p-february".to_string(),
                "p-january".to_string(),
            ],
        )
        .await
        .expect("the wire is recorded");

    assert_eq!(
        result.linked_count, 2,
        "a repeated procedure counts once (BSM-028)"
    );
    let (wire_amount, wire_type, wire_date): (i64, String, String) = sqlx::query_as(
        "SELECT amount, transfer_type, transfer_date FROM bank_transfer WHERE id = ?",
    )
    .bind(&result.transfer_id)
    .fetch_one(&pool)
    .await
    .expect("the wire");
    assert_eq!(
        (wire_amount, wire_type.as_str(), wire_date.as_str()),
        (108_500, "FUND", "2026-03-20")
    );
    let (group_id, fund_id, payment_date, total, status): (String, String, String, i64, String) =
        sqlx::query_as(
            "SELECT g.id, g.fund_id, g.payment_date, g.total_amount, g.status
             FROM bank_transfer_fund_group_link l
             JOIN fund_payment_group g ON g.id = l.fund_payment_group_id
             WHERE l.bank_transfer_id = ?",
        )
        .bind(&result.transfer_id)
        .fetch_one(&pool)
        .await
        .expect("the group the wire settles");
    assert_eq!(
        (
            fund_id.as_str(),
            payment_date.as_str(),
            total,
            status.as_str()
        ),
        ("fund-712", "2026-03-20", 108_500, "BANK_PAYED")
    );
    let lines: Vec<String> = sqlx::query_scalar(
        "SELECT procedure_id FROM fund_payment_line WHERE fund_payment_group_id = ? ORDER BY procedure_id",
    )
    .bind(&group_id)
    .fetch_all(&pool)
    .await
    .expect("the group's lines");
    assert_eq!(lines, vec!["p-february", "p-january"]);
    let procedures: Vec<SettledProcedureRow> = sqlx::query_as(
        r#"SELECT id, payment_status, payment_method, confirmed_payment_date,
                      fund_reconciliation_date, paid_amount
               FROM "procedure" WHERE id IN ('p-january', 'p-february') ORDER BY id"#,
    )
    .fetch_all(&pool)
    .await
    .expect("the procedures");
    let day = Some("2026-03-20".to_string());
    assert_eq!(
        procedures,
        vec![
            (
                "p-february".to_string(),
                "FUND_PAYED".to_string(),
                "BANK_TRANSFER".to_string(),
                day.clone(),
                day.clone(),
                Some(46000)
            ),
            (
                "p-january".to_string(),
                "FUND_PAYED".to_string(),
                "BANK_TRANSFER".to_string(),
                day.clone(),
                day,
                Some(62500)
            ),
        ]
    );
    let untouched: String =
        sqlx::query_scalar(r#"SELECT payment_status FROM "procedure" WHERE id = 'p-march'"#)
            .fetch_one(&pool)
            .await
            .expect("the procedure left out");
    assert_eq!(untouched, "CREATED");
}

/// BSM-052: the fields are judged first, all at once, before the procedures.
#[tokio::test]
async fn test_712_bsm_052_such_a_wire_is_refused_for_all_its_fields_first() {
    let (orchestrator, pool) = setup().await;
    seed_712(&pool).await;

    let err = orchestrator
        .create_fund_wire_from_procedures(
            " ".to_string(),
            "not-a-date".to_string(),
            "fund-712".to_string(),
            vec![],
        )
        .await
        .expect_err("refused for its fields");

    assert_eq!(
        reasons(err),
        vec![
            BankEntryInvalidReason::AccountMissing,
            BankEntryInvalidReason::DateInvalid,
            BankEntryInvalidReason::NothingSelected,
        ]
    );
    let err = orchestrator
        .create_fund_wire_from_procedures(
            "".to_string(),
            "2026-03-20".to_string(),
            "fund-712".to_string(),
            vec!["p-paid".to_string()],
        )
        .await
        .expect_err("the account before the procedure");
    assert_eq!(reasons(err), vec![BankEntryInvalidReason::AccountMissing]);
    assert_eq!(bank_entry_count(&pool).await, 0);
}

/// BSM-053, BSM-054: a selection holding a procedure that is not open for the
/// fund is refused, naming the first one; nothing is written, nothing published.
#[tokio::test]
async fn test_712_bsm_053_054_a_procedure_not_open_refuses_the_wire_and_writes_nothing() {
    let (orchestrator, pool, bus) = setup_with_bus().await;
    seed_712(&pool).await;
    let mut procedures = bus.subscribe::<ProcedureUpdated>().expect("subscribe");
    let mut groups = bus
        .subscribe::<FundPaymentGroupUpdated>()
        .expect("subscribe");
    let mut entries = bus.subscribe::<BankEntryUpdated>().expect("subscribe");

    for (selection, first_refused) in [
        (vec!["p-january", "p-other-fund", "p-paid"], "p-other-fund"),
        (vec!["p-paid", "p-january"], "p-paid"),
        (vec!["p-free"], "p-free"),
        (vec!["p-in-group"], "p-in-group"),
        (vec!["p-january", "no-such-procedure"], "no-such-procedure"),
    ] {
        let err = orchestrator
            .create_fund_wire_from_procedures(
                "bank-acc".to_string(),
                "2026-03-20".to_string(),
                "fund-712".to_string(),
                selection.into_iter().map(String::from).collect(),
            )
            .await
            .expect_err("a procedure that is not open");
        assert_eq!(not_open(err), first_refused);
    }
    // An unknown or missing fund has no open procedure.
    for fund in ["no-such-fund", ""] {
        let err = orchestrator
            .create_fund_wire_from_procedures(
                "bank-acc".to_string(),
                "2026-03-20".to_string(),
                fund.to_string(),
                vec!["p-january".to_string()],
            )
            .await
            .expect_err("an unknown fund");
        assert_eq!(not_open(err), "p-january");
    }
    // A procedure that is not open is refused before the account is looked up.
    let err = orchestrator
        .create_fund_wire_from_procedures(
            "no-such-account".to_string(),
            "2026-03-20".to_string(),
            "fund-712".to_string(),
            vec!["p-paid".to_string()],
        )
        .await
        .expect_err("the procedure before the account");
    assert_eq!(not_open(err), "p-paid");

    assert_eq!(bank_entry_count(&pool).await, 0);
    assert_eq!(
        count(&pool, "fund_payment_group").await,
        1,
        "the seeded group only"
    );
    assert_eq!(count(&pool, "fund_payment_line").await, 1);
    let created: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM "procedure" WHERE id = 'p-january' AND payment_status = 'CREATED'"#,
    )
    .fetch_one(&pool)
    .await
    .expect("the procedure");
    assert_eq!(created, 1);
    assert!(procedures.try_recv().is_err());
    assert!(groups.try_recv().is_err());
    assert!(entries.try_recv().is_err());
}

/// BSM-054: an unknown account is refused after the procedures are judged, and
/// leaves no group behind.
#[tokio::test]
async fn test_712_bsm_054_an_unknown_account_leaves_no_group() {
    let (orchestrator, pool) = setup().await;
    seed_712(&pool).await;

    let err = orchestrator
        .create_fund_wire_from_procedures(
            "no-such-account".to_string(),
            "2026-03-20".to_string(),
            "fund-712".to_string(),
            vec!["p-january".to_string()],
        )
        .await
        .expect_err("an unknown account");

    assert!(matches!(
        err,
        BankManualMatchError::Bank(BankError::BankAccountNotFound { .. })
    ));
    assert_eq!(
        count(&pool, "fund_payment_group").await,
        1,
        "the seeded group only"
    );
}

/// BSM-054: a recorded wire publishes the three events.
#[tokio::test]
async fn test_712_bsm_054_a_recorded_wire_publishes_its_three_events() {
    let (orchestrator, pool, bus) = setup_with_bus().await;
    seed_712(&pool).await;
    let mut procedures = bus.subscribe::<ProcedureUpdated>().expect("subscribe");
    let mut groups = bus
        .subscribe::<FundPaymentGroupUpdated>()
        .expect("subscribe");
    let mut entries = bus.subscribe::<BankEntryUpdated>().expect("subscribe");

    orchestrator
        .create_fund_wire_from_procedures(
            "bank-acc".to_string(),
            "2026-03-20".to_string(),
            "fund-712".to_string(),
            vec!["p-march".to_string()],
        )
        .await
        .expect("the wire is recorded");

    assert!(procedures.try_recv().is_ok());
    assert!(groups.try_recv().is_ok());
    assert!(entries.try_recv().is_ok());
}

/// BSM-055: deleting such a wire leaves an ordinary group — `Active`, its
/// procedures `Reconciled` (R8, R1's declared exception).
#[tokio::test]
async fn test_712_bsm_055_deleting_the_wire_leaves_an_active_group_and_reconciled_procedures() {
    let (orchestrator, pool) = setup().await;
    seed_712(&pool).await;
    let result = orchestrator
        .create_fund_wire_from_procedures(
            "bank-acc".to_string(),
            "2026-03-20".to_string(),
            "fund-712".to_string(),
            vec!["p-march".to_string()],
        )
        .await
        .expect("the wire is recorded");

    orchestrator
        .delete_fund_transfer(result.transfer_id)
        .await
        .expect("the wire is deleted");

    let status: String =
        sqlx::query_scalar("SELECT status FROM fund_payment_group WHERE id <> 'group-712'")
            .fetch_one(&pool)
            .await
            .expect("the group stays");
    assert_eq!(status, "ACTIVE");
    let procedure: String =
        sqlx::query_scalar(r#"SELECT payment_status FROM "procedure" WHERE id = 'p-march'"#)
            .fetch_one(&pool)
            .await
            .expect("the procedure");
    assert_eq!(procedure, "RECONCILIATED");
    assert_eq!(bank_entry_count(&pool).await, 0);
}

/// BSM-054: a write that fails after the group is inserted leaves no group, no
/// line, no wire, and publishes nothing.
#[tokio::test]
async fn test_712_bsm_054_a_failed_write_leaves_no_group_and_publishes_nothing() {
    let (orchestrator, pool, bus) = setup_with_bus().await;
    seed_712(&pool).await;
    // The last write refuses: the new group becoming bank paid.
    sqlx::query(
        "CREATE TRIGGER refuse_group BEFORE UPDATE ON fund_payment_group
         WHEN NEW.status = 'BANK_PAYED' BEGIN SELECT RAISE(ABORT, 'refused'); END",
    )
    .execute(&pool)
    .await
    .expect("trigger");
    let mut procedures = bus.subscribe::<ProcedureUpdated>().expect("subscribe");
    let mut groups = bus
        .subscribe::<FundPaymentGroupUpdated>()
        .expect("subscribe");
    let mut entries = bus.subscribe::<BankEntryUpdated>().expect("subscribe");

    let result = orchestrator
        .create_fund_wire_from_procedures(
            "bank-acc".to_string(),
            "2026-03-20".to_string(),
            "fund-712".to_string(),
            vec!["p-january".to_string()],
        )
        .await;

    assert!(result.is_err());
    assert_eq!(
        count(&pool, "fund_payment_group").await,
        1,
        "the seeded group only"
    );
    assert_eq!(count(&pool, "fund_payment_line").await, 1);
    assert_eq!(bank_entry_count(&pool).await, 0);
    let status: String =
        sqlx::query_scalar(r#"SELECT payment_status FROM "procedure" WHERE id = 'p-january'"#)
            .fetch_one(&pool)
            .await
            .expect("the procedure");
    assert_eq!(status, "CREATED");
    assert!(procedures.try_recv().is_err());
    assert!(groups.try_recv().is_err());
    assert!(entries.try_recv().is_err());
}

/// BSM-055: such a wire is edited as any fund's wire — a new date moves the
/// confirmed payment date of its group's procedures (BSM-035).
#[tokio::test]
async fn test_712_bsm_055_the_wire_is_edited_as_any_fund_wire() {
    let (orchestrator, pool) = setup().await;
    seed_712(&pool).await;
    let result = orchestrator
        .create_fund_wire_from_procedures(
            "bank-acc".to_string(),
            "2026-03-20".to_string(),
            "fund-712".to_string(),
            vec!["p-march".to_string()],
        )
        .await
        .expect("the wire is recorded");
    let group: String = sqlx::query_scalar(
        "SELECT fund_payment_group_id FROM bank_transfer_fund_group_link WHERE bank_transfer_id = ?",
    )
    .bind(&result.transfer_id)
    .fetch_one(&pool)
    .await
    .expect("its group");

    let edit = orchestrator
        .update_fund_transfer(
            result.transfer_id.clone(),
            "2026-03-25".to_string(),
            vec![group],
        )
        .await
        .expect("the edit");

    assert!(matches!(edit, BankEntryEdit::Updated { .. }));
    let (status, confirmed): (String, Option<String>) = sqlx::query_as(
        r#"SELECT payment_status, confirmed_payment_date FROM "procedure" WHERE id = 'p-march'"#,
    )
    .fetch_one(&pool)
    .await
    .expect("the procedure");
    assert_eq!(
        (status.as_str(), confirmed.as_deref()),
        ("FUND_PAYED", Some("2026-03-25"))
    );
}

/// Groups 1 and 2 of `seed_account_and_two_groups`, each holding one procedure:
/// `p-reconciled` (reconciled on 2026-03-09, paid 50000) and `p-in-group-2` in `status`.
async fn seed_group_procedures(pool: &SqlitePool, status: &str) {
    seed_account_and_two_groups(pool).await;
    for statement in [
        "INSERT INTO patient (id, is_anonymous) VALUES ('patient-602', 0)",
        "INSERT INTO procedure_type (id, name, default_amount) VALUES ('type-602', 'Consultation', 50000)",
        r#"INSERT INTO "procedure" (id, patient_id, fund_id, procedure_type_id, procedure_date, billed_amount,
                                    payment_status, fund_reconciliation_date, paid_amount)
           VALUES ('p-reconciled', 'patient-602', 'fund-640', 'type-602', '2026-03-01', 50000,
                   'RECONCILIATED', '2026-03-09', 50000)"#,
    ] {
        sqlx::query(statement).execute(pool).await.expect("seed");
    }
    sqlx::query(
        r#"INSERT INTO "procedure" (id, patient_id, fund_id, procedure_type_id, procedure_date, billed_amount, payment_status)
           VALUES ('p-in-group-2', 'patient-602', 'fund-640', 'type-602', '2026-03-02', 30000, ?)"#,
    )
    .bind(status)
    .execute(pool)
    .await
    .expect("seed");
    sqlx::query(
        "INSERT INTO fund_payment_line (id, fund_payment_group_id, procedure_id)
         VALUES ('line-1', 'group-1', 'p-reconciled'), ('line-2', 'group-2', 'p-in-group-2')",
    )
    .execute(pool)
    .await
    .expect("seed");
}

fn procedure_not_reconciled(err: BankManualMatchError) -> String {
    match err {
        BankManualMatchError::Procedure(ProcedureError::ProcedureStatusNotReconciled {
            procedure_id,
        }) => procedure_id,
        other => panic!("expected ProcedureStatusNotReconciled, got {other:?}"),
    }
}

/// BSM-037A (#602): a group holding a procedure neither reconciled nor partially
/// reconciled is refused by a creation and by an edit, named, and nothing is written.
#[tokio::test]
async fn test_602_bsm_037a_a_group_with_a_procedure_not_reconciled_is_refused() {
    let (orchestrator, pool) = setup().await;
    seed_group_procedures(&pool, "DIRECTLY_PAYED").await;

    let created = orchestrator
        .create_fund_transfer(
            "bank-acc".to_string(),
            "2026-03-10".to_string(),
            vec!["group-1".to_string(), "group-2".to_string()],
        )
        .await
        .expect_err("group-2 holds a procedure paid directly");
    let entry = orchestrator
        .create_fund_transfer(
            "bank-acc".to_string(),
            "2026-03-10".to_string(),
            vec!["group-1".to_string()],
        )
        .await
        .expect("group-1 alone is settled");
    let edited = orchestrator
        .update_fund_transfer(
            entry.transfer_id,
            "2026-03-10".to_string(),
            vec!["group-1".to_string(), "group-2".to_string()],
        )
        .await
        .expect_err("the edit adds group-2");

    assert_eq!(procedure_not_reconciled(created), "p-in-group-2");
    assert_eq!(procedure_not_reconciled(edited), "p-in-group-2");
    assert_eq!(bank_entry_count(&pool).await, 1);
    assert_eq!(fund_link_count(&pool).await, 1);
    let untouched: String =
        sqlx::query_scalar(r#"SELECT payment_status FROM "procedure" WHERE id = 'p-in-group-2'"#)
            .fetch_one(&pool)
            .await
            .expect("status");
    assert_eq!(untouched, "DIRECTLY_PAYED");
}

/// R8 (#602): deleting a fund's wire clears its procedures' payment method and
/// confirmed payment date; the fund reconciliation date and the paid amount stay.
#[tokio::test]
async fn test_602_r8_deleting_a_wire_clears_the_confirmed_payment_date() {
    let (orchestrator, pool) = setup().await;
    seed_group_procedures(&pool, "RECONCILIATED").await;
    let entry = orchestrator
        .create_fund_transfer(
            "bank-acc".to_string(),
            "2026-03-10".to_string(),
            vec!["group-1".to_string()],
        )
        .await
        .expect("group-1 settled");

    orchestrator
        .delete_fund_transfer(entry.transfer_id)
        .await
        .expect("the wire is deleted");

    let row: SettledProcedureRow = sqlx::query_as(
        r#"SELECT id, payment_status, COALESCE(payment_method, 'NONE'), confirmed_payment_date,
                  fund_reconciliation_date, paid_amount
           FROM "procedure" WHERE id = 'p-reconciled'"#,
    )
    .fetch_one(&pool)
    .await
    .expect("procedure");
    assert_eq!(row.1, "RECONCILIATED");
    assert_eq!(row.2, "NONE");
    assert_eq!(row.3, None, "the confirmed payment date is cleared");
    assert_eq!(row.4.as_deref(), Some("2026-03-09"));
    assert_eq!(row.5, Some(50000));
}

/// R8, BSM-037A (#602, owner): an edit that keeps a group holding an `Overpaid`
/// procedure passes, and the procedure is left as it is.
#[tokio::test]
async fn test_602_an_overpaid_procedure_is_left_as_it_is_by_an_edit() {
    let (orchestrator, pool) = setup().await;
    seed_group_procedures(&pool, "RECONCILIATED").await;
    let entry = orchestrator
        .create_fund_transfer(
            "bank-acc".to_string(),
            "2026-03-10".to_string(),
            vec!["group-2".to_string()],
        )
        .await
        .expect("group-2 settled");
    sqlx::query(r#"UPDATE "procedure" SET payment_status = 'OVERPAID' WHERE id = 'p-in-group-2'"#)
        .execute(&pool)
        .await
        .expect("overpaid after the wire");

    orchestrator
        .update_fund_transfer(
            entry.transfer_id,
            "2026-03-11".to_string(),
            vec!["group-2".to_string()],
        )
        .await
        .expect("the group is kept");

    let (status, confirmed): (String, Option<String>) = sqlx::query_as(
        r#"SELECT payment_status, confirmed_payment_date FROM "procedure" WHERE id = 'p-in-group-2'"#,
    )
    .fetch_one(&pool)
    .await
    .expect("procedure");
    assert_eq!(status, "OVERPAID");
    assert_eq!(confirmed.as_deref(), Some("2026-03-10"), "left as it is");
}

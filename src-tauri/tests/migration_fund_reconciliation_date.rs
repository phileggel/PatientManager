//! Backfill test for migration 20260522_add_fund_reconciliation_date_to_procedure.sql.
//!
//! Verifies the three branches of the backfill logic across realistic fixtures:
//!
//! 1. Stage-1-only procedure (in a FundPaymentGroup with no bank-transfer link):
//!    the stale `confirmed_payment_date` (= group's payment_date written by the
//!    pre-fix manual-management orchestrator) moves to `fund_reconciliation_date`
//!    and `confirmed_payment_date` is cleared.
//!
//! 2. Stage-2 procedure (group has a bank-transfer link):
//!    `fund_reconciliation_date` is populated from the group's payment_date,
//!    `confirmed_payment_date` is preserved (= bank-transfer date).
//!
//! 3. No-group procedure (Created or directly-paid):
//!    neither field changes.
//!
//! The backfill SQL is duplicated below so the test can re-execute it against
//! synthetic fixtures (the migration itself ran on an empty DB during setup).
//! Keep this string in sync with the corresponding UPDATE statements in
//! `migrations/20260522_add_fund_reconciliation_date_to_procedure.sql`.

use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

const BACKFILL_FUND_RECONCILIATION_DATE: &str = r#"
UPDATE procedure
SET fund_reconciliation_date = (
    SELECT fpg.payment_date
    FROM fund_payment_line fpl
    JOIN fund_payment_group fpg ON fpg.id = fpl.fund_payment_group_id
    WHERE fpl.procedure_id = procedure.id
      AND fpl.is_deleted = 0
      AND fpg.is_deleted = 0
    LIMIT 1
)
WHERE procedure.is_deleted = 0
  AND EXISTS (
    SELECT 1
    FROM fund_payment_line fpl
    JOIN fund_payment_group fpg ON fpg.id = fpl.fund_payment_group_id
    WHERE fpl.procedure_id = procedure.id
      AND fpl.is_deleted = 0
      AND fpg.is_deleted = 0
  )
"#;

const CLEAR_STALE_CONFIRMED_PAYMENT_DATE: &str = r#"
UPDATE procedure
SET confirmed_payment_date = NULL
WHERE procedure.is_deleted = 0
  AND EXISTS (
    SELECT 1
    FROM fund_payment_line fpl
    WHERE fpl.procedure_id = procedure.id
      AND fpl.is_deleted = 0
      AND fpl.fund_payment_group_id NOT IN (
        SELECT btfg.fund_payment_group_id
        FROM bank_transfer_fund_group_link btfg
      )
  )
"#;

async fn make_pool() -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect(":memory:")
        .await
        .expect("in-memory SQLite pool");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("migrations");
    pool
}

async fn insert_fixtures_pre_migration_shape(pool: &SqlitePool) {
    // Patient + fund + procedure_type (FK satisfiers).
    sqlx::query("INSERT INTO patient (id, name) VALUES ('pat-1', 'Test Patient')")
        .execute(pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO fund (id, fund_identifier, name) VALUES ('fund-1', '440', 'CPAM')")
        .execute(pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO procedure_type (id, name, default_amount) VALUES ('ptype-1', 'Consultation', 25000)")
        .execute(pool)
        .await
        .unwrap();

    // Stage 1-only procedure: in a FundPaymentGroup, no bank link.
    // Simulates the pre-fix orchestrator writing the group's payment_date
    // into confirmed_payment_date.
    sqlx::query("INSERT INTO fund_payment_group (id, fund_id, payment_date, total_amount) VALUES ('grp-stage1', 'fund-1', '2026-03-15', 50000)")
        .execute(pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO procedure (id, patient_id, fund_id, procedure_type_id, procedure_date, billed_amount, payment_method, confirmed_payment_date, paid_amount, payment_status, fund_reconciliation_date)
         VALUES ('proc-stage1', 'pat-1', 'fund-1', 'ptype-1', '2026-03-01', 50000, NULL, '2026-03-15', 50000, 'RECONCILIATED', NULL)"
    )
    .execute(pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO fund_payment_line (id, fund_payment_group_id, procedure_id) VALUES ('line-stage1', 'grp-stage1', 'proc-stage1')")
        .execute(pool)
        .await
        .unwrap();

    // Stage 2 procedure: in a FundPaymentGroup AND group has a bank-transfer link.
    // confirmed_payment_date holds the bank-transfer date (≠ group's payment_date).
    sqlx::query("INSERT INTO fund_payment_group (id, fund_id, payment_date, total_amount) VALUES ('grp-stage2', 'fund-1', '2026-03-15', 50000)")
        .execute(pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO procedure (id, patient_id, fund_id, procedure_type_id, procedure_date, billed_amount, payment_method, confirmed_payment_date, paid_amount, payment_status, fund_reconciliation_date)
         VALUES ('proc-stage2', 'pat-1', 'fund-1', 'ptype-1', '2026-03-02', 50000, 'BANK_TRANSFER', '2026-04-01', 50000, 'FUND_PAYED', NULL)"
    )
    .execute(pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO fund_payment_line (id, fund_payment_group_id, procedure_id) VALUES ('line-stage2', 'grp-stage2', 'proc-stage2')")
        .execute(pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO bank_account (id, name, iban) VALUES ('acct-1', 'Test', 'FR123')")
        .execute(pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO bank_transfer (id, transfer_date, amount, transfer_type, bank_account_id) VALUES ('tx-1', '2026-04-01', 50000, 'FUND_WIRE', 'acct-1')")
        .execute(pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO bank_transfer_fund_group_link (id, bank_transfer_id, fund_payment_group_id) VALUES ('btfg-1', 'tx-1', 'grp-stage2')")
        .execute(pool)
        .await
        .unwrap();

    // No-group procedure: never reconciled. Direct-paid via import.
    sqlx::query(
        "INSERT INTO procedure (id, patient_id, fund_id, procedure_type_id, procedure_date, billed_amount, payment_method, confirmed_payment_date, paid_amount, payment_status, fund_reconciliation_date)
         VALUES ('proc-nogroup', 'pat-1', NULL, 'ptype-1', '2026-02-05', 30000, 'CASH', '2026-02-10', 30000, 'IMPORT_DIRECTLY_PAYED', NULL)"
    )
    .execute(pool)
    .await
    .unwrap();
}

#[derive(Debug, sqlx::FromRow)]
struct ProcRow {
    fund_reconciliation_date: Option<String>,
    confirmed_payment_date: Option<String>,
}

async fn fetch(pool: &SqlitePool, id: &str) -> ProcRow {
    sqlx::query_as::<_, ProcRow>(
        "SELECT fund_reconciliation_date, confirmed_payment_date FROM procedure WHERE id = ?",
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .unwrap()
}

#[tokio::test]
async fn backfill_moves_stage1_date_and_clears_confirmed_payment_date() {
    let pool = make_pool().await;
    insert_fixtures_pre_migration_shape(&pool).await;

    sqlx::query(BACKFILL_FUND_RECONCILIATION_DATE)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(CLEAR_STALE_CONFIRMED_PAYMENT_DATE)
        .execute(&pool)
        .await
        .unwrap();

    let stage1 = fetch(&pool, "proc-stage1").await;
    assert_eq!(
        stage1.fund_reconciliation_date.as_deref(),
        Some("2026-03-15"),
        "Stage 1 proc: fund_reconciliation_date should equal group's payment_date",
    );
    assert!(
        stage1.confirmed_payment_date.is_none(),
        "Stage 1 proc: confirmed_payment_date should be cleared (was stale group date)",
    );
}

#[tokio::test]
async fn backfill_preserves_stage2_bank_transfer_date() {
    let pool = make_pool().await;
    insert_fixtures_pre_migration_shape(&pool).await;

    sqlx::query(BACKFILL_FUND_RECONCILIATION_DATE)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(CLEAR_STALE_CONFIRMED_PAYMENT_DATE)
        .execute(&pool)
        .await
        .unwrap();

    let stage2 = fetch(&pool, "proc-stage2").await;
    assert_eq!(
        stage2.fund_reconciliation_date.as_deref(),
        Some("2026-03-15"),
        "Stage 2 proc: fund_reconciliation_date should equal group's payment_date",
    );
    assert_eq!(
        stage2.confirmed_payment_date.as_deref(),
        Some("2026-04-01"),
        "Stage 2 proc: confirmed_payment_date must stay as the bank-transfer date",
    );
}

#[tokio::test]
async fn backfill_leaves_no_group_procedures_untouched() {
    let pool = make_pool().await;
    insert_fixtures_pre_migration_shape(&pool).await;

    sqlx::query(BACKFILL_FUND_RECONCILIATION_DATE)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(CLEAR_STALE_CONFIRMED_PAYMENT_DATE)
        .execute(&pool)
        .await
        .unwrap();

    let nogroup = fetch(&pool, "proc-nogroup").await;
    assert!(
        nogroup.fund_reconciliation_date.is_none(),
        "No-group proc: fund_reconciliation_date must remain NULL",
    );
    assert_eq!(
        nogroup.confirmed_payment_date.as_deref(),
        Some("2026-02-10"),
        "No-group proc: confirmed_payment_date (= direct-payment date) must be preserved",
    );
}

#[tokio::test]
async fn backfill_is_idempotent() {
    let pool = make_pool().await;
    insert_fixtures_pre_migration_shape(&pool).await;

    // Run the backfill twice — the second run must produce the same result.
    for _ in 0..2 {
        sqlx::query(BACKFILL_FUND_RECONCILIATION_DATE)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(CLEAR_STALE_CONFIRMED_PAYMENT_DATE)
            .execute(&pool)
            .await
            .unwrap();
    }

    let stage1 = fetch(&pool, "proc-stage1").await;
    assert_eq!(
        stage1.fund_reconciliation_date.as_deref(),
        Some("2026-03-15")
    );
    assert!(stage1.confirmed_payment_date.is_none());

    let stage2 = fetch(&pool, "proc-stage2").await;
    assert_eq!(
        stage2.fund_reconciliation_date.as_deref(),
        Some("2026-03-15")
    );
    assert_eq!(stage2.confirmed_payment_date.as_deref(), Some("2026-04-01"));

    let nogroup = fetch(&pool, "proc-nogroup").await;
    assert!(nogroup.fund_reconciliation_date.is_none());
    assert_eq!(
        nogroup.confirmed_payment_date.as_deref(),
        Some("2026-02-10")
    );
}

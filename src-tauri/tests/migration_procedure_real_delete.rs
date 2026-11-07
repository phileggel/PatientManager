//! Upgrade test for migration 20261109_procedure_real_delete.sql (#588).

use sqlx::migrate::Migration;
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

const VERSION: i64 = 20261109;

fn migrations() -> Vec<Migration> {
    sqlx::migrate!("./migrations").iter().cloned().collect()
}

async fn pool_before_the_migration() -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect(":memory:")
        .await
        .expect("in-memory SQLite pool");
    sqlx::query("PRAGMA foreign_keys = OFF")
        .execute(&pool)
        .await
        .expect("foreign keys off");
    for migration in migrations().iter().filter(|m| m.version < VERSION) {
        sqlx::raw_sql(migration.sql.clone())
            .execute(&pool)
            .await
            .unwrap_or_else(|e| panic!("migration {}: {e}", migration.version));
    }
    pool
}

async fn run_the_migration(pool: &SqlitePool) {
    let migration = migrations()
        .into_iter()
        .find(|m| m.version == VERSION)
        .expect("the migration exists");
    sqlx::raw_sql(migration.sql.clone())
        .execute(pool)
        .await
        .expect("the migration runs");
}

/// PRO-031 — a flagged procedure nothing refers to goes. One still referred to by a
/// payment line, a bank link or a refund record (either side) stays, so no row is
/// left dangling, and a live procedure stays.
#[tokio::test]
async fn test_588_pro_031_flagged_procedures_go_unless_referred_to() {
    let pool = pool_before_the_migration().await;
    for statement in [
        "INSERT INTO procedure (id, patient_id, procedure_type_id, procedure_date, billed_amount, payment_status, is_deleted) VALUES ('live', 'pat', 'type', '2026-01-20', 100, 'CREATED', 0)",
        "INSERT INTO procedure (id, patient_id, procedure_type_id, procedure_date, billed_amount, payment_status, is_deleted) VALUES ('old', 'pat', 'type', '2026-01-20', 100, 'CREATED', 1)",
        "INSERT INTO procedure (id, patient_id, procedure_type_id, procedure_date, billed_amount, payment_status, is_deleted) VALUES ('old-with-line', 'pat', 'type', '2026-01-20', 100, 'CREATED', 1)",
        "INSERT INTO procedure (id, patient_id, procedure_type_id, procedure_date, billed_amount, payment_status, is_deleted) VALUES ('old-with-link', 'pat', 'type', '2026-01-20', 100, 'CREATED', 1)",
        "INSERT INTO procedure (id, patient_id, procedure_type_id, procedure_date, billed_amount, payment_status, is_deleted) VALUES ('old-refund-source', 'pat', 'type', '2026-01-20', 100, 'CREATED', 1)",
        "INSERT INTO procedure (id, patient_id, procedure_type_id, procedure_date, billed_amount, payment_status, is_deleted) VALUES ('old-refund', 'pat', 'type', '2026-01-20', 100, 'CREATED', 1)",
        "INSERT INTO fund_payment_line (id, fund_payment_group_id, procedure_id) VALUES ('l', 'g', 'old-with-line')",
        "INSERT INTO bank_transfer_procedure_link (id, bank_transfer_id, procedure_id) VALUES ('k', 't', 'old-with-link')",
        "INSERT INTO procedure_refund (id, source_procedure_id, refund_procedure_id, refund_fund_payment_group_id, refund_bank_transfer_id, refund_date, previous_payment_status) VALUES ('r', 'old-refund-source', 'old-refund', 'g', 't', '2026-01-20', 'CREATED')",
    ] {
        sqlx::query(statement).execute(&pool).await.expect("seed");
    }

    run_the_migration(&pool).await;

    let procedures: Vec<String> = sqlx::query_scalar("SELECT id FROM procedure ORDER BY id")
        .fetch_all(&pool)
        .await
        .expect("read procedures");
    assert_eq!(
        procedures,
        [
            "live",
            "old-refund",
            "old-refund-source",
            "old-with-line",
            "old-with-link"
        ]
        .map(String::from)
    );
}

#[tokio::test]
async fn test_588_the_column_and_its_index_are_gone() {
    let pool = pool_before_the_migration().await;

    run_the_migration(&pool).await;

    let columns: Vec<String> =
        sqlx::query_scalar("SELECT name FROM pragma_table_info('procedure')")
            .fetch_all(&pool)
            .await
            .expect("read columns");
    assert!(!columns.contains(&"is_deleted".to_string()), "{columns:?}");
    let indexes: Vec<String> =
        sqlx::query_scalar("SELECT name FROM pragma_index_list('procedure')")
            .fetch_all(&pool)
            .await
            .expect("read indexes");
    assert!(
        !indexes.contains(&"idx_procedure_deleted".to_string()),
        "{indexes:?}"
    );
}

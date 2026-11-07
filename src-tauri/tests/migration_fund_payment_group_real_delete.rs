//! Upgrade test for migration 20261107_fund_payment_group_real_delete.sql (#586).

use sqlx::migrate::Migration;
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

const VERSION: i64 = 20261107;

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

/// A flagged group nothing refers to goes. A flagged group still referred to by a
/// line, a bank link or a refund record stays, so no row is left dangling, and a
/// live group stays.
#[tokio::test]
async fn test_586_fpm_401_flagged_groups_go_unless_referred_to() {
    let pool = pool_before_the_migration().await;
    for statement in [
        "INSERT INTO fund_payment_group (id, fund_id, payment_date, total_amount, status, is_deleted) VALUES ('live', 'f', '2026-01-20', 100, 'ACTIVE', 0)",
        "INSERT INTO fund_payment_group (id, fund_id, payment_date, total_amount, status, is_deleted) VALUES ('old', 'f', '2026-01-20', 100, 'ACTIVE', 1)",
        "INSERT INTO fund_payment_group (id, fund_id, payment_date, total_amount, status, is_deleted) VALUES ('old-with-line', 'f', '2026-01-20', 100, 'ACTIVE', 1)",
        "INSERT INTO fund_payment_group (id, fund_id, payment_date, total_amount, status, is_deleted) VALUES ('old-with-link', 'f', '2026-01-20', 100, 'ACTIVE', 1)",
        "INSERT INTO fund_payment_group (id, fund_id, payment_date, total_amount, status, is_deleted) VALUES ('old-with-refund', 'f', '2026-01-20', 100, 'ACTIVE', 1)",
        "INSERT INTO fund_payment_line (id, fund_payment_group_id, procedure_id) VALUES ('l', 'old-with-line', 'p')",
        "INSERT INTO bank_transfer_fund_group_link (id, bank_transfer_id, fund_payment_group_id) VALUES ('k', 't', 'old-with-link')",
        "INSERT INTO procedure_refund (id, source_procedure_id, refund_procedure_id, refund_fund_payment_group_id, refund_bank_transfer_id, refund_date, previous_payment_status) VALUES ('r', 's', 'rp', 'old-with-refund', 't', '2026-01-20', 'CREATED')",
    ] {
        sqlx::query(statement).execute(&pool).await.expect("seed");
    }

    run_the_migration(&pool).await;

    let groups: Vec<String> = sqlx::query_scalar("SELECT id FROM fund_payment_group ORDER BY id")
        .fetch_all(&pool)
        .await
        .expect("read groups");
    assert_eq!(
        groups,
        ["live", "old-with-line", "old-with-link", "old-with-refund"].map(String::from)
    );
}

#[tokio::test]
async fn test_586_the_column_and_its_index_are_gone() {
    let pool = pool_before_the_migration().await;

    run_the_migration(&pool).await;

    let columns: Vec<String> =
        sqlx::query_scalar("SELECT name FROM pragma_table_info('fund_payment_group')")
            .fetch_all(&pool)
            .await
            .expect("read columns");
    assert!(!columns.contains(&"is_deleted".to_string()), "{columns:?}");
    let indexes: Vec<String> =
        sqlx::query_scalar("SELECT name FROM pragma_index_list('fund_payment_group')")
            .fetch_all(&pool)
            .await
            .expect("read indexes");
    assert!(
        !indexes.contains(&"idx_fund_payment_group_deleted".to_string()),
        "{indexes:?}"
    );
}

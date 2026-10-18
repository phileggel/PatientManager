//! Upgrade test for migration 20261018_fund_payment_group_origin.sql (REF-240, #355).
//!
//! The database is brought to the migration before this one, filled with groups
//! the way an installed application holds them, then the migration file itself
//! runs over them: a group a `procedure_refund` points to becomes `REFUND`,
//! every other group stays `PAYMENT`, the column's default.

use sqlx::migrate::Migration;
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

const VERSION: i64 = 20261018;

fn migrations() -> Vec<Migration> {
    sqlx::migrate!("./migrations").iter().cloned().collect()
}

/// A pool at the schema just before this migration, foreign keys off: the
/// fixtures hold only the rows the backfill reads.
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

async fn insert_group(pool: &SqlitePool, id: &str, total: i64, status: &str, is_deleted: i64) {
    sqlx::query(
        "INSERT INTO fund_payment_group (id, fund_id, payment_date, total_amount, status, is_deleted)
         VALUES (?, 'fund-1', '2026-10-17', ?, ?, ?)",
    )
    .bind(id)
    .bind(total)
    .bind(status)
    .bind(is_deleted)
    .execute(pool)
    .await
    .expect("insert group");
}

async fn origin_of(pool: &SqlitePool, id: &str) -> String {
    sqlx::query_scalar("SELECT origin FROM fund_payment_group WHERE id = ?")
        .bind(id)
        .fetch_one(pool)
        .await
        .expect("read origin")
}

#[tokio::test]
async fn upgrade_marks_the_groups_a_refund_points_to_and_only_them() {
    let pool = pool_before_the_migration().await;
    insert_group(&pool, "group-payment", 56_000, "ACTIVE", 0).await;
    insert_group(&pool, "group-refund", -56_000, "BANK_PAYED", 0).await;
    // A cancelled refund (REF-210): its record is gone, its group soft-deleted.
    insert_group(&pool, "group-cancelled-refund", -30_000, "BANK_PAYED", 1).await;
    sqlx::query(
        "INSERT INTO procedure_refund (
            id, source_procedure_id, refund_procedure_id, refund_fund_payment_group_id,
            refund_bank_transfer_id, refund_date, previous_payment_status
         ) VALUES ('refund-1', 'proc-1', 'proc-2', 'group-refund', 'transfer-1',
                   '2026-10-17', 'FUND_PAYED')",
    )
    .execute(&pool)
    .await
    .expect("insert refund");

    run_the_migration(&pool).await;

    assert_eq!(origin_of(&pool, "group-refund").await, "REFUND");
    assert_eq!(origin_of(&pool, "group-payment").await, "PAYMENT");
    // Nothing points to it any more; no read path loads a soft-deleted group.
    assert_eq!(origin_of(&pool, "group-cancelled-refund").await, "PAYMENT");
}

#[tokio::test]
async fn origin_refuses_a_value_outside_payment_and_refund() {
    let pool = pool_before_the_migration().await;
    insert_group(&pool, "group-1", 56_000, "ACTIVE", 0).await;
    run_the_migration(&pool).await;

    let result = sqlx::query("UPDATE fund_payment_group SET origin = 'OTHER' WHERE id = 'group-1'")
        .execute(&pool)
        .await;

    assert!(result.is_err(), "the CHECK constraint refuses it");
}

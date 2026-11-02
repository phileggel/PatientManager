//! Upgrade test for migration 20261102_bank_label_real_delete.sql (#583, plan on #579).
//!
//! The database is brought to the migration before this one, filled with labels the
//! way an installed application holds them, then the migration file itself runs.

use sqlx::migrate::Migration;
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

const VERSION: i64 = 20261102;

fn migrations() -> Vec<Migration> {
    sqlx::migrate!("./migrations").iter().cloned().collect()
}

async fn pool_before_the_migration() -> SqlitePool {
    pool_at(VERSION).await
}

async fn pool_at(version: i64) -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect(":memory:")
        .await
        .expect("in-memory SQLite pool");
    sqlx::query("PRAGMA foreign_keys = OFF")
        .execute(&pool)
        .await
        .expect("foreign keys off");
    for migration in migrations().iter().filter(|m| m.version < version) {
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

async fn insert_label_before(
    pool: &SqlitePool,
    id: &str,
    account: &str,
    label: &str,
    deleted: i64,
) {
    sqlx::query(
        "INSERT INTO bank_fund_label_mapping (id, bank_account_id, bank_label, is_deleted)
         VALUES (?, ?, ?, ?)",
    )
    .bind(id)
    .bind(account)
    .bind(label)
    .bind(deleted)
    .execute(pool)
    .await
    .expect("insert label");
}

async fn label_ids(pool: &SqlitePool) -> Vec<String> {
    sqlx::query_scalar("SELECT id FROM bank_fund_label_mapping ORDER BY id")
        .fetch_all(pool)
        .await
        .expect("read labels")
}

/// BAS-046 across the upgrades an installed database goes through: the labels of an
/// account deleted before the rule go, and BAC-060 restoring the account does not
/// bring them back.
#[tokio::test]
async fn test_583_bas_046_old_deleted_accounts_lose_their_labels_for_good() {
    const LABEL_CASCADE: i64 = 20260929;
    let pool = pool_at(LABEL_CASCADE).await;
    for (id, deleted) in [("live", 0), ("restored", 1), ("gone", 1)] {
        sqlx::query("INSERT INTO bank_account (id, name, is_deleted) VALUES (?, ?, ?)")
            .bind(id)
            .bind(id)
            .bind(deleted)
            .execute(&pool)
            .await
            .unwrap();
        insert_label_before(&pool, &format!("label-{id}"), id, "VIR", 0).await;
    }
    sqlx::query(
        "INSERT INTO bank_transfer (id, transfer_date, amount, transfer_type, bank_account_id)
         VALUES ('t-1', '2026-03-10', 120000, 'CHECK', 'restored')",
    )
    .execute(&pool)
    .await
    .expect("insert transfer");

    for migration in migrations().iter().filter(|m| m.version >= LABEL_CASCADE) {
        sqlx::raw_sql(migration.sql.clone())
            .execute(&pool)
            .await
            .unwrap_or_else(|e| panic!("migration {}: {e}", migration.version));
    }

    let restored: i64 =
        sqlx::query_scalar("SELECT is_deleted FROM bank_account WHERE id = 'restored'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(restored, 0, "BAC-060 brought the account back");
    assert_eq!(label_ids(&pool).await, vec!["label-live".to_string()]);
}

#[tokio::test]
async fn test_583_flagged_labels_are_removed_and_live_ones_kept() {
    let pool = pool_before_the_migration().await;
    insert_label_before(&pool, "live", "acc-1", "VIR CPAM", 0).await;
    insert_label_before(&pool, "old", "acc-1", "VIR CPAM", 1).await;

    run_the_migration(&pool).await;

    assert_eq!(label_ids(&pool).await, vec!["live".to_string()]);
}

#[tokio::test]
async fn test_583_the_column_is_gone() {
    let pool = pool_before_the_migration().await;

    run_the_migration(&pool).await;

    let columns: Vec<String> =
        sqlx::query_scalar("SELECT name FROM pragma_table_info('bank_fund_label_mapping')")
            .fetch_all(&pool)
            .await
            .expect("read columns");
    assert!(!columns.contains(&"is_deleted".to_string()), "{columns:?}");
}

#[tokio::test]
async fn test_583_an_account_and_label_are_unique_over_every_row() {
    let pool = pool_before_the_migration().await;
    run_the_migration(&pool).await;
    let insert = "INSERT INTO bank_fund_label_mapping (id, bank_account_id, bank_label)
                  VALUES (?, 'acc-1', 'VIR CPAM')";

    sqlx::query(insert).bind("a").execute(&pool).await.unwrap();
    let second = sqlx::query(insert).bind("b").execute(&pool).await;

    let error = second.expect_err("the second row is refused");
    let database_error = error.as_database_error().expect("a database error");
    assert!(database_error.is_unique_violation(), "{error:?}");
}

#[tokio::test]
async fn test_583_bas_046_deleted_account_labels_are_really_deleted() {
    let pool = pool_before_the_migration().await;
    run_the_migration(&pool).await;
    sqlx::query("INSERT INTO bank_account (id, name, is_deleted) VALUES ('acc-1', 'A', 0)")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO bank_fund_label_mapping (id, bank_account_id, bank_label) VALUES ('l', 'acc-1', 'VIR')")
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query("UPDATE bank_account SET is_deleted = 1 WHERE id = 'acc-1'")
        .execute(&pool)
        .await
        .unwrap();

    assert!(label_ids(&pool).await.is_empty());
}

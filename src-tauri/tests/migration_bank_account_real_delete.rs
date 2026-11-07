//! Upgrade test for migration 20261108_bank_account_real_delete.sql (#584, plan on #579).
//!
//! The database is brought to the migration before this one, filled with accounts the
//! way an installed application holds them, then the migration file itself runs.

use sqlx::migrate::Migration;
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

const VERSION: i64 = 20261108;
const IBAN_TRIGGERS: &str = include_str!("../migrations/20260928_bank_account_iban_unique.sql");

fn migrations() -> Vec<Migration> {
    sqlx::migrate!("./migrations").iter().cloned().collect()
}

async fn pool_before_the_migration() -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect(":memory:")
        .await
        .expect("in-memory SQLite pool");
    for migration in migrations().iter().filter(|m| m.version < VERSION) {
        sqlx::raw_sql(migration.sql.clone())
            .execute(&pool)
            .await
            .unwrap_or_else(|e| panic!("migration {}: {e}", migration.version));
    }
    // A legacy state the IBAN triggers would refuse today: dropped to write it.
    sqlx::raw_sql(
        "DROP TRIGGER trg_bank_account_iban_unique_insert;\
         DROP TRIGGER trg_bank_account_iban_unique_update;",
    )
    .execute(&pool)
    .await
    .expect("triggers dropped");
    pool
}

async fn run_the_migration(pool: &SqlitePool) {
    // The triggers dropped to write the legacy state come back, as installed.
    sqlx::raw_sql(IBAN_TRIGGERS)
        .execute(pool)
        .await
        .expect("triggers back");
    let migration = migrations()
        .into_iter()
        .find(|m| m.version == VERSION)
        .expect("the migration exists");
    sqlx::raw_sql(migration.sql.clone())
        .execute(pool)
        .await
        .expect("the migration runs");
}

async fn account(pool: &SqlitePool, id: &str, name: &str, iban: Option<&str>, deleted: bool) {
    sqlx::query("INSERT INTO bank_account (id, name, iban, is_deleted) VALUES (?, ?, ?, ?)")
        .bind(id)
        .bind(name)
        .bind(iban)
        .bind(deleted)
        .execute(pool)
        .await
        .expect("insert account");
}

async fn entry(pool: &SqlitePool, id: &str, account_id: &str) {
    sqlx::query(
        "INSERT INTO bank_transfer (id, transfer_date, amount, transfer_type, bank_account_id)
         VALUES (?, '2026-03-10', 120000, 'CHECK', ?)",
    )
    .bind(id)
    .bind(account_id)
    .execute(pool)
    .await
    .expect("insert entry");
}

async fn label(pool: &SqlitePool, id: &str, account_id: &str) {
    sqlx::query(
        "INSERT INTO bank_fund_label_mapping (id, bank_account_id, bank_label, fund_id)
         VALUES (?, ?, 'VIR CPAM', NULL)",
    )
    .bind(id)
    .bind(account_id)
    .execute(pool)
    .await
    .expect("insert label");
}

async fn accounts(pool: &SqlitePool) -> Vec<(String, String, Option<String>)> {
    sqlx::query_as(
        "SELECT id, name, iban FROM bank_account WHERE id <> 'cash-account-default' ORDER BY id",
    )
    .fetch_all(pool)
    .await
    .expect("accounts read")
}

#[tokio::test]
async fn test_584_flagged_accounts_go_unless_an_entry_holds_them() {
    let pool = pool_before_the_migration().await;
    account(&pool, "live", "Main", Some("TEST-IBAN-1"), false).await;
    account(&pool, "old", "Old", Some("TEST-IBAN-2"), true).await;
    label(&pool, "label-old", "old").await;
    account(&pool, "held", "Main", Some("TEST-IBAN-1"), true).await;
    entry(&pool, "t-1", "held").await;

    run_the_migration(&pool).await;

    assert_eq!(
        accounts(&pool).await,
        vec![
            ("held".to_string(), "Main (restauré held)".to_string(), None),
            (
                "live".to_string(),
                "Main".to_string(),
                Some("TEST-IBAN-1".to_string())
            ),
        ],
        "the unheld flagged account goes; the held one stays, renamed and without the taken IBAN"
    );
    let labels: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM bank_fund_label_mapping")
        .fetch_one(&pool)
        .await
        .expect("labels counted");
    assert_eq!(labels, 0, "the deleted account's labels go first");
    let violations: Vec<(String,)> = sqlx::query_as("PRAGMA foreign_key_check")
        .fetch_all(&pool)
        .await
        .expect("foreign keys checked");
    assert!(violations.is_empty(), "{violations:?}");
}

#[tokio::test]
async fn test_584_name_and_iban_are_unique_and_a_delete_takes_the_labels() {
    let pool = pool_before_the_migration().await;
    account(&pool, "a", "Main", Some("TEST-IBAN-1"), false).await;
    account(&pool, "b", "Other", None, false).await;
    account(&pool, "c", "Third", None, false).await;
    label(&pool, "label-a", "a").await;
    run_the_migration(&pool).await;

    let columns: Vec<String> =
        sqlx::query_scalar("SELECT name FROM pragma_table_info('bank_account')")
            .fetch_all(&pool)
            .await
            .expect("columns read");
    assert!(!columns.contains(&"is_deleted".to_string()), "{columns:?}");
    for (id, name, iban) in [("d", "Main", None), ("e", "Fourth", Some("TEST-IBAN-1"))] {
        sqlx::query("INSERT INTO bank_account (id, name, iban) VALUES (?, ?, ?)")
            .bind(id)
            .bind(name)
            .bind(iban)
            .execute(&pool)
            .await
            .expect_err("a taken name or IBAN is refused");
    }

    sqlx::query("DELETE FROM bank_account WHERE id = 'a'")
        .execute(&pool)
        .await
        .expect("the account is deleted, its label first");
    let labels: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM bank_fund_label_mapping")
        .fetch_one(&pool)
        .await
        .expect("labels counted");
    assert_eq!(labels, 0);
    sqlx::query("INSERT INTO bank_account (id, name, iban) VALUES ('f', 'Main', 'TEST-IBAN-1')")
        .execute(&pool)
        .await
        .expect("a deleted account's name and IBAN can be used again");
}

// BAC-061, BAC-062 — two kept accounts sharing a name and an IBAN are both renamed
// and both lose the IBAN, so the unique indexes hold.
#[tokio::test]
async fn test_584_two_kept_namesakes_are_both_renamed_and_lose_the_iban() {
    let pool = pool_before_the_migration().await;
    account(&pool, "held-a", "Main", Some("TEST-IBAN-1"), true).await;
    account(&pool, "held-b", "Main", Some("TEST-IBAN-1"), true).await;
    entry(&pool, "t-a", "held-a").await;
    entry(&pool, "t-b", "held-b").await;

    run_the_migration(&pool).await;

    assert_eq!(
        accounts(&pool).await,
        vec![
            (
                "held-a".to_string(),
                "Main (restauré held-a)".to_string(),
                None
            ),
            (
                "held-b".to_string(),
                "Main (restauré held-b)".to_string(),
                None
            ),
        ]
    );
}

// BAC-063 — the deleted accounts go before BAC-061 and BAC-062 look for a clash:
// a kept account sharing its name and IBAN only with one of them keeps both.
#[tokio::test]
async fn test_584_a_kept_account_keeps_what_only_a_removed_one_shared() {
    let pool = pool_before_the_migration().await;
    account(&pool, "gone", "Main", Some("TEST-IBAN-1"), true).await;
    account(&pool, "held", "Main", Some("TEST-IBAN-1"), true).await;
    entry(&pool, "t-1", "held").await;

    run_the_migration(&pool).await;

    assert_eq!(
        accounts(&pool).await,
        vec![(
            "held".to_string(),
            "Main".to_string(),
            Some("TEST-IBAN-1".to_string())
        )]
    );
}

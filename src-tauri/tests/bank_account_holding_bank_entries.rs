//! Ticket #448 — a bank account a bank entry is recorded on is never deleted
//! (BAC-043): the service refuses it, and migration
//! 20261024_bank_account_holding_bank_entries.sql brings back the accounts an
//! installed database soft-deleted while they still held one (BAC-060 to BAC-062). A bank entry
//! is hard-deleted, so every `bank_transfer` row counts.

use std::sync::Arc;

use patient_manager_app::{
    context::bank::{
        BankAccountService, BankEntryRepository, BankEntryService, BankError,
        SqliteBankAccountRepository, SqliteBankEntryRepository,
    },
    shared::event_bus::EventBus,
};
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

const MIGRATION: &str =
    include_str!("../migrations/20261024_bank_account_holding_bank_entries.sql");
const IBAN_TRIGGERS: &str = include_str!("../migrations/20260928_bank_account_iban_unique.sql");
const REAL_DELETE: i64 = 20261108;

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

/// The schema an installed database had while accounts were still flagged: every
/// migration before 20261108 removed the flag (#584).
async fn legacy_pool() -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect(":memory:")
        .await
        .expect("in-memory SQLite pool");
    let migrations = sqlx::migrate!("./migrations");
    for migration in migrations.iter().filter(|m| m.version < REAL_DELETE) {
        sqlx::raw_sql(migration.sql.clone())
            .execute(&pool)
            .await
            .unwrap_or_else(|e| panic!("migration {}: {e}", migration.version));
    }
    pool
}

/// The migrations after 20261108, so today's code reads the upgraded schema.
async fn run_the_later_migrations(pool: &SqlitePool) {
    let migrations = sqlx::migrate!("./migrations");
    for migration in migrations.iter().filter(|m| m.version > REAL_DELETE) {
        sqlx::raw_sql(migration.sql.clone())
            .execute(pool)
            .await
            .unwrap_or_else(|e| panic!("migration {}: {e}", migration.version));
    }
}

fn service(pool: &SqlitePool) -> BankAccountService {
    BankAccountService::new(
        Arc::new(SqliteBankAccountRepository::new(pool.clone())),
        Arc::new(EventBus::new()),
    )
}

async fn insert_account(pool: &SqlitePool, id: &str, name: &str) {
    sqlx::query("INSERT INTO bank_account (id, name) VALUES (?, ?)")
        .bind(id)
        .bind(name)
        .execute(pool)
        .await
        .unwrap();
}

/// A flagged account, on the legacy schema only.
async fn insert_flagged_account(pool: &SqlitePool, id: &str, name: &str) {
    sqlx::query("INSERT INTO bank_account (id, name, is_deleted) VALUES (?, ?, 1)")
        .bind(id)
        .bind(name)
        .execute(pool)
        .await
        .unwrap();
}

async fn rows(pool: &SqlitePool, id: &str) -> i64 {
    sqlx::query_scalar("SELECT COUNT(*) FROM bank_account WHERE id = ?")
        .bind(id)
        .fetch_one(pool)
        .await
        .unwrap()
}

async fn insert_transfer(pool: &SqlitePool, id: &str, account_id: &str) {
    sqlx::query(
        "INSERT INTO bank_transfer (id, transfer_date, amount, transfer_type, bank_account_id)
         VALUES (?, '2026-03-10', 120000, 'CHECK', ?)",
    )
    .bind(id)
    .bind(account_id)
    .execute(pool)
    .await
    .unwrap();
}

async fn account(pool: &SqlitePool, id: &str) -> (String, bool) {
    sqlx::query_as("SELECT name, is_deleted FROM bank_account WHERE id = ?")
        .bind(id)
        .fetch_one(pool)
        .await
        .unwrap()
}

#[tokio::test]
async fn test_delete_account_holding_a_bank_entry_is_refused() {
    let pool = make_pool().await;
    insert_account(&pool, "acc-held", "Held").await;
    insert_transfer(&pool, "t-1", "acc-held").await;

    let err = service(&pool)
        .delete_account("acc-held")
        .await
        .expect_err("an account holding a bank entry must not be deleted");

    assert!(
        matches!(err, BankError::BankAccountHoldsBankEntries),
        "{err:?}"
    );
    assert_eq!(rows(&pool, "acc-held").await, 1);
}

#[tokio::test]
async fn test_584_delete_account_with_no_bank_entry_really_deletes_it() {
    let pool = make_pool().await;
    insert_account(&pool, "acc-free", "Free").await;

    service(&pool).delete_account("acc-free").await.unwrap();

    assert_eq!(rows(&pool, "acc-free").await, 0);
}

#[tokio::test]
async fn test_migration_deleted_account_holding_a_bank_entry_is_restored() {
    let pool = legacy_pool().await;
    insert_flagged_account(&pool, "acc-held", "Held").await;
    insert_transfer(&pool, "t-1", "acc-held").await;
    insert_flagged_account(&pool, "acc-empty", "Empty").await;
    let entries = SqliteBankEntryRepository::new(pool.clone());

    sqlx::raw_sql(MIGRATION).execute(&pool).await.unwrap();

    assert_eq!(account(&pool, "acc-held").await, ("Held".into(), false));
    assert_eq!(account(&pool, "acc-empty").await, ("Empty".into(), true));
    run_the_later_migrations(&pool).await;
    let after = entries.read_transfer("t-1").await.unwrap();
    assert!(
        after.is_some(),
        "the restored account's entry is read again"
    );
}

#[tokio::test]
async fn test_migration_restored_namesakes_with_no_active_one_are_suffixed() {
    let pool = legacy_pool().await;
    insert_flagged_account(&pool, "0123456789-old-a", "Twin").await;
    insert_transfer(&pool, "t-a", "0123456789-old-a").await;
    insert_flagged_account(&pool, "9876543210-old-b", "Twin").await;
    insert_transfer(&pool, "t-b", "9876543210-old-b").await;
    insert_flagged_account(&pool, "acc-alone", "Alone").await;
    insert_transfer(&pool, "t-c", "acc-alone").await;

    sqlx::raw_sql(MIGRATION).execute(&pool).await.unwrap();

    assert_eq!(
        account(&pool, "0123456789-old-a").await,
        ("Twin (restauré 01234567)".into(), false)
    );
    assert_eq!(
        account(&pool, "9876543210-old-b").await,
        ("Twin (restauré 98765432)".into(), false)
    );
    assert_eq!(account(&pool, "acc-alone").await, ("Alone".into(), false));
}

#[tokio::test]
async fn test_migration_restored_account_with_a_taken_name_is_suffixed_once() {
    let pool = legacy_pool().await;
    insert_account(&pool, "acc-new", "Main").await;
    insert_flagged_account(&pool, "0123456789-old-a", "Main").await;
    insert_transfer(&pool, "t-a", "0123456789-old-a").await;

    sqlx::raw_sql(MIGRATION).execute(&pool).await.unwrap();
    sqlx::raw_sql(MIGRATION).execute(&pool).await.unwrap();

    assert_eq!(account(&pool, "acc-new").await, ("Main".into(), false));
    assert_eq!(
        account(&pool, "0123456789-old-a").await,
        ("Main (restauré 01234567)".into(), false)
    );
}

#[tokio::test]
async fn test_migration_restored_account_with_a_taken_iban_comes_back_without_it() {
    let pool = legacy_pool().await;
    // A legacy state, from before BAC-014 spanned deleted accounts: the triggers are
    // dropped to write it, then put back for the migration.
    sqlx::raw_sql(
        "DROP TRIGGER trg_bank_account_iban_unique_insert;\
         DROP TRIGGER trg_bank_account_iban_unique_update;",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::raw_sql(
        "INSERT INTO bank_account (id, name, iban, is_deleted) VALUES
             ('acc-active', 'Active', 'TEST-IBAN-1', 0),
             ('acc-old', 'Old', 'TEST-IBAN-1', 1),
             ('acc-twin-a', 'Twin A', 'TEST-IBAN-2', 1),
             ('acc-twin-b', 'Twin B', 'TEST-IBAN-2', 1),
             ('acc-own', 'Own', 'TEST-IBAN-3', 1),
             ('acc-gone', 'Gone', 'TEST-IBAN-4', 1),
             ('acc-kept', 'Kept', 'TEST-IBAN-4', 1);",
    )
    .execute(&pool)
    .await
    .unwrap();
    for id in ["acc-old", "acc-twin-a", "acc-twin-b", "acc-own", "acc-kept"] {
        insert_transfer(&pool, &format!("t-{id}"), id).await;
    }
    sqlx::raw_sql(IBAN_TRIGGERS).execute(&pool).await.unwrap();

    sqlx::raw_sql(MIGRATION).execute(&pool).await.unwrap();

    for (id, expected) in [
        ("acc-active", Some("TEST-IBAN-1")),
        ("acc-old", None),
        ("acc-twin-a", None),
        ("acc-twin-b", None),
        ("acc-own", Some("TEST-IBAN-3")),
        ("acc-kept", None),
    ] {
        let iban: Option<String> =
            sqlx::query_scalar("SELECT iban FROM bank_account WHERE id = ? AND is_deleted = 0")
                .bind(id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(iban.as_deref(), expected, "{id}");
    }
}

fn entry_service(pool: &SqlitePool) -> BankEntryService {
    BankEntryService::new(
        Arc::new(SqliteBankEntryRepository::new(pool.clone())),
        Arc::new(SqliteBankAccountRepository::new(pool.clone())),
        Arc::new(EventBus::new()),
    )
}

// BAC-060 — a restored account's entries can be edited and deleted again.
#[tokio::test]
async fn test_migration_restored_account_entry_can_be_edited_and_deleted() {
    let pool = legacy_pool().await;
    insert_flagged_account(&pool, "acc-held", "Held").await;
    insert_transfer(&pool, "t-1", "acc-held").await;
    sqlx::raw_sql(MIGRATION).execute(&pool).await.unwrap();
    run_the_later_migrations(&pool).await;
    let entries = entry_service(&pool);

    let mut entry = entries
        .read_transfer("t-1")
        .await
        .unwrap()
        .expect("the restored account's entry");
    entry.amount = 150_000;
    let edited = entries.update_transfer(entry).await.unwrap();
    entries.delete_transfer("t-1").await.unwrap();

    assert_eq!(edited.amount, 150_000);
    let gone = SqliteBankEntryRepository::new(pool.clone())
        .read_transfer("t-1")
        .await
        .unwrap();
    assert!(gone.is_none());
}

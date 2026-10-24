//! Ticket #448 — a bank account a bank entry is recorded on is never deleted
//! (BAC-043): the service refuses it, and migration
//! 20261024_bank_account_holding_bank_entries.sql brings back the accounts an
//! installed database soft-deleted while they still held one (BAC-060 to BAC-062). A bank entry
//! is hard-deleted, so every `bank_transfer` row counts.

use std::sync::Arc;

use patient_manager_app::{
    context::bank::{
        BankAccountService, BankEntryRepository, BankError, SqliteBankAccountRepository,
        SqliteBankEntryRepository,
    },
    shared::event_bus::EventBus,
};
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

const MIGRATION: &str =
    include_str!("../migrations/20261024_bank_account_holding_bank_entries.sql");
const IBAN_TRIGGERS: &str = include_str!("../migrations/20260928_bank_account_iban_unique.sql");

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

fn service(pool: &SqlitePool) -> BankAccountService {
    BankAccountService::new(
        Arc::new(SqliteBankAccountRepository::new(pool.clone())),
        Arc::new(EventBus::new()),
    )
}

async fn insert_account(pool: &SqlitePool, id: &str, name: &str, is_deleted: bool) {
    sqlx::query("INSERT INTO bank_account (id, name, is_deleted) VALUES (?, ?, ?)")
        .bind(id)
        .bind(name)
        .bind(is_deleted)
        .execute(pool)
        .await
        .unwrap();
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
    insert_account(&pool, "acc-held", "Held", false).await;
    insert_transfer(&pool, "t-1", "acc-held").await;

    let err = service(&pool)
        .delete_account("acc-held")
        .await
        .expect_err("an account holding a bank entry must not be deleted");

    assert!(
        matches!(err, BankError::BankAccountHoldsBankEntries),
        "{err:?}"
    );
    assert_eq!(account(&pool, "acc-held").await, ("Held".into(), false));
}

#[tokio::test]
async fn test_delete_account_with_no_bank_entry_soft_deletes_it() {
    let pool = make_pool().await;
    insert_account(&pool, "acc-free", "Free", false).await;

    service(&pool).delete_account("acc-free").await.unwrap();

    assert_eq!(account(&pool, "acc-free").await, ("Free".into(), true));
}

#[tokio::test]
async fn test_migration_deleted_account_holding_a_bank_entry_is_restored() {
    let pool = make_pool().await;
    insert_account(&pool, "acc-held", "Held", true).await;
    insert_transfer(&pool, "t-1", "acc-held").await;
    insert_account(&pool, "acc-empty", "Empty", true).await;
    sqlx::query(
        "INSERT INTO bank_fund_label_mapping (id, bank_account_id, bank_label, is_deleted)
         VALUES ('label-1', 'acc-held', 'TEST LABEL', 1)",
    )
    .execute(&pool)
    .await
    .unwrap();
    let entries = SqliteBankEntryRepository::new(pool.clone());
    assert!(entries.read_transfer("t-1").await.unwrap().is_none());

    sqlx::raw_sql(MIGRATION).execute(&pool).await.unwrap();

    assert_eq!(account(&pool, "acc-held").await, ("Held".into(), false));
    assert_eq!(account(&pool, "acc-empty").await, ("Empty".into(), true));
    assert!(entries.read_transfer("t-1").await.unwrap().is_some());
    let label_deleted: bool =
        sqlx::query_scalar("SELECT is_deleted FROM bank_fund_label_mapping WHERE id = 'label-1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(
        label_deleted,
        "BAS-046: a restored account's labels do not come back"
    );
}

#[tokio::test]
async fn test_migration_restored_namesakes_with_no_active_one_are_suffixed() {
    let pool = make_pool().await;
    insert_account(&pool, "0123456789-old-a", "Twin", true).await;
    insert_transfer(&pool, "t-a", "0123456789-old-a").await;
    insert_account(&pool, "9876543210-old-b", "Twin", true).await;
    insert_transfer(&pool, "t-b", "9876543210-old-b").await;
    insert_account(&pool, "acc-alone", "Alone", true).await;
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
    let pool = make_pool().await;
    insert_account(&pool, "acc-new", "Main", false).await;
    insert_account(&pool, "0123456789-old-a", "Main", true).await;
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
    let pool = make_pool().await;
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

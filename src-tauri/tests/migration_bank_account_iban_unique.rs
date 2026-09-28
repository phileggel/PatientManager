//! TODO-003 — the database refuses a second bank account with an IBAN already
//! used by another account, active or soft-deleted (bank-account R5).
//!
//! The partial index `idx_bank_account_iban_active` only covers active rows; the
//! triggers of migration 20260928_bank_account_iban_unique.sql cover the rest.
//! Triggers, not a full unique index: an installed database may already hold a
//! legacy duplicate among soft-deleted rows, and the migration must not fail on it.

use std::sync::Arc;

use patient_manager_app::{
    context::bank::{BankAccountService, BankError, SqliteBankAccountRepository},
    shared::event_bus::EventBus,
};
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

const MIGRATION: &str = include_str!("../migrations/20260928_bank_account_iban_unique.sql");

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

async fn insert(
    pool: &SqlitePool,
    id: &str,
    iban: Option<&str>,
    is_deleted: bool,
) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO bank_account (id, name, iban, is_deleted) VALUES (?, ?, ?, ?)")
        .bind(id)
        .bind(format!("Account {id}"))
        .bind(iban)
        .bind(is_deleted)
        .execute(pool)
        .await
        .map(|_| ())
}

async fn drop_triggers(pool: &SqlitePool) {
    sqlx::raw_sql(
        "DROP TRIGGER IF EXISTS trg_bank_account_iban_unique_insert;\
         DROP TRIGGER IF EXISTS trg_bank_account_iban_unique_update;",
    )
    .execute(pool)
    .await
    .unwrap();
}

#[tokio::test]
async fn test_todo_003_insert_with_the_iban_of_a_deleted_account_is_refused() {
    let pool = make_pool().await;
    insert(&pool, "a", Some("TEST-IBAN-0"), true).await.unwrap();

    let err = insert(&pool, "b", Some("TEST-IBAN-0"), false)
        .await
        .expect_err("duplicate IBAN must be refused");
    assert!(
        err.to_string().contains("bank_account.iban must be unique"),
        "{err}"
    );
}

#[tokio::test]
async fn test_todo_003_update_to_an_iban_used_by_another_account_is_refused() {
    let pool = make_pool().await;
    insert(&pool, "a", Some("TEST-IBAN-1"), true).await.unwrap();
    insert(&pool, "b", Some("TEST-IBAN-2"), false)
        .await
        .unwrap();

    let err = sqlx::query("UPDATE bank_account SET iban = ? WHERE id = 'b'")
        .bind("TEST-IBAN-1")
        .execute(&pool)
        .await
        .expect_err("duplicate IBAN must be refused");
    assert!(
        err.to_string().contains("bank_account.iban must be unique"),
        "{err}"
    );
}

#[tokio::test]
async fn test_todo_003_accounts_without_iban_do_not_collide() {
    let pool = make_pool().await;
    insert(&pool, "a", None, false).await.unwrap();
    insert(&pool, "b", None, true).await.unwrap();
    insert(&pool, "c", None, false).await.unwrap();
}

#[tokio::test]
async fn test_todo_003_legacy_duplicates_survive_the_migration_and_can_still_be_renamed() {
    let pool = make_pool().await;
    // A database written before R5 may hold the same IBAN on two soft-deleted rows.
    drop_triggers(&pool).await;
    insert(&pool, "old-1", Some("TEST-IBAN-3"), true)
        .await
        .unwrap();
    insert(&pool, "old-2", Some("TEST-IBAN-3"), true)
        .await
        .unwrap();

    sqlx::raw_sql(MIGRATION)
        .execute(&pool)
        .await
        .expect("migration applies over legacy duplicates");

    // Editing the name (the service rewrites the unchanged IBAN too) still works.
    sqlx::query("UPDATE bank_account SET name = 'Renamed', iban = ? WHERE id = 'old-2'")
        .bind("TEST-IBAN-3")
        .execute(&pool)
        .await
        .expect("an unchanged IBAN is not a new duplicate");
    // A third account with that IBAN is refused.
    insert(&pool, "new", Some("TEST-IBAN-3"), false)
        .await
        .expect_err("duplicate IBAN must be refused");
}

#[tokio::test]
async fn test_todo_003_the_app_still_reports_a_duplicate_iban_as_already_used() {
    let pool = make_pool().await;
    let service = BankAccountService::new(
        Arc::new(SqliteBankAccountRepository::new(pool.clone())),
        Arc::new(EventBus::new()),
    );
    let first = service
        .create_account("First".to_string(), Some("TEST-IBAN-9".to_string()))
        .await
        .unwrap();
    service.delete_account(&first.id).await.unwrap();

    let err = service
        .create_account("Second".to_string(), Some("TEST-IBAN-9".to_string()))
        .await
        .expect_err("duplicate IBAN must be refused");
    assert!(matches!(err, BankError::IbanAlreadyUsed), "{err:?}");
}

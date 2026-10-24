//! Ticket #503 — two accounts that are not deleted never share a name
//! (BAC-013): a create or an edit to a taken name is refused with its own
//! error and saves nothing, while a deleted account's name can be used again;
//! an unknown or deleted account is not edited (BAC-030).

use std::sync::Arc;

use patient_manager_app::{
    context::bank::{BankAccountService, BankError, SqliteBankAccountRepository},
    shared::event_bus::EventBus,
};
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

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

async fn names(pool: &SqlitePool) -> Vec<String> {
    service(pool)
        .read_all_accounts()
        .await
        .expect("the accounts are read")
        .into_iter()
        .map(|a| a.name)
        .collect()
}

#[tokio::test]
async fn test_create_account_with_a_taken_name_is_refused() {
    let pool = make_pool().await;
    let service = service(&pool);
    service
        .create_account("Main".into(), None)
        .await
        .expect("the first account is created");

    let err = service
        .create_account("Main".into(), None)
        .await
        .expect_err("a taken name must be refused");

    assert!(
        matches!(err, BankError::BankAccountNameAlreadyUsed),
        "{err:?}"
    );
    assert_eq!(
        names(&pool).await.iter().filter(|n| *n == "Main").count(),
        1
    );
}

#[tokio::test]
async fn test_update_account_to_a_taken_name_is_refused() {
    let pool = make_pool().await;
    let service = service(&pool);
    service
        .create_account("Main".into(), None)
        .await
        .expect("the first account is created");
    let other = service
        .create_account("Other".into(), None)
        .await
        .expect("the second account is created");

    let err = service
        .update_account(other.id.clone(), "Main".into(), None)
        .await
        .expect_err("a taken name must be refused");

    assert!(
        matches!(err, BankError::BankAccountNameAlreadyUsed),
        "{err:?}"
    );
    let kept = service
        .read_account(&other.id)
        .await
        .expect("the account is kept");
    assert_eq!(kept.name, "Other");
}

#[tokio::test]
async fn test_create_account_with_surrounding_spaces_on_a_taken_name_is_refused() {
    let pool = make_pool().await;
    let service = service(&pool);
    service
        .create_account("Main".into(), None)
        .await
        .expect("the first account is created");

    let err = service
        .create_account(" Main ".into(), None)
        .await
        .expect_err("the spaces around a taken name are dropped before the comparison");

    assert!(
        matches!(err, BankError::BankAccountNameAlreadyUsed),
        "{err:?}"
    );
}

#[tokio::test]
async fn test_create_account_with_a_name_differing_in_case_succeeds() {
    let pool = make_pool().await;
    let service = service(&pool);
    service
        .create_account("Main".into(), None)
        .await
        .expect("the first account is created");

    service
        .create_account("main".into(), None)
        .await
        .expect("names are compared with their case");

    let names = names(&pool).await;
    assert!(names.contains(&"Main".to_string()) && names.contains(&"main".to_string()));
}

#[tokio::test]
async fn test_create_account_with_a_deleted_account_name_succeeds() {
    let pool = make_pool().await;
    let service = service(&pool);
    let deleted = service
        .create_account("Main".into(), None)
        .await
        .expect("the first account is created");
    service
        .delete_account(&deleted.id)
        .await
        .expect("the account is deleted");

    service
        .create_account("Main".into(), None)
        .await
        .expect("a deleted account's name can be used again");

    assert!(names(&pool).await.contains(&"Main".to_string()));
}

#[tokio::test]
async fn test_update_account_unknown_or_deleted_is_refused() {
    let pool = make_pool().await;
    let service = service(&pool);
    let deleted = service
        .create_account("Closed".into(), None)
        .await
        .expect("the account is created");
    service
        .delete_account(&deleted.id)
        .await
        .expect("the account is deleted");

    for id in [deleted.id.clone(), "missing".to_string()] {
        let err = service
            .update_account(id, "Renamed".into(), None)
            .await
            .expect_err("only an account that is not deleted is edited");
        assert!(
            matches!(err, BankError::BankAccountNotFound { .. }),
            "{err:?}"
        );
    }
    assert!(!names(&pool).await.contains(&"Renamed".to_string()));
}

#[tokio::test]
async fn test_create_account_with_the_cash_account_stored_name_is_refused() {
    let pool = make_pool().await;
    let (stored,): (String,) = sqlx::query_as("SELECT name FROM bank_account WHERE id = ?")
        .bind(patient_manager_app::context::bank::CASH_ACCOUNT_ID)
        .fetch_one(&pool)
        .await
        .expect("the cash account is seeded");

    let err = service(&pool)
        .create_account(stored, None)
        .await
        .expect_err("the cash account's stored name is taken");

    assert!(
        matches!(err, BankError::BankAccountNameAlreadyUsed),
        "{err:?}"
    );
}

//! Upgrade test for migration 20261113_bank_account_type.sql (#518).

use sqlx::migrate::Migration;
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

const VERSION: i64 = 20261113;

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

async fn seed(pool: &SqlitePool, statements: &[&'static str]) {
    for statement in statements {
        sqlx::query(*statement).execute(pool).await.expect("seed");
    }
}

async fn ids(pool: &SqlitePool, query: &'static str) -> Vec<String> {
    sqlx::query_scalar(query)
        .fetch_all(pool)
        .await
        .expect("read ids")
}

/// BAC-057, BAC-058 — the user's accounts become `bank`; a refund stays on its account; the cash account and the new check
/// and card accounts are technical; each direct payment moves to its type's account.
#[tokio::test]
async fn test_518_accounts_get_a_type_and_direct_payments_their_account() {
    let pool = pool_before_the_migration().await;
    seed(
        &pool,
        &[
            "INSERT INTO bank_account (id, name) VALUES ('mine', 'Ma banque')",
            "INSERT INTO bank_account (id, name) VALUES ('named-cash', 'cash')",
            "INSERT INTO bank_transfer (id, transfer_date, amount, transfer_type, bank_account_id) VALUES ('wire', '2026-01-20', 100, 'FUND', 'mine')",
            "INSERT INTO bank_transfer (id, transfer_date, amount, transfer_type, bank_account_id) VALUES ('chq', '2026-01-20', 100, 'CHECK', 'mine')",
            "INSERT INTO bank_transfer (id, transfer_date, amount, transfer_type, bank_account_id) VALUES ('cb', '2026-01-20', 100, 'CREDIT_CARD', 'mine')",
            "INSERT INTO bank_transfer (id, transfer_date, amount, transfer_type, bank_account_id) VALUES ('cash', '2026-01-20', 100, 'CASH', 'mine')",
            "INSERT INTO bank_transfer (id, transfer_date, amount, transfer_type, bank_account_id) VALUES ('refund', '2026-01-21', -100, 'CHECK', 'mine')",
            "INSERT INTO bank_transfer (id, transfer_date, amount, transfer_type, bank_account_id) VALUES ('kept', '2026-01-21', 100, 'CASH', 'cash-account-default')",
        ],
    )
    .await;

    run_the_migration(&pool).await;

    assert_eq!(
        ids(
            &pool,
            "SELECT id || ':' || account_type || ':' || name FROM bank_account ORDER BY id"
        )
        .await,
        [
            "card-account-default:card:card",
            "cash-account-default:cash:cash",
            "check-account-default:check:check",
            "mine:bank:Ma banque",
            "named-cash:bank:cash",
        ]
        .map(String::from)
    );
    assert_eq!(
        ids(
            &pool,
            "SELECT id || ':' || bank_account_id FROM bank_transfer ORDER BY id"
        )
        .await,
        [
            "cash:cash-account-default",
            "cb:card-account-default",
            "chq:check-account-default",
            "kept:cash-account-default",
            "refund:mine",
            "wire:mine",
        ]
        .map(String::from)
    );
    // The code reads the moved entries back as their type, on their technical account.
    use patient_manager_app::context::bank::{
        BankEntryRepository, BankEntryType, SqliteBankEntryRepository,
    };
    let check = SqliteBankEntryRepository::new(pool.clone())
        .read_transfer("chq")
        .await
        .expect("read the check")
        .expect("the check");
    assert_eq!(check.transfer_type, BankEntryType::PatientCheck);
    assert_eq!(check.bank_account.id, "check-account-default");
    assert!(!check.bank_account.is_bank());
}

/// BAC-013 — the partial index still refuses a name another `bank` account holds.
#[tokio::test]
async fn test_518_two_bank_accounts_still_cannot_share_a_name() {
    let pool = pool_before_the_migration().await;
    run_the_migration(&pool).await;

    seed(
        &pool,
        &["INSERT INTO bank_account (id, name) VALUES ('mine', 'cash')"],
    )
    .await;
    let refused = sqlx::query("INSERT INTO bank_account (id, name) VALUES ('again', 'cash')")
        .execute(&pool)
        .await;

    assert!(
        refused.is_err(),
        "two user accounts still cannot share a name"
    );
}

/// BAC-064 — a fund wire or a refund on the cash account refuses the upgrade; nothing changes.
#[tokio::test]
async fn test_518_an_entry_left_on_the_cash_account_refuses_the_upgrade() {
    for blocking in [
        "INSERT INTO bank_transfer (id, transfer_date, amount, transfer_type, bank_account_id) VALUES ('wire', '2026-01-20', 100, 'FUND', 'cash-account-default')",
        "INSERT INTO bank_transfer (id, transfer_date, amount, transfer_type, bank_account_id) VALUES ('refund', '2026-01-20', -100, 'CHECK', 'cash-account-default')",
    ] {
        let pool = pool_before_the_migration().await;
        seed(&pool, &[blocking]).await;
        let migration = migrations()
            .into_iter()
            .find(|m| m.version == VERSION)
            .expect("the migration exists");
        let mut tx = pool.begin().await.expect("a transaction");

        let result = sqlx::raw_sql(migration.sql.clone()).execute(&mut *tx).await;
        tx.rollback().await.expect("rolled back");

        let error = result.expect_err("the upgrade is refused").to_string();
        assert!(
            error.contains("a_fund_wire_or_refund_is_on_the_cash_account"),
            "{error}"
        );
        assert!(ids(&pool, "SELECT id FROM bank_account WHERE id = 'check-account-default'")
            .await
            .is_empty());
        assert_eq!(
            ids(&pool, "SELECT bank_account_id FROM bank_transfer").await,
            ["cash-account-default".to_string()]
        );
    }
}

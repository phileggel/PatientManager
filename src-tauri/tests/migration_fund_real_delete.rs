//! Upgrade test for migration 20261111_fund_real_delete.sql (#590).

use sqlx::migrate::Migration;
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

const VERSION: i64 = 20261111;

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

/// PRO-294, PRO-295 — a flagged fund nothing uses goes and the patients' defaults
/// naming it are cleared (PRO-290); its labels stay (BAS-041D); one a procedure or a
/// payment group uses comes back as stored, suffixed only when its identifier clashes.
#[tokio::test]
async fn test_590_flagged_funds_go_unless_used() {
    let pool = pool_before_the_migration().await;
    seed(
        &pool,
        &[
            "INSERT INTO fund (id, fund_identifier, name, is_deleted) VALUES ('live', '75', 'Live', 0)",
            "INSERT INTO fund (id, fund_identifier, name, is_deleted) VALUES ('old', '93', 'Old', 1)",
            "INSERT INTO fund (id, fund_identifier, name, is_deleted) VALUES ('old-proc', '94', 'Old proc', 1)",
            "INSERT INTO fund (id, fund_identifier, name, is_deleted) VALUES ('old-group', '75', 'Old group', 1)",
            "INSERT INTO procedure (id, patient_id, fund_id, procedure_type_id, procedure_date, billed_amount, payment_status) VALUES ('p', 'pat', 'old-proc', 'import-pdf', '2026-01-20', 100, 'CREATED')",
            "INSERT INTO fund_payment_group (id, fund_id, payment_date, total_amount) VALUES ('g', 'old-group', '2026-01-20', 100)",
            "INSERT INTO bank_fund_label_mapping (id, bank_account_id, bank_label, fund_id) VALUES ('l-old', 'acc', 'OLD', 'old')",
            "INSERT INTO bank_fund_label_mapping (id, bank_account_id, bank_label, fund_id) VALUES ('l-live', 'acc', 'LIVE', 'live')",
            "INSERT INTO patient (id, name, is_anonymous, is_deleted, latest_procedure_type, latest_fund, latest_date) VALUES ('on-old', 'A', 0, 0, 'import-pdf', 'old', '2026-01-20')",
        ],
    )
    .await;

    run_the_migration(&pool).await;

    let funds: Vec<(String, String, String)> =
        sqlx::query_as("SELECT id, fund_identifier, name FROM fund ORDER BY id")
            .fetch_all(&pool)
            .await
            .expect("read funds");
    assert_eq!(
        funds,
        [
            ("live", "75", "Live"),
            ("old-group", "75 (restauré old-grou)", "Old group"),
            ("old-proc", "94", "Old proc"),
        ]
        .map(|(id, identifier, name)| (
            id.to_string(),
            identifier.to_string(),
            name.to_string()
        ))
    );
    assert_eq!(
        ids(&pool, "SELECT id FROM bank_fund_label_mapping ORDER BY id").await,
        ["l-live", "l-old"].map(String::from)
    );
    let on_old: (Option<String>, Option<String>) = sqlx::query_as(
        "SELECT latest_procedure_type, latest_fund FROM patient WHERE id = 'on-old'",
    )
    .fetch_one(&pool)
    .await
    .expect("read the patient");
    assert_eq!(on_old, (Some("import-pdf".to_string()), None));
}

/// The labels keep no foreign key to the fund (owner, 2026-11-08), keep the one to the
/// account, and an account's deletion still takes its labels (BAS-046).
#[tokio::test]
async fn test_590_labels_lose_their_fund_foreign_key() {
    let pool = pool_before_the_migration().await;

    run_the_migration(&pool).await;

    let parents = ids(
        &pool,
        "SELECT \"table\" FROM pragma_foreign_key_list('bank_fund_label_mapping')",
    )
    .await;
    assert_eq!(parents, ["bank_account"].map(String::from));
    let indexes = ids(
        &pool,
        "SELECT name FROM pragma_index_list('bank_fund_label_mapping')",
    )
    .await;
    assert!(
        indexes.contains(&"idx_bank_fund_label".to_string()),
        "{indexes:?}"
    );
    seed(
        &pool,
        &[
            "INSERT INTO bank_account (id, name) VALUES ('acc', 'Account')",
            "INSERT INTO bank_fund_label_mapping (id, bank_account_id, bank_label, fund_id) VALUES ('l', 'acc', 'CPAM', NULL)",
            "DELETE FROM bank_account WHERE id = 'acc'",
        ],
    )
    .await;
    assert!(ids(&pool, "SELECT id FROM bank_fund_label_mapping")
        .await
        .is_empty());
}

#[tokio::test]
async fn test_590_the_column_goes_and_the_identifier_is_unique() {
    let pool = pool_before_the_migration().await;

    run_the_migration(&pool).await;

    let columns = ids(&pool, "SELECT name FROM pragma_table_info('fund')").await;
    assert!(!columns.contains(&"is_deleted".to_string()), "{columns:?}");
    let indexes = ids(&pool, "SELECT name FROM pragma_index_list('fund')").await;
    assert!(
        indexes.contains(&"idx_fund_identifier".to_string()),
        "{indexes:?}"
    );
    assert!(
        !indexes.contains(&"idx_fund_identifier_active".to_string()),
        "{indexes:?}"
    );
    let partial: i64 = sqlx::query_scalar(
        "SELECT partial FROM pragma_index_list('fund') WHERE name = 'idx_fund_identifier'",
    )
    .fetch_one(&pool)
    .await
    .expect("read the index");
    assert_eq!(partial, 0);
}

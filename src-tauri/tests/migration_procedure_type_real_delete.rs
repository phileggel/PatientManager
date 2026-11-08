//! Upgrade test for migration 20261110_procedure_type_real_delete.sql (#589).

use sqlx::migrate::Migration;
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

const VERSION: i64 = 20261110;

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

/// R25, R26 — a flagged type no procedure uses goes, with its Excel mappings, and the
/// patients' defaults naming it are cleared (PRO-280: the fund stays); one a procedure
/// uses comes back as it was stored, as does the reserved type (R22).
#[tokio::test]
async fn test_589_r25_flagged_types_go_unless_a_procedure_uses_them() {
    let pool = pool_before_the_migration().await;
    seed(
        &pool,
        &[
            "INSERT INTO procedure_type (id, name, default_amount, category, is_deleted) VALUES ('live', 'Live', 100, NULL, 0)",
            "INSERT INTO procedure_type (id, name, default_amount, category, is_deleted) VALUES ('old', 'Old', 100, NULL, 1)",
            "INSERT INTO procedure_type (id, name, default_amount, category, is_deleted) VALUES ('old-used', 'Old used', 250, 'cat', 1)",
            "INSERT INTO procedure (id, patient_id, procedure_type_id, procedure_date, billed_amount, payment_status) VALUES ('p', 'pat', 'old-used', '2026-01-20', 100, 'CREATED')",
            "INSERT INTO excel_amount_type_mapping (id, amount, procedure_type_id) VALUES ('m-old', 100, 'old')",
            "INSERT INTO excel_amount_type_mapping (id, amount, procedure_type_id) VALUES ('m-used', 250, 'old-used')",
            "INSERT INTO patient (id, name, is_anonymous, is_deleted, latest_procedure_type, latest_fund, latest_date) VALUES ('on-old', 'A', 0, 0, 'old', 'fund', '2026-01-20')",
            "UPDATE procedure_type SET is_deleted = 1 WHERE id = 'import-pdf'",
            "INSERT INTO patient (id, name, is_anonymous, is_deleted, latest_procedure_type, latest_date) VALUES ('on-used', 'B', 0, 0, 'old-used', '2026-01-20')",
        ],
    )
    .await;

    run_the_migration(&pool).await;

    assert_eq!(
        ids(&pool, "SELECT id FROM procedure_type ORDER BY id").await,
        ["import-pdf", "live", "old-used"].map(String::from)
    );
    let kept: (String, i64, Option<String>) = sqlx::query_as(
        "SELECT name, default_amount, category FROM procedure_type WHERE id = 'old-used'",
    )
    .fetch_one(&pool)
    .await
    .expect("read the kept type");
    assert_eq!(kept, ("Old used".to_string(), 250, Some("cat".to_string())));
    assert_eq!(
        ids(
            &pool,
            "SELECT id FROM excel_amount_type_mapping ORDER BY id"
        )
        .await,
        ["m-used"].map(String::from)
    );
    assert_eq!(
        ids(
            &pool,
            "SELECT id FROM patient WHERE latest_procedure_type IS NOT NULL ORDER BY id"
        )
        .await,
        ["on-used"].map(String::from)
    );
    let on_old: (Option<String>, Option<String>, Option<String>) = sqlx::query_as(
        "SELECT latest_procedure_type, latest_fund, latest_date FROM patient WHERE id = 'on-old'",
    )
    .fetch_one(&pool)
    .await
    .expect("read the patient");
    assert_eq!(on_old, (None, Some("fund".to_string()), None));
}

#[tokio::test]
async fn test_589_the_column_and_its_index_are_gone() {
    let pool = pool_before_the_migration().await;

    run_the_migration(&pool).await;

    let columns = ids(
        &pool,
        "SELECT name FROM pragma_table_info('procedure_type')",
    )
    .await;
    assert!(!columns.contains(&"is_deleted".to_string()), "{columns:?}");
    let indexes = ids(
        &pool,
        "SELECT name FROM pragma_index_list('procedure_type')",
    )
    .await;
    assert!(
        !indexes.contains(&"idx_procedure_type_deleted".to_string()),
        "{indexes:?}"
    );
}

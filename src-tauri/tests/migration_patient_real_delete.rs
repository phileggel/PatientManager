//! Upgrade test for migration 20261112_patient_real_delete.sql (#591).

use sqlx::migrate::Migration;
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

const VERSION: i64 = 20261112;

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

/// PRO-299 — a flagged patient no procedure names goes, with its duplicate
/// dismissals; one a procedure names comes back as stored.
#[tokio::test]
async fn test_591_flagged_patients_go_unless_a_procedure_names_them() {
    let pool = pool_before_the_migration().await;
    seed(
        &pool,
        &[
            "INSERT INTO patient (id, name, is_anonymous, is_deleted) VALUES ('live', 'Live', 0, 0)",
            "INSERT INTO patient (id, name, ssn, is_anonymous, is_deleted) VALUES ('old', 'Old', '1000000000000', 0, 1)",
            "INSERT INTO patient (id, name, is_anonymous, is_deleted) VALUES ('old-proc', 'Old proc', 0, 1)",
            "INSERT INTO procedure (id, patient_id, procedure_type_id, procedure_date, billed_amount, payment_status) VALUES ('p', 'old-proc', 'import-pdf', '2026-01-20', 100, 'CREATED')",
            "INSERT INTO patient (id, name, is_anonymous, is_deleted) VALUES ('zz-live', 'Other', 0, 0)",
            "INSERT INTO patient_duplicate_dismissal (id, patient_a_id, patient_b_id) VALUES ('d-old', 'live', 'old')",
            "INSERT INTO patient_duplicate_dismissal (id, patient_a_id, patient_b_id) VALUES ('d-old-a', 'old', 'zz-live')",
            "INSERT INTO patient_duplicate_dismissal (id, patient_a_id, patient_b_id) VALUES ('d-kept', 'live', 'old-proc')",
        ],
    )
    .await;

    run_the_migration(&pool).await;

    assert_eq!(
        ids(&pool, "SELECT id FROM patient ORDER BY id").await,
        ["live", "old-proc", "zz-live"].map(String::from)
    );
    assert_eq!(
        ids(
            &pool,
            "SELECT id FROM patient_duplicate_dismissal ORDER BY id"
        )
        .await,
        ["d-kept"].map(String::from)
    );
    let kept: (Option<String>,) = sqlx::query_as("SELECT name FROM patient WHERE id = 'old-proc'")
        .fetch_one(&pool)
        .await
        .expect("read the kept patient");
    assert_eq!(kept.0.as_deref(), Some("Old proc"));
    let dangling: Vec<String> = ids(&pool, "SELECT \"table\" FROM pragma_foreign_key_check").await;
    assert!(dangling.is_empty(), "{dangling:?}");
}

#[tokio::test]
async fn test_591_the_column_and_its_index_go() {
    let pool = pool_before_the_migration().await;

    run_the_migration(&pool).await;

    let columns = ids(&pool, "SELECT name FROM pragma_table_info('patient')").await;
    assert!(!columns.contains(&"is_deleted".to_string()), "{columns:?}");
    let indexes = ids(&pool, "SELECT name FROM pragma_index_list('patient')").await;
    assert!(
        !indexes.contains(&"idx_patient_deleted".to_string()),
        "{indexes:?}"
    );
}

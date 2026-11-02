//! Upgrade test for migration 20261103_fund_payment_line_real_delete.sql (#585).

use sqlx::migrate::Migration;
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

const VERSION: i64 = 20261103;

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

/// Both lines point at the same live procedure, so the flagged one is a line still
/// referencing something: it goes, and the procedure and the live line stay.
#[tokio::test]
async fn test_585_flagged_lines_go_and_live_ones_stay() {
    let pool = pool_before_the_migration().await;
    for statement in [
        r#"INSERT INTO "procedure" (id, patient_id, procedure_type_id, procedure_date, billed_amount, payment_status, is_deleted) VALUES ('p', 'x', 'x', '2026-01-10', 100, 'CREATED', 0)"#,
        "INSERT INTO fund_payment_line (id, fund_payment_group_id, procedure_id, is_deleted) VALUES ('live', 'g', 'p', 0)",
        "INSERT INTO fund_payment_line (id, fund_payment_group_id, procedure_id, is_deleted) VALUES ('old', 'g', 'p', 1)",
    ] {
        sqlx::query(statement).execute(&pool).await.expect("seed");
    }

    run_the_migration(&pool).await;

    let lines: Vec<String> = sqlx::query_scalar("SELECT id FROM fund_payment_line")
        .fetch_all(&pool)
        .await
        .expect("read lines");
    assert_eq!(lines, vec!["live".to_string()]);
    let procedures: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM "procedure""#)
        .fetch_one(&pool)
        .await
        .expect("read procedures");
    assert_eq!(procedures, 1);
}

#[tokio::test]
async fn test_585_the_column_and_its_index_are_gone() {
    let pool = pool_before_the_migration().await;

    run_the_migration(&pool).await;

    let columns: Vec<String> =
        sqlx::query_scalar("SELECT name FROM pragma_table_info('fund_payment_line')")
            .fetch_all(&pool)
            .await
            .expect("read columns");
    assert!(!columns.contains(&"is_deleted".to_string()), "{columns:?}");
    let indexes: Vec<String> =
        sqlx::query_scalar("SELECT name FROM pragma_index_list('fund_payment_line')")
            .fetch_all(&pool)
            .await
            .expect("read indexes");
    assert!(
        !indexes.contains(&"idx_fund_payment_line_deleted".to_string()),
        "{indexes:?}"
    );
}

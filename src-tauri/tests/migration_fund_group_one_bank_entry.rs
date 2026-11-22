//! Upgrade test for migration 20261114_fund_group_one_bank_entry.sql (#640, BSM-038, BSM-038A).

use sqlx::migrate::Migration;
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

const VERSION: i64 = 20261114;

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

async fn run_the_migration(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let migration = migrations()
        .into_iter()
        .find(|m| m.version == VERSION)
        .expect("the migration exists");
    sqlx::raw_sql(migration.sql.clone())
        .execute(pool)
        .await
        .map(|_| ())
}

async fn link(pool: &SqlitePool, id: &str, entry: &str, group: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO bank_transfer_fund_group_link (id, bank_transfer_id, fund_payment_group_id)
         VALUES (?, ?, ?)",
    )
    .bind(id)
    .bind(entry)
    .bind(group)
    .execute(pool)
    .await
    .map(|_| ())
}

/// BSM-038 — after the upgrade the database refuses a second link to a group, and
/// still takes several groups on one bank entry.
#[tokio::test]
async fn test_640_bsm_038_a_group_takes_one_bank_entry_after_the_upgrade() {
    let pool = pool_before_the_migration().await;
    link(&pool, "link-1", "entry-1", "group-1")
        .await
        .expect("seed");

    run_the_migration(&pool)
        .await
        .expect("no double link: it runs");

    link(&pool, "link-2", "entry-1", "group-2")
        .await
        .expect("another group on the same entry");
    let err = link(&pool, "link-3", "entry-2", "group-1")
        .await
        .expect_err("a second entry for group-1");
    assert!(
        err.to_string().contains("UNIQUE constraint failed"),
        "{err}"
    );
}

/// #640 — the migration alone still stops on a group linked twice, its error names
/// the group, and the links stay as they were. Start-up repairs it first (BSM-038A,
/// #732), so this is the net under that repair.
#[tokio::test]
async fn test_640_bsm_038a_a_group_linked_twice_stops_the_upgrade_and_is_named() {
    let pool = pool_before_the_migration().await;
    link(&pool, "link-1", "entry-1", "group-twice")
        .await
        .expect("seed");
    link(&pool, "link-2", "entry-2", "group-twice")
        .await
        .expect("seed");

    let err = run_the_migration(&pool)
        .await
        .expect_err("the upgrade stops");

    assert!(
        err.to_string()
            .contains("fund payment group linked to two bank entries: group-twice"),
        "{err}"
    );
    let links: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM bank_transfer_fund_group_link")
        .fetch_one(&pool)
        .await
        .expect("count");
    assert_eq!(links, 2);
}

/// A data folder holding a database as migration 20261114 found it on #725's machine:
/// the migration not applied, one group settled by two bank entries.
async fn database_stopped_by_two_bank_entries(dir: &std::path::Path) {
    use patient_manager_app::shared::Database;
    use sqlx::sqlite::SqliteConnectOptions;

    let db = Database::new(dir.to_path_buf(), false)
        .await
        .expect("a new database");
    let path = db.get_path().clone();
    db.get_pool().close().await;

    // Back to before the migration, with one group settled by two bank entries.
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            SqliteConnectOptions::new()
                .filename(&path)
                .foreign_keys(false),
        )
        .await
        .expect("the database file");
    for sql in [
        "DELETE FROM _sqlx_migrations WHERE version = 20261114",
        "DROP INDEX idx_bt_fund_group_group",
        "INSERT INTO bank_transfer (id, transfer_date, amount, transfer_type, bank_account_id)
         VALUES ('entry-old', '2026-02-03', 10000, 'FUND', 'account-1'),
                ('entry-new', '2026-02-09', 10000, 'FUND', 'account-1')",
    ] {
        sqlx::query(sql).execute(&pool).await.expect(sql);
    }
    link(&pool, "link-1", "entry-old", "group-1")
        .await
        .expect("seed");
    link(&pool, "link-2", "entry-new", "group-1")
        .await
        .expect("seed");
    pool.close().await;
}

/// #732 — the start-up of a database that migration 20261114 stopped: the bank
/// context's repair runs after the backup, the migration then applies, and both
/// bank entries are still there.
#[tokio::test]
async fn test_732_a_database_stopped_by_two_bank_entries_starts_again() {
    use patient_manager_app::context::bank::unlink_group_double_links;
    use patient_manager_app::shared::Database;

    let dir = tempfile::tempdir().expect("temp dir");
    database_stopped_by_two_bank_entries(dir.path()).await;

    let db = Database::new_with_steps(
        dir.path().to_path_buf(),
        false,
        &[unlink_group_double_links],
    )
    .await
    .expect("the application starts");

    let settling: Vec<String> = sqlx::query_scalar(
        "SELECT bank_transfer_id FROM bank_transfer_fund_group_link
         WHERE fund_payment_group_id = 'group-1'",
    )
    .fetch_all(db.get_pool())
    .await
    .expect("links");
    assert_eq!(settling, vec!["entry-new"]);
    let entries: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM bank_transfer")
        .fetch_one(db.get_pool())
        .await
        .expect("count");
    assert_eq!(entries, 2, "no bank entry is deleted");
    let applied: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM _sqlx_migrations WHERE version = 20261114 AND success = 1",
    )
    .fetch_one(db.get_pool())
    .await
    .expect("migrations");
    assert_eq!(applied, 1);
    let backups = std::fs::read_dir(dir.path())
        .expect("data dir")
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_name()
                .to_string_lossy()
                .starts_with("patient_manager.backup-pre-v")
        })
        .count();
    assert_eq!(backups, 1, "the backup is taken before the repair");
}

/// DGR-041 — without the repair, the start stops on migration 20261114 and says so:
/// the stage, the migration, its first cause, and that the backup was taken.
#[tokio::test]
async fn test_dgr_041_a_migration_that_stops_names_itself_and_the_backup() {
    use patient_manager_app::shared::{Database, DatabaseStartStage};

    let dir = tempfile::tempdir().expect("temp dir");
    database_stopped_by_two_bank_entries(dir.path()).await;

    let err = match Database::new_with_steps(dir.path().to_path_buf(), false, &[]).await {
        Ok(_) => panic!("the migration stops"),
        Err(err) => err,
    };

    assert_eq!(err.stage, DatabaseStartStage::Migration);
    assert_eq!(err.migration_version, Some(VERSION));
    assert_eq!(
        err.migration_description.as_deref(),
        Some("fund group one bank entry")
    );
    assert!(err.backup_taken);

    // DGR-040A — the migrations before stay applied, the failing one leaves nothing.
    let path = dir.path().join("patient_manager.db");
    let pool = SqlitePoolOptions::new()
        .connect_with(sqlx::sqlite::SqliteConnectOptions::new().filename(&path))
        .await
        .expect("the database file");
    let failing: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM _sqlx_migrations WHERE version = ?")
            .bind(VERSION)
            .fetch_one(&pool)
            .await
            .expect("count");
    assert_eq!(failing, 0, "no trace of the failing migration");
    let before: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM _sqlx_migrations WHERE version < ? AND success = 1",
    )
    .bind(VERSION)
    .fetch_one(&pool)
    .await
    .expect("count");
    assert!(before > 0, "the migrations before stay applied");
    let index: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE name = 'idx_bt_fund_group_group'",
    )
    .fetch_one(&pool)
    .await
    .expect("count");
    assert_eq!(index, 0, "the failing migration's index is not there");
    assert!(
        err.first_cause()
            .contains("fund payment group linked to two bank entries"),
        "{}",
        err.first_cause()
    );
}

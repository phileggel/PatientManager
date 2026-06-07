use anyhow::{Context, Result};
use sha2::{Digest, Sha384};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use sqlx::{ConnectOptions, Connection};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use crate::BACKEND;

const DATABASE_FILENAME: &str = "patient_manager.db";

/// Resolve the pending-import file path that corresponds to a live database
/// path. The pending file is staged in `db_path`'s parent (NOT in
/// `app_data_dir`), so a `PATIENT_MANAGER_E2E_DB` redirect that moves the
/// database also moves the pending lookup — keeping the import staging path
/// (`db_backup::orchestrator::do_import`) and the startup lookup in sync.
fn pending_path_for(db_path: &Path) -> PathBuf {
    db_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join(format!("{DATABASE_FILENAME}.pending"))
}

/// Database manager for patient operations
pub struct Database {
    pool: SqlitePool,
    db_path: PathBuf,
}

impl Database {
    pub async fn new(app_data_dir: PathBuf, is_db_reset: bool) -> Result<Self> {
        // E2E test suite sets this env var to redirect to an isolated ephemeral database,
        // keeping test data fully separated from the developer's real app data.
        let db_path = if let Ok(e2e_path) = std::env::var("PATIENT_MANAGER_E2E_DB") {
            PathBuf::from(e2e_path)
        } else {
            app_data_dir.join(DATABASE_FILENAME)
        };

        // Apply pending import if one was staged by import_database (R10/R11).
        let pending_path = pending_path_for(&db_path);
        if pending_path.exists() {
            tracing::info!(
                target: BACKEND,
                "Pending database import found — replacing active database before opening"
            );
            fs::rename(&pending_path, &db_path)
                .with_context(|| "Failed to apply pending database import")?;
            tracing::info!(target: BACKEND, "Pending database import applied successfully");
        }

        if is_db_reset {
            tracing::warn!("RESET_DATABASE is set - deleting existing database");
            if db_path.exists() {
                fs::remove_file(&db_path).with_context(|| "Failed to delete database")?;
                tracing::info!("Database deleted successfully");
            } else {
                tracing::info!("Database does not exist, skipping delete");
            }
        }

        tracing::trace!(target: BACKEND, "Connecting to database");

        let connect_options = SqliteConnectOptions::new()
            .filename(&db_path)
            .create_if_missing(true)
            .foreign_keys(true)
            .disable_statement_logging();

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(connect_options)
            .await?;

        tracing::trace!("Database connection pool created");

        let db = Database {
            pool,
            db_path: db_path.clone(),
        };

        // Snapshot the current database before mutating it, so a failed
        // migration or heal can be rolled back by restoring the backup file.
        // Skipped on fresh installs and when no migrations are pending.
        backup_db_if_migrations_pending(&db.pool, &db.db_path)
            .await
            .with_context(|| "Failed to back up database before migration")?;

        // Heal CRLF→LF migration checksum drift from binaries built with
        // git core.autocrlf=true (e.g. v0.14.0 built on Windows). Must run
        // before sqlx::migrate! to prevent VersionMismatch panic at startup.
        heal_crlf_checksum_drift(&db.pool)
            .await
            .with_context(|| "Failed to heal migration checksums")?;

        // Apply database migrations on a dedicated connection with foreign-key
        // enforcement DISABLED (gh#67).
        //
        // SQLite cannot rebuild a *parent* table (e.g. `procedure`, referenced
        // by `fund_payment_line`) while foreign keys are enforced: the standard
        // rebuild recipe (CREATE new → copy → DROP old → RENAME) must run with
        // `PRAGMA foreign_keys = OFF`. `defer_foreign_keys = ON` is NOT a
        // substitute — `DROP TABLE` on the parent increments the deferred
        // violation counter once per child row and recreating the table never
        // clears it, so COMMIT fails (code 787) even when the data is fully
        // consistent (`20260524` crashed every DB that had any reconciled
        // payment). `PRAGMA foreign_keys` is a no-op inside sqlx's per-migration
        // transaction, so enforcement must be off on the *connection* before
        // migrate runs — hence a dedicated connection rather than the
        // FK-enforcing runtime pool.
        //
        // IMPORTANT: When creating a new migration:
        // 1. Create the migration file in src-tauri/migrations/ (format: YYYYMMDD_description.sql)
        // 2. Run `cd src-tauri && sqlx database setup` to apply migrations to dev database
        // 3. This ensures SQLx compile-time verification works correctly
        tracing::info!(target: BACKEND, "Running database migrations");
        let mut migrate_conn = SqliteConnectOptions::new()
            .filename(&db_path)
            .foreign_keys(false)
            .disable_statement_logging()
            .connect()
            .await
            .with_context(|| "Failed to open migration connection")?;
        sqlx::migrate!("./migrations")
            .run(&mut migrate_conn)
            .await
            .with_context(|| "sqlx::migrate! failed")?;

        // Enforcement was off during migration, so verify referential
        // integrity afterward. Real dangling rows (e.g. from an imported
        // database) are surfaced here rather than silently trusted — non-fatal,
        // so a dirty import never blocks startup.
        let violations: Vec<(String, Option<i64>, String, i64)> =
            sqlx::query_as("PRAGMA foreign_key_check")
                .fetch_all(&mut migrate_conn)
                .await
                .unwrap_or_default();
        if !violations.is_empty() {
            tracing::error!(
                target: BACKEND,
                violation_rows = violations.len(),
                "Post-migration foreign-key violations detected — database has dangling references"
            );
        }
        migrate_conn
            .close()
            .await
            .with_context(|| "Failed to close migration connection")?;
        tracing::info!(target: BACKEND, "Database migrations applied");

        Ok(db)
    }

    pub fn get_pool(&self) -> &SqlitePool {
        &self.pool
    }

    pub fn get_path(&self) -> &PathBuf {
        &self.db_path
    }
}

/// Snapshot the database file as a sibling backup before any migration step
/// mutates it, so the user can roll back to the prior version simply by
/// restoring the file. The backup is skipped when:
///   - the migration tracking table is missing (fresh install — nothing to lose)
///   - no migrations are pending (binary is up-to-date with the on-disk schema)
///
/// Backups accumulate in the same directory as the live DB with the format
/// `patient_manager.backup-pre-v{NEW_VERSION}-{YYYYMMDD-HHMMSS}.db`. Old
/// backups are intentionally not auto-pruned — the user owns retention.
///
/// Uses SQLite's `VACUUM INTO` for an atomic, transactionally consistent
/// snapshot that doesn't depend on journal mode (WAL/DELETE/etc.).
async fn backup_db_if_migrations_pending(pool: &SqlitePool, db_path: &Path) -> Result<()> {
    let table_exists: Option<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_sqlx_migrations'",
    )
    .fetch_optional(pool)
    .await?;
    if table_exists.is_none() {
        return Ok(());
    }

    let applied: Vec<i64> =
        sqlx::query_scalar("SELECT version FROM _sqlx_migrations WHERE success = 1")
            .fetch_all(pool)
            .await?;
    let applied: HashSet<i64> = applied.into_iter().collect();
    let migrator = sqlx::migrate!("./migrations");
    let pending: Vec<i64> = migrator
        .iter()
        .map(|m| m.version)
        .filter(|v| !applied.contains(v))
        .collect();
    if pending.is_empty() {
        return Ok(());
    }

    let target_version = env!("CARGO_PKG_VERSION");
    let timestamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let backup_path = db_path.with_file_name(format!(
        "patient_manager.backup-pre-v{target_version}-{timestamp}.db"
    ));

    tracing::info!(
        target: BACKEND,
        pending_migrations = ?pending,
        backup_path = %backup_path.display(),
        "Backing up database before applying migrations"
    );

    let escaped = backup_path.to_string_lossy().replace('\'', "''");
    sqlx::query(&format!("VACUUM INTO '{escaped}'"))
        .execute(pool)
        .await
        .with_context(|| {
            format!(
                "VACUUM INTO failed for backup path {}",
                backup_path.display()
            )
        })?;

    tracing::info!(
        target: BACKEND,
        backup_path = %backup_path.display(),
        "Database backup complete"
    );
    Ok(())
}

/// Heal CRLF→LF migration checksum drift introduced by binaries built with
/// `core.autocrlf=true` (e.g. v0.14.0 on Windows). SQLx hashes raw migration
/// file bytes, so a CRLF build embeds different checksums than a later LF
/// build, and `sqlx::migrate!` aborts with VersionMismatch on upgrade.
///
/// For each compiled-in migration whose stored checksum equals the SHA-384
/// of the same SQL with CRLF endings, rewrite the stored checksum to the LF
/// value. Other mismatches are left untouched so `sqlx::migrate!` can surface
/// a real error.
async fn heal_crlf_checksum_drift(pool: &SqlitePool) -> Result<()> {
    let table_exists: Option<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_sqlx_migrations'",
    )
    .fetch_optional(pool)
    .await?;
    if table_exists.is_none() {
        return Ok(());
    }

    let migrator = sqlx::migrate!("./migrations");
    for m in migrator.iter() {
        let version = m.version;
        let lf_checksum: &[u8] = &m.checksum;

        let stored: Option<(Vec<u8>, i64)> =
            sqlx::query_as("SELECT checksum, success FROM _sqlx_migrations WHERE version = ?")
                .bind(version)
                .fetch_optional(pool)
                .await?;
        let Some((stored_checksum, success)) = stored else {
            continue;
        };
        if stored_checksum == lf_checksum || success == 0 {
            continue;
        }

        let crlf_sql: String = m.sql.replace("\r\n", "\n").replace('\n', "\r\n");
        let crlf_checksum = Sha384::digest(crlf_sql.as_bytes()).to_vec();
        if stored_checksum == crlf_checksum {
            tracing::warn!(
                target: BACKEND,
                version,
                description = %m.description,
                "Healing CRLF→LF migration checksum drift (legacy autocrlf build)"
            );
            sqlx::query("UPDATE _sqlx_migrations SET checksum = ? WHERE version = ?")
                .bind(lf_checksum)
                .bind(version)
                .execute(pool)
                .await?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn fresh_pool() -> SqlitePool {
        SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap()
    }

    async fn seed_migrations_table(pool: &SqlitePool) {
        sqlx::query(
            r#"CREATE TABLE _sqlx_migrations (
                version INTEGER PRIMARY KEY,
                description TEXT NOT NULL,
                installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                success BOOLEAN NOT NULL,
                checksum BLOB NOT NULL,
                execution_time BIGINT NOT NULL
            )"#,
        )
        .execute(pool)
        .await
        .unwrap();
    }

    fn crlf_checksum(sql: &str) -> Vec<u8> {
        let crlf = sql.replace("\r\n", "\n").replace('\n', "\r\n");
        Sha384::digest(crlf.as_bytes()).to_vec()
    }

    #[tokio::test]
    async fn heal_rewrites_crlf_to_lf() {
        let pool = fresh_pool().await;
        seed_migrations_table(&pool).await;
        let migrator = sqlx::migrate!("./migrations");
        for m in migrator.iter() {
            sqlx::query(
                "INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time) VALUES (?, ?, 1, ?, 0)",
            )
            .bind(m.version)
            .bind(&*m.description)
            .bind(crlf_checksum(&m.sql))
            .execute(&pool)
            .await
            .unwrap();
        }

        heal_crlf_checksum_drift(&pool).await.unwrap();

        for m in migrator.iter() {
            let stored: Vec<u8> =
                sqlx::query_scalar("SELECT checksum FROM _sqlx_migrations WHERE version = ?")
                    .bind(m.version)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(stored, &m.checksum[..], "version {}", m.version);
        }
    }

    #[tokio::test]
    async fn heal_is_noop_when_checksums_already_lf() {
        let pool = fresh_pool().await;
        seed_migrations_table(&pool).await;
        let migrator = sqlx::migrate!("./migrations");
        for m in migrator.iter() {
            sqlx::query(
                "INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time) VALUES (?, ?, 1, ?, 0)",
            )
            .bind(m.version)
            .bind(&*m.description)
            .bind(&m.checksum[..])
            .execute(&pool)
            .await
            .unwrap();
        }

        heal_crlf_checksum_drift(&pool).await.unwrap();

        for m in migrator.iter() {
            let stored: Vec<u8> =
                sqlx::query_scalar("SELECT checksum FROM _sqlx_migrations WHERE version = ?")
                    .bind(m.version)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(stored, &m.checksum[..]);
        }
    }

    #[tokio::test]
    async fn heal_leaves_unrelated_drift_alone() {
        let pool = fresh_pool().await;
        seed_migrations_table(&pool).await;
        let migrator = sqlx::migrate!("./migrations");
        let m = migrator.iter().next().unwrap();
        let bogus = vec![0xAAu8; 48];
        sqlx::query(
            "INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time) VALUES (?, ?, 1, ?, 0)",
        )
        .bind(m.version)
        .bind(&*m.description)
        .bind(&bogus)
        .execute(&pool)
        .await
        .unwrap();

        heal_crlf_checksum_drift(&pool).await.unwrap();

        let stored: Vec<u8> =
            sqlx::query_scalar("SELECT checksum FROM _sqlx_migrations WHERE version = ?")
                .bind(m.version)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(stored, bogus);
    }

    #[tokio::test]
    async fn heal_skips_when_table_missing() {
        let pool = fresh_pool().await;
        heal_crlf_checksum_drift(&pool).await.unwrap();
    }

    async fn pool_at(path: &Path) -> SqlitePool {
        let opts = SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true);
        SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(opts)
            .await
            .unwrap()
    }

    fn count_backups(dir: &Path) -> usize {
        std::fs::read_dir(dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.file_name()
                    .to_string_lossy()
                    .starts_with("patient_manager.backup-pre-v")
            })
            .count()
    }

    #[tokio::test]
    async fn backup_skipped_when_no_tracking_table() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("patient_manager.db");
        let pool = pool_at(&db_path).await;
        backup_db_if_migrations_pending(&pool, &db_path)
            .await
            .unwrap();
        assert_eq!(count_backups(dir.path()), 0);
    }

    #[tokio::test]
    async fn backup_skipped_when_no_pending_migrations() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("patient_manager.db");
        let pool = pool_at(&db_path).await;
        seed_migrations_table(&pool).await;
        let migrator = sqlx::migrate!("./migrations");
        for m in migrator.iter() {
            sqlx::query(
                "INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time) VALUES (?, ?, 1, ?, 0)",
            )
            .bind(m.version)
            .bind(&*m.description)
            .bind(&m.checksum[..])
            .execute(&pool)
            .await
            .unwrap();
        }
        backup_db_if_migrations_pending(&pool, &db_path)
            .await
            .unwrap();
        assert_eq!(count_backups(dir.path()), 0);
    }

    /// Regression: in production mode (no env var) the pending-path lookup
    /// must resolve under `app_data_dir`, identical to pre-fix behavior.
    #[test]
    fn pending_path_resolves_under_db_parent_in_production_mode() {
        let app_data = PathBuf::from("/var/lib/PatientManager");
        let db_path = app_data.join(DATABASE_FILENAME);

        assert_eq!(
            pending_path_for(&db_path),
            PathBuf::from("/var/lib/PatientManager/patient_manager.db.pending"),
        );
    }

    /// Regression: in E2E mode (`PATIENT_MANAGER_E2E_DB` set) the pending-path
    /// lookup follows the redirected DB location — must match what
    /// `db_backup::orchestrator::do_import` writes via
    /// `self.db.get_path().parent().join("patient_manager.db.pending")`.
    #[test]
    fn pending_path_follows_db_redirect_in_e2e_mode() {
        let e2e_db = PathBuf::from("/tmp/release-smoke.db");

        assert_eq!(
            pending_path_for(&e2e_db),
            PathBuf::from("/tmp/patient_manager.db.pending"),
        );
    }

    /// Edge: `db_path` without a parent (root-level) falls back to `.`,
    /// preserving the function's total-function shape (never panics).
    #[test]
    fn pending_path_falls_back_to_cwd_when_db_has_no_parent() {
        let db_path = PathBuf::from("patient_manager.db");

        assert_eq!(
            pending_path_for(&db_path),
            PathBuf::from("patient_manager.db.pending"),
        );
    }

    #[tokio::test]
    async fn backup_created_when_migrations_pending() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("patient_manager.db");
        let pool = pool_at(&db_path).await;
        seed_migrations_table(&pool).await;
        // Mark only the first migration as applied; the rest are pending.
        let migrator = sqlx::migrate!("./migrations");
        let first = migrator.iter().next().unwrap();
        sqlx::query(
            "INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time) VALUES (?, ?, 1, ?, 0)",
        )
        .bind(first.version)
        .bind(&*first.description)
        .bind(&first.checksum[..])
        .execute(&pool)
        .await
        .unwrap();

        backup_db_if_migrations_pending(&pool, &db_path)
            .await
            .unwrap();
        assert_eq!(count_backups(dir.path()), 1);
    }

    // ─── gh#67: parent-table rebuild must run with foreign_keys OFF ─────────

    /// Single in-memory connection with FK enforcement on/off, mirroring how
    /// the app opens its migration connection (`foreign_keys = false`) vs its
    /// runtime pool (`true`).
    async fn mem_conn(fk: bool) -> sqlx::SqliteConnection {
        SqliteConnectOptions::new()
            .in_memory(true)
            .foreign_keys(fk)
            .connect()
            .await
            .unwrap()
    }

    /// Apply the real migrations up to and including 20260523 — the schema
    /// state a DB is in right before the failing rebuild.
    async fn migrate_to_523(conn: &mut sqlx::SqliteConnection) {
        for m in sqlx::migrate!("./migrations").iter() {
            if m.version > 20260523 {
                break;
            }
            sqlx::raw_sql(&m.sql).execute(&mut *conn).await.unwrap();
        }
    }

    /// Seed a `procedure` parent with a `fund_payment_line` child — the row
    /// shape (a reconciled payment) that trips the deferred-FK counter on DROP.
    async fn seed_parent_with_child(conn: &mut sqlx::SqliteConnection) {
        sqlx::raw_sql(
            "INSERT INTO fund (id, fund_identifier, name) VALUES ('F1','f1','Fund 1');\
             INSERT INTO patient (id, is_anonymous) VALUES ('P1',0);\
             INSERT INTO procedure (id, patient_id, fund_id, procedure_type_id, procedure_date) \
                 VALUES ('PR1','P1','F1','import-pdf','2026-01-01');\
             INSERT INTO fund_payment_group (id, fund_id, payment_date, total_amount) \
                 VALUES ('G1','F1','2026-01-05',1000);\
             INSERT INTO fund_payment_line (id, fund_payment_group_id, procedure_id) \
                 VALUES ('L1','G1','PR1');",
        )
        .execute(&mut *conn)
        .await
        .unwrap();
    }

    /// Run the real 20260524 migration inside one transaction (as sqlx does),
    /// honoring the connection's foreign_keys setting. The migration file's own
    /// `PRAGMA defer_foreign_keys = ON` is included verbatim.
    async fn run_migration_524(conn: &mut sqlx::SqliteConnection) -> Result<(), sqlx::Error> {
        let migrator = sqlx::migrate!("./migrations");
        let m = migrator
            .iter()
            .find(|m| m.version == 20260524)
            .expect("20260524 present");
        let clean: String = m
            .sql
            .lines()
            .filter(|l| !l.trim_start().starts_with("--"))
            .collect::<Vec<_>>()
            .join("\n");
        sqlx::query("BEGIN").execute(&mut *conn).await?;
        for stmt in clean.split(';') {
            let s = stmt.trim();
            if !s.is_empty() {
                sqlx::query(s).execute(&mut *conn).await?;
            }
        }
        sqlx::query("COMMIT").execute(&mut *conn).await?;
        Ok(())
    }

    /// The fix: with FK enforcement OFF, the parent-table rebuild commits even
    /// when a child row references it, and the data stays consistent.
    #[tokio::test]
    async fn parent_rebuild_succeeds_with_fk_off() {
        let mut conn = mem_conn(false).await;
        migrate_to_523(&mut conn).await;
        seed_parent_with_child(&mut conn).await;

        run_migration_524(&mut conn)
            .await
            .expect("rebuild must commit with foreign_keys off");

        let viol: Vec<(String, Option<i64>, String, i64)> =
            sqlx::query_as("PRAGMA foreign_key_check")
                .fetch_all(&mut conn)
                .await
                .unwrap();
        assert!(viol.is_empty(), "data consistent after rebuild: {viol:?}");
    }

    /// The bug (gh#67): with FK enforcement ON, dropping the parent `procedure`
    /// while a child row exists trips the deferred-violation counter and COMMIT
    /// fails — even though the data is perfectly consistent.
    #[tokio::test]
    async fn parent_rebuild_under_enforced_fk_fails_with_child() {
        let mut conn = mem_conn(true).await;
        migrate_to_523(&mut conn).await;
        seed_parent_with_child(&mut conn).await;

        let result = run_migration_524(&mut conn).await;
        assert!(
            result.is_err(),
            "FK-enforced rebuild of a parent that has children must fail (the gh#67 crash)"
        );
    }

    /// Why CI never caught it: with no child row, even the FK-enforced rebuild
    /// commits — the failure requires a `fund_payment_line` referencing the
    /// table, which clean test/fresh databases never have.
    #[tokio::test]
    async fn parent_rebuild_under_enforced_fk_succeeds_without_children() {
        let mut conn = mem_conn(true).await;
        migrate_to_523(&mut conn).await;
        sqlx::raw_sql(
            "INSERT INTO patient (id, is_anonymous) VALUES ('P1',0);\
             INSERT INTO procedure (id, patient_id, procedure_type_id, procedure_date) \
                 VALUES ('PR1','P1','import-pdf','2026-01-01');",
        )
        .execute(&mut conn)
        .await
        .unwrap();

        run_migration_524(&mut conn)
            .await
            .expect("no child row → even FK-enforced rebuild commits");
    }
}

use anyhow::{Context, Result};
use sha2::{Digest, Sha384};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use sqlx::ConnectOptions;
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

        // Repair pre-existing `procedure` foreign-key orphans before the
        // 20260524 table rebuild re-validates them (gh#67). Must run before
        // sqlx::migrate! — 20260524 rebuilds `procedure` under
        // `defer_foreign_keys=ON`, whose commit-time check aborts the whole
        // migration on any dangling fund/patient/type reference left by
        // legacy data. Self-deactivates once 20260524 is applied.
        repair_procedure_fk_orphans(&db.pool)
            .await
            .with_context(|| "Failed to repair procedure foreign-key orphans")?;

        // Apply database migrations from ./migrations directory
        //
        // IMPORTANT: When creating a new migration:
        // 1. Create the migration file in src-tauri/migrations/ (format: YYYYMMDD_description.sql)
        // 2. Run `cd src-tauri && sqlx database setup` to apply migrations to dev database
        // 3. This ensures SQLx compile-time verification works correctly
        //
        // The dev database is located at: src-tauri/patient_manager.db
        // Set DATABASE_URL="sqlite:patient_manager.db" when running cargo commands
        tracing::info!(target: BACKEND, "Running database migrations");
        sqlx::migrate!("./migrations")
            .run(&db.pool)
            .await
            .with_context(|| "sqlx::migrate! failed")?;
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

/// Reserved, always-seeded procedure type (20260308_init.sql) used as the
/// repoint target for `procedure` rows whose type no longer exists.
const RESERVED_IMPORT_TYPE_ID: &str = "import-pdf";
/// On-demand placeholder patient for `procedure` rows whose patient no longer
/// exists. Created only when such an orphan is found, so the procedure survives
/// for manual reassignment instead of being deleted.
const ORPHAN_RECOVERY_PATIENT_ID: &str = "__orphan_recovery__";

/// Recover `procedure` rows that reference a fund / patient / procedure_type
/// that no longer exists, so the `20260524` NOT-NULL rebuild does not abort the
/// whole migration. (gh#67)
///
/// `20260524` rebuilds `procedure` under `PRAGMA defer_foreign_keys = ON`,
/// whose commit-time check re-validates every foreign key in the rebuilt table
/// — the first global FK validation this database has ever had. A single
/// dangling reference left by legacy data aborts the migration and crashes the
/// app on startup. Such orphans cannot be produced by the current app (every
/// delete is a soft delete, so parent rows never disappear); they are artifacts
/// of older builds that did not enforce foreign keys, or of an imported DB.
///
/// The repair is **non-destructive** — no `procedure` row is ever deleted:
///   - `fund_id` (nullable)           → set NULL
///   - `procedure_type_id` (NOT NULL) → repoint to the reserved seeded type
///   - `patient_id` (NOT NULL)        → repoint to a recovery placeholder patient
///
/// Skipped on a fresh install (no `procedure` table yet) and once `20260524`
/// has applied (the rebuild has run, so no orphan can remain). Every repair
/// statement is itself FK-safe, so it runs cleanly on the foreign-key-enforcing
/// pool.
async fn repair_procedure_fk_orphans(pool: &SqlitePool) -> Result<()> {
    // Fresh install — schema not created yet, nothing to repair.
    let procedure_exists: Option<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'procedure'",
    )
    .fetch_optional(pool)
    .await?;
    if procedure_exists.is_none() {
        return Ok(());
    }

    // Self-deactivate once the rebuild has applied: its commit-time FK check
    // passed, so no orphan can remain.
    let rebuild_applied: Option<i64> = sqlx::query_scalar(
        "SELECT 1 FROM _sqlx_migrations WHERE version = 20260524 AND success = 1",
    )
    .fetch_optional(pool)
    .await
    .unwrap_or(None);
    if rebuild_applied.is_some() {
        return Ok(());
    }

    // Diagnostics: surface exactly which rows dangle before repairing. Columns:
    // (table, rowid, parent, fkid). No-op fast path when the table is clean.
    let violations: Vec<(String, Option<i64>, String, i64)> =
        sqlx::query_as("PRAGMA foreign_key_check(procedure)")
            .fetch_all(pool)
            .await
            .unwrap_or_default();
    if violations.is_empty() {
        return Ok(());
    }
    tracing::warn!(
        target: BACKEND,
        orphan_rows = violations.len(),
        "Found procedure foreign-key orphans predating the 20260524 rebuild; repairing (gh#67)"
    );

    // fund_id is nullable — drop the dangling link.
    let funds_nulled = sqlx::query(
        "UPDATE procedure SET fund_id = NULL \
         WHERE fund_id IS NOT NULL AND fund_id NOT IN (SELECT id FROM fund)",
    )
    .execute(pool)
    .await?
    .rows_affected();

    // procedure_type_id is NOT NULL — repoint to the reserved seeded type.
    let types_repointed = sqlx::query(
        "UPDATE procedure SET procedure_type_id = ?1 \
         WHERE procedure_type_id NOT IN (SELECT id FROM procedure_type)",
    )
    .bind(RESERVED_IMPORT_TYPE_ID)
    .execute(pool)
    .await?
    .rows_affected();

    // patient_id is NOT NULL — repoint to a recovery placeholder (created only
    // when needed) so the procedure survives for manual reassignment.
    let patients_orphaned: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM procedure WHERE patient_id NOT IN (SELECT id FROM patient)",
    )
    .fetch_one(pool)
    .await?;
    if patients_orphaned > 0 {
        sqlx::query(
            "INSERT OR IGNORE INTO patient (id, is_anonymous, name, is_deleted) \
             VALUES (?1, 0, ?2, 0)",
        )
        .bind(ORPHAN_RECOVERY_PATIENT_ID)
        .bind("\u{26a0} Procédure orpheline — patient à réattribuer")
        .execute(pool)
        .await?;
        sqlx::query(
            "UPDATE procedure SET patient_id = ?1 \
             WHERE patient_id NOT IN (SELECT id FROM patient)",
        )
        .bind(ORPHAN_RECOVERY_PATIENT_ID)
        .execute(pool)
        .await?;
    }

    tracing::warn!(
        target: BACKEND,
        fund_id_nulled = funds_nulled,
        type_repointed = types_repointed,
        patient_repointed = patients_orphaned,
        "Repaired procedure foreign-key orphans (gh#67)"
    );

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

    // ─── repair_procedure_fk_orphans (gh#67) ──────────────────────────────

    /// In-memory pool with FK enforcement OFF so tests can plant the orphan
    /// rows that real legacy databases carry but the schema would otherwise
    /// reject. `foreign_key_check` works regardless of the enforcement pragma,
    /// so assertions stay faithful.
    async fn fk_off_pool() -> SqlitePool {
        let opts = SqliteConnectOptions::new()
            .in_memory(true)
            .foreign_keys(false);
        SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(opts)
            .await
            .unwrap()
    }

    /// Apply the real migrations up to and including 20260523 — i.e. the exact
    /// schema state a DB is left in when 20260524 fails (the gh#67 scenario).
    async fn migrate_to_523(pool: &SqlitePool) {
        let migrator = sqlx::migrate!("./migrations");
        for m in migrator.iter() {
            if m.version > 20260523 {
                break;
            }
            sqlx::raw_sql(&m.sql).execute(pool).await.unwrap();
        }
    }

    async fn fk_orphan_count(pool: &SqlitePool) -> usize {
        let rows: Vec<(String, Option<i64>, String, i64)> =
            sqlx::query_as("PRAGMA foreign_key_check(procedure)")
                .fetch_all(pool)
                .await
                .unwrap();
        rows.len()
    }

    #[tokio::test]
    async fn repair_fixes_all_three_orphan_kinds() {
        let pool = fk_off_pool().await;
        migrate_to_523(&pool).await;

        // Valid parents (import-pdf type is seeded by 20260308_init).
        sqlx::raw_sql(
            "INSERT INTO fund (id, fund_identifier, name) VALUES ('F1', 'f1', 'Fund 1');\
             INSERT INTO patient (id, is_anonymous) VALUES ('P1', 0);\
             INSERT INTO procedure (id, patient_id, fund_id, procedure_type_id, procedure_date) \
                 VALUES ('proc-fund', 'P1', 'ghost-fund', 'import-pdf', '2026-01-01');\
             INSERT INTO procedure (id, patient_id, fund_id, procedure_type_id, procedure_date) \
                 VALUES ('proc-type', 'P1', NULL, 'ghost-type', '2026-01-01');\
             INSERT INTO procedure (id, patient_id, fund_id, procedure_type_id, procedure_date) \
                 VALUES ('proc-pat', 'ghost-patient', NULL, 'import-pdf', '2026-01-01');",
        )
        .execute(&pool)
        .await
        .unwrap();

        assert_eq!(fk_orphan_count(&pool).await, 3, "three orphans planted");

        repair_procedure_fk_orphans(&pool).await.unwrap();

        // No procedure FK dangles → the 20260524 rebuild's commit check passes.
        assert_eq!(fk_orphan_count(&pool).await, 0, "all orphans repaired");

        let fund_id: Option<String> =
            sqlx::query_scalar("SELECT fund_id FROM procedure WHERE id = 'proc-fund'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(fund_id, None, "dangling fund_id nulled");

        let type_id: String =
            sqlx::query_scalar("SELECT procedure_type_id FROM procedure WHERE id = 'proc-type'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(type_id, "import-pdf", "dangling type repointed to reserved");

        let patient_id: String =
            sqlx::query_scalar("SELECT patient_id FROM procedure WHERE id = 'proc-pat'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(
            patient_id, "__orphan_recovery__",
            "dangling patient repointed"
        );
        let placeholder_exists: Option<String> =
            sqlx::query_scalar("SELECT id FROM patient WHERE id = '__orphan_recovery__'")
                .fetch_optional(&pool)
                .await
                .unwrap();
        assert!(placeholder_exists.is_some(), "recovery patient created");
    }

    #[tokio::test]
    async fn repair_is_noop_when_no_orphans() {
        let pool = fk_off_pool().await;
        migrate_to_523(&pool).await;
        sqlx::raw_sql(
            "INSERT INTO patient (id, is_anonymous) VALUES ('P1', 0);\
             INSERT INTO procedure (id, patient_id, fund_id, procedure_type_id, procedure_date) \
                 VALUES ('proc-ok', 'P1', NULL, 'import-pdf', '2026-01-01');",
        )
        .execute(&pool)
        .await
        .unwrap();

        repair_procedure_fk_orphans(&pool).await.unwrap();

        // No recovery placeholder is fabricated when nothing is wrong.
        let placeholder: Option<String> =
            sqlx::query_scalar("SELECT id FROM patient WHERE id = '__orphan_recovery__'")
                .fetch_optional(&pool)
                .await
                .unwrap();
        assert!(placeholder.is_none(), "no placeholder when clean");
    }

    #[tokio::test]
    async fn repair_skips_when_rebuild_already_applied() {
        let pool = fk_off_pool().await;
        migrate_to_523(&pool).await;
        seed_migrations_table(&pool).await;
        sqlx::query(
            "INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time) \
             VALUES (20260524, 'billed amount not null', 1, X'00', 0)",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::raw_sql(
            "INSERT INTO patient (id, is_anonymous) VALUES ('P1', 0);\
             INSERT INTO procedure (id, patient_id, fund_id, procedure_type_id, procedure_date) \
                 VALUES ('proc-orphan', 'P1', 'ghost-fund', 'import-pdf', '2026-01-01');",
        )
        .execute(&pool)
        .await
        .unwrap();

        repair_procedure_fk_orphans(&pool).await.unwrap();

        // Gate fired: the orphan is left untouched (no work once 524 applied).
        let fund_id: Option<String> =
            sqlx::query_scalar("SELECT fund_id FROM procedure WHERE id = 'proc-orphan'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(
            fund_id,
            Some("ghost-fund".to_string()),
            "skipped when applied"
        );
    }

    #[tokio::test]
    async fn repair_skips_when_procedure_table_absent() {
        let pool = fk_off_pool().await;
        // No migrations run — `procedure` table does not exist (fresh install).
        repair_procedure_fk_orphans(&pool).await.unwrap();
    }
}

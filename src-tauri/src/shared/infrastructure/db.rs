use anyhow::{Context, Result};
use sha2::{Digest, Sha384};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use sqlx::{AssertSqlSafe, ConnectOptions, Connection};
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

/// Where the database file lives. `e2e_override` is the value of
/// `PATIENT_MANAGER_E2E_DB`, which the E2E suite sets to point the app at an
/// ephemeral database. It is honoured in a debug build only: the E2E binary is
/// one (`tauri build --debug`), and a shipped binary must not let an
/// environment variable move the database away from the user's data.
fn db_path_for(app_data_dir: &Path, e2e_override: Option<String>, debug_build: bool) -> PathBuf {
    match e2e_override {
        Some(e2e_path) if debug_build => PathBuf::from(e2e_path),
        _ => app_data_dir.join(DATABASE_FILENAME),
    }
}

/// Whether start-up deletes the database first. `requested` is what
/// `RESET_DATABASE` asked (`just dev --reset-db` sets it). It is honoured in a
/// debug build only: a shipped binary has no use for it, and the loss would be
/// the user's data.
fn reset_allowed(requested: bool, debug_build: bool) -> bool {
    requested && debug_build
}

/// Database manager for patient operations
pub struct Database {
    pool: SqlitePool,
    db_path: PathBuf,
}

impl Database {
    pub async fn new(app_data_dir: PathBuf, is_db_reset: bool) -> Result<Self> {
        let db_path = db_path_for(
            &app_data_dir,
            std::env::var("PATIENT_MANAGER_E2E_DB").ok(),
            cfg!(debug_assertions),
        );

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

        if reset_allowed(is_db_reset, cfg!(debug_assertions)) {
            tracing::warn!(target: BACKEND, "RESET_DATABASE is set - deleting existing database");
            if db_path.exists() {
                fs::remove_file(&db_path).with_context(|| "Failed to delete database")?;
                tracing::info!(target: BACKEND, "Database deleted successfully");
            } else {
                tracing::info!(target: BACKEND, "Database does not exist, skipping delete");
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

        tracing::trace!(target: BACKEND, "Database connection pool created");

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

        // #725 — migration 20261114 stops on a fund payment group linked to
        // several bank entries (BSM-038A): say in the log what each link is,
        // before it does. Nothing is changed, and a failure here stops nothing.
        log_group_double_links_if_pending(&db.pool).await;

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
    sqlx::query(AssertSqlSafe(format!("VACUUM INTO '{escaped}'")))
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

        let crlf_sql: String = m.sql.as_str().replace("\r\n", "\n").replace('\n', "\r\n");
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

/// The migration that gives a fund payment group one bank entry at most (BSM-038).
const ONE_BANK_ENTRY_PER_GROUP_VERSION: i64 = 20261114;

/// One link of a fund payment group that several links settle (#725): what the
/// log needs to tell a link left behind by a deleted bank entry from two bank
/// entries recorded for one payment. Identifiers, a date and yes/no only — no
/// amount, no name.
#[derive(Debug, PartialEq, Eq, sqlx::FromRow)]
struct GroupDoubleLink {
    link_id: String,
    fund_payment_group_id: String,
    group_exists: bool,
    group_status: Option<String>,
    bank_entry_id: String,
    bank_entry_exists: bool,
    bank_entry_type: Option<String>,
    bank_entry_date: Option<String>,
    /// How many groups this bank entry is linked to, this one included.
    groups_of_bank_entry: i64,
    /// Whether procedures or a refund also hold this bank entry.
    held_elsewhere: bool,
    /// Whether this bank entry's amount is the group's total.
    amount_is_group_total: bool,
    /// Whether the existing bank entries of the group share one amount.
    same_amount: bool,
}

/// Every link of every fund payment group linked more than once, the latest bank
/// entry of a group first. Reads only.
async fn read_group_double_links(pool: &SqlitePool) -> Result<Vec<GroupDoubleLink>> {
    let links = sqlx::query_as(
        "SELECT
             l.id                                       AS link_id,
             l.fund_payment_group_id                    AS fund_payment_group_id,
             g.id IS NOT NULL                           AS group_exists,
             g.status                                   AS group_status,
             l.bank_transfer_id                         AS bank_entry_id,
             bt.id IS NOT NULL                          AS bank_entry_exists,
             bt.transfer_type                           AS bank_entry_type,
             bt.transfer_date                           AS bank_entry_date,
             (SELECT COUNT(*) FROM bank_transfer_fund_group_link o
               WHERE o.bank_transfer_id = l.bank_transfer_id) AS groups_of_bank_entry,
             (SELECT COUNT(*) FROM bank_transfer_procedure_link p
               WHERE p.bank_transfer_id = l.bank_transfer_id)
           + (SELECT COUNT(*) FROM procedure_refund r
               WHERE r.refund_bank_transfer_id = l.bank_transfer_id) > 0 AS held_elsewhere,
             COALESCE(bt.amount = g.total_amount, 0)    AS amount_is_group_total,
             (SELECT COUNT(DISTINCT b.amount)
                FROM bank_transfer_fund_group_link s
                JOIN bank_transfer b ON b.id = s.bank_transfer_id
               WHERE s.fund_payment_group_id = l.fund_payment_group_id) <= 1 AS same_amount
         FROM bank_transfer_fund_group_link l
         LEFT JOIN bank_transfer bt     ON bt.id = l.bank_transfer_id
         LEFT JOIN fund_payment_group g ON g.id = l.fund_payment_group_id
         WHERE l.fund_payment_group_id IN (
             SELECT fund_payment_group_id FROM bank_transfer_fund_group_link
             GROUP BY fund_payment_group_id HAVING COUNT(*) > 1)
         ORDER BY l.fund_payment_group_id, bt.transfer_date DESC, l.rowid DESC",
    )
    .fetch_all(pool)
    .await?;
    Ok(links)
}

/// #725 — before migration 20261114 runs on a database that has not taken it,
/// writes one log line per link of each group it will stop on. Nothing is
/// written to the database, and no failure here stops the start.
async fn log_group_double_links_if_pending(pool: &SqlitePool) {
    let pending = async {
        let link_table: Option<String> = sqlx::query_scalar(
            "SELECT name FROM sqlite_master
             WHERE type = 'table' AND name = 'bank_transfer_fund_group_link'",
        )
        .fetch_optional(pool)
        .await?;
        if link_table.is_none() {
            return Ok(Vec::new());
        }
        let applied: Option<i64> = sqlx::query_scalar(
            "SELECT version FROM _sqlx_migrations WHERE version = ? AND success = 1",
        )
        .bind(ONE_BANK_ENTRY_PER_GROUP_VERSION)
        .fetch_optional(pool)
        .await?;
        if applied.is_some() {
            return Ok(Vec::new());
        }
        read_group_double_links(pool).await
    };
    let links: Result<Vec<GroupDoubleLink>> = pending.await;
    match links {
        Ok(links) => {
            for link in links {
                tracing::error!(
                    target: BACKEND,
                    link_id = %link.link_id,
                    fund_payment_group_id = %link.fund_payment_group_id,
                    group_exists = link.group_exists,
                    group_status = link.group_status.as_deref().unwrap_or("-"),
                    bank_entry_id = %link.bank_entry_id,
                    bank_entry_exists = link.bank_entry_exists,
                    bank_entry_type = link.bank_entry_type.as_deref().unwrap_or("-"),
                    bank_entry_date = link.bank_entry_date.as_deref().unwrap_or("-"),
                    groups_of_bank_entry = link.groups_of_bank_entry,
                    held_elsewhere = link.held_elsewhere,
                    amount_is_group_total = link.amount_is_group_total,
                    same_amount = link.same_amount,
                    "Fund payment group linked to several bank entries: migration 20261114 will stop on it"
                );
            }
        }
        Err(e) => {
            tracing::warn!(target: BACKEND, err = ?e, "Could not read the fund payment groups linked to several bank entries");
        }
    }
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
            .bind(crlf_checksum(m.sql.as_str()))
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

    #[test]
    fn debt_036_a_debug_build_resets_when_asked() {
        assert!(reset_allowed(true, true));
    }

    #[test]
    fn debt_036_a_shipped_build_never_resets() {
        assert!(!reset_allowed(true, false));
    }

    #[test]
    fn debt_036_nothing_resets_unless_asked() {
        for debug_build in [true, false] {
            assert!(!reset_allowed(false, debug_build));
        }
    }

    #[test]
    fn debt_028_a_debug_build_follows_the_e2e_override() {
        let app_data = PathBuf::from("/var/lib/PatientManager");

        assert_eq!(
            db_path_for(&app_data, Some("/tmp/e2e.db".to_string()), true),
            PathBuf::from("/tmp/e2e.db"),
        );
    }

    #[test]
    fn debt_028_a_release_build_ignores_the_e2e_override() {
        let app_data = PathBuf::from("/var/lib/PatientManager");

        assert_eq!(
            db_path_for(&app_data, Some("/tmp/e2e.db".to_string()), false),
            app_data.join(DATABASE_FILENAME),
        );
    }

    #[test]
    fn debt_028_without_an_override_the_database_is_under_the_app_data_folder() {
        let app_data = PathBuf::from("/var/lib/PatientManager");

        for debug_build in [true, false] {
            assert_eq!(
                db_path_for(&app_data, None, debug_build),
                app_data.join(DATABASE_FILENAME),
            );
        }
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
            sqlx::raw_sql(m.sql.clone())
                .execute(&mut *conn)
                .await
                .unwrap();
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
            .as_str()
            .lines()
            .filter(|l| !l.trim_start().starts_with("--"))
            .collect::<Vec<_>>()
            .join("\n");
        sqlx::query("BEGIN").execute(&mut *conn).await?;
        for stmt in clean.split(';') {
            let s = stmt.trim();
            if !s.is_empty() {
                sqlx::query(AssertSqlSafe(s.to_owned()))
                    .execute(&mut *conn)
                    .await?;
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

    /// Standing adversarial-migration net (gh#67 class): freeze a populated
    /// database at the 20260523 schema — a parent row WITH a child reference,
    /// plus a NULL in the column 20260524 tightens to NOT NULL — then replay
    /// every later migration in order on an FK-off connection, mirroring the
    /// runner policy in `Database::new`. New migration files join the replay
    /// automatically; this fails the build if any of them cannot handle
    /// populated data, instead of shipping a startup crash to real databases.
    #[tokio::test]
    async fn later_migrations_replay_on_populated_db() {
        let mut conn = mem_conn(false).await;
        migrate_to_523(&mut conn).await;
        seed_parent_with_child(&mut conn).await;

        for m in sqlx::migrate!("./migrations").iter() {
            // Frozen at the last schema before the first parent-rebuild
            // migration (the seed helpers target this version). Advance the
            // floor only together with the seed shape.
            if m.version <= 20260523 {
                continue;
            }
            sqlx::raw_sql(m.sql.clone())
                .execute(&mut conn)
                .await
                .unwrap_or_else(|e| panic!("migration {} failed on populated DB: {e}", m.version));
        }

        let viol: Vec<(String, Option<i64>, String, i64)> =
            sqlx::query_as("PRAGMA foreign_key_check")
                .fetch_all(&mut conn)
                .await
                .expect("PRAGMA foreign_key_check query failed");
        assert!(
            viol.is_empty(),
            "FK violations after forward replay: {viol:?}"
        );

        let procedures: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM procedure")
            .fetch_one(&mut conn)
            .await
            .expect("SELECT COUNT(*) FROM procedure failed");
        let lines: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM fund_payment_line")
            .fetch_one(&mut conn)
            .await
            .expect("SELECT COUNT(*) FROM fund_payment_line failed");
        assert_eq!(
            (procedures, lines),
            (1, 1),
            "seeded rows must survive every rebuild"
        );

        let billed: Option<i64> =
            sqlx::query_scalar("SELECT billed_amount FROM procedure WHERE id = 'PR1'")
                .fetch_one(&mut conn)
                .await
                .expect("SELECT billed_amount failed");
        assert!(
            billed.is_some(),
            "20260524 must backfill billed_amount to non-NULL"
        );
    }

    // ---- #725: what the log says before migration 20261114 stops ----

    /// A database upgraded up to, not including, migration 20261114.
    async fn pool_before_one_bank_entry_per_group() -> SqlitePool {
        let pool = fresh_pool().await;
        // Off, as on the migration connection: an old database's links may
        // reference a bank entry that no longer exists.
        sqlx::query("PRAGMA foreign_keys = OFF")
            .execute(&pool)
            .await
            .unwrap();
        seed_migrations_table(&pool).await;
        for m in sqlx::migrate!("./migrations")
            .iter()
            .filter(|m| m.version < ONE_BANK_ENTRY_PER_GROUP_VERSION)
        {
            sqlx::raw_sql(m.sql.clone()).execute(&pool).await.unwrap();
        }
        pool
    }

    async fn seed_entry(pool: &SqlitePool, id: &str, date: &str, amount: i64) {
        sqlx::query(
            "INSERT INTO bank_transfer (id, transfer_date, amount, transfer_type, bank_account_id)
             VALUES (?, ?, ?, 'FUND', 'account-1')",
        )
        .bind(id)
        .bind(date)
        .bind(amount)
        .execute(pool)
        .await
        .unwrap();
    }

    async fn seed_link(pool: &SqlitePool, id: &str, entry: &str, group: &str) {
        sqlx::query(
            "INSERT INTO bank_transfer_fund_group_link (id, bank_transfer_id, fund_payment_group_id)
             VALUES (?, ?, ?)",
        )
        .bind(id)
        .bind(entry)
        .bind(group)
        .execute(pool)
        .await
        .unwrap();
    }

    async fn count(pool: &SqlitePool, table: &str) -> i64 {
        sqlx::query_scalar(AssertSqlSafe(format!("SELECT COUNT(*) FROM {table}")))
            .fetch_one(pool)
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn test_725_a_link_to_a_missing_bank_entry_is_told_from_an_existing_one() {
        let pool = pool_before_one_bank_entry_per_group().await;
        sqlx::query(
            "INSERT INTO fund_payment_group (id, fund_id, payment_date, total_amount)
             VALUES ('group-1', 'fund-1', '2026-01-01', 10000)",
        )
        .execute(&pool)
        .await
        .unwrap();
        seed_entry(&pool, "entry-live", "2026-02-01", 10_000).await;
        seed_link(&pool, "link-1", "entry-gone", "group-1").await;
        seed_link(&pool, "link-2", "entry-live", "group-1").await;

        let links = read_group_double_links(&pool).await.unwrap();

        assert_eq!(
            links,
            vec![
                GroupDoubleLink {
                    link_id: "link-2".to_string(),
                    fund_payment_group_id: "group-1".to_string(),
                    group_exists: true,
                    group_status: Some("ACTIVE".to_string()),
                    bank_entry_id: "entry-live".to_string(),
                    bank_entry_exists: true,
                    bank_entry_type: Some("FUND".to_string()),
                    bank_entry_date: Some("2026-02-01".to_string()),
                    groups_of_bank_entry: 1,
                    held_elsewhere: false,
                    amount_is_group_total: true,
                    same_amount: true,
                },
                GroupDoubleLink {
                    link_id: "link-1".to_string(),
                    fund_payment_group_id: "group-1".to_string(),
                    group_exists: true,
                    group_status: Some("ACTIVE".to_string()),
                    bank_entry_id: "entry-gone".to_string(),
                    bank_entry_exists: false,
                    bank_entry_type: None,
                    bank_entry_date: None,
                    groups_of_bank_entry: 1,
                    held_elsewhere: false,
                    amount_is_group_total: false,
                    same_amount: true,
                },
            ]
        );
    }

    #[tokio::test]
    async fn test_725_two_existing_bank_entries_come_latest_first_with_their_other_groups() {
        let pool = pool_before_one_bank_entry_per_group().await;
        seed_entry(&pool, "entry-old", "2026-02-01", 14_000).await;
        seed_entry(&pool, "entry-new", "2026-02-09", 10_000).await;
        seed_link(&pool, "link-1", "entry-old", "group-1").await;
        seed_link(&pool, "link-2", "entry-old", "group-2").await;
        seed_link(&pool, "link-3", "entry-new", "group-1").await;
        sqlx::query(
            "INSERT INTO bank_transfer_procedure_link (id, bank_transfer_id, procedure_id)
             VALUES ('pl-1', 'entry-old', 'procedure-1')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let links = read_group_double_links(&pool).await.unwrap();

        let seen: Vec<(&str, bool, i64, bool, bool)> = links
            .iter()
            .map(|l| {
                (
                    l.bank_entry_id.as_str(),
                    l.bank_entry_exists,
                    l.groups_of_bank_entry,
                    l.same_amount,
                    l.held_elsewhere,
                )
            })
            .collect();
        assert_eq!(
            seen,
            vec![
                ("entry-new", true, 1, false, false),
                ("entry-old", true, 2, false, true),
            ],
            "group-2, linked once, is not listed"
        );
    }

    #[tokio::test]
    async fn test_725_the_log_step_changes_nothing_and_never_fails() {
        // No link table yet: nothing to read, nothing fails.
        log_group_double_links_if_pending(&fresh_pool().await).await;

        let pool = pool_before_one_bank_entry_per_group().await;
        seed_entry(&pool, "entry-a", "2026-02-01", 10_000).await;
        seed_entry(&pool, "entry-b", "2026-02-09", 10_000).await;
        seed_link(&pool, "link-1", "entry-a", "group-1").await;
        seed_link(&pool, "link-2", "entry-b", "group-1").await;

        log_group_double_links_if_pending(&pool).await;

        assert_eq!(count(&pool, "bank_transfer_fund_group_link").await, 2);
        assert_eq!(count(&pool, "bank_transfer").await, 2);
    }
}

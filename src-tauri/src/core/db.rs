use anyhow::{Context, Result};
use sha2::{Digest, Sha384};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use sqlx::ConnectOptions;
use std::fs;
use std::path::PathBuf;

use crate::BACKEND;

const DATABASE_FILENAME: &str = "patient_manager.db";

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

        // Apply pending import if one was staged by import_database (R10/R11)
        let pending_path = app_data_dir.join(format!("{DATABASE_FILENAME}.pending"));
        if pending_path.exists() {
            tracing::info!(
                name: BACKEND,
                "Pending database import found — replacing active database before opening"
            );
            fs::rename(&pending_path, &db_path)
                .with_context(|| "Failed to apply pending database import")?;
            tracing::info!(name: BACKEND, "Pending database import applied successfully");
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

        tracing::trace!(target: BACKEND, "Connecting to database: {}", db_path.to_string_lossy());

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

        // Heal CRLF→LF migration checksum drift from binaries built with
        // git core.autocrlf=true (e.g. v0.14.0 built on Windows). Must run
        // before sqlx::migrate! to prevent VersionMismatch panic at startup.
        heal_crlf_checksum_drift(&db.pool)
            .await
            .with_context(|| "Failed to heal migration checksums")?;

        // Apply database migrations from ./migrations directory
        //
        // IMPORTANT: When creating a new migration:
        // 1. Create the migration file in src-tauri/migrations/ (format: YYYYMMDD_description.sql)
        // 2. Run `cd src-tauri && sqlx database setup` to apply migrations to dev database
        // 3. This ensures SQLx compile-time verification works correctly
        //
        // The dev database is located at: src-tauri/patient_manager.db
        // Set DATABASE_URL="sqlite:patient_manager.db" when running cargo commands
        sqlx::migrate!("./migrations").run(&db.pool).await?;

        Ok(db)
    }

    pub fn get_pool(&self) -> &SqlitePool {
        &self.pool
    }

    pub fn get_path(&self) -> &PathBuf {
        &self.db_path
    }
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
}

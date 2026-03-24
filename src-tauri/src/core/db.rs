use anyhow::{Context, Result};
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
        let db_path = app_data_dir.join(DATABASE_FILENAME);

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

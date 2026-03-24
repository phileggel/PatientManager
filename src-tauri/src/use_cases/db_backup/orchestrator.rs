use anyhow::{Context, Result};
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::core::logger::BACKEND;
use crate::core::Database;

/// Orchestrates database export and import operations (R8–R11).
pub struct DbBackupOrchestrator {
    db: Arc<Database>,
}

impl DbBackupOrchestrator {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    /// Exports the active database to a gzip-compressed file at `dest_path` (R7, R8).
    ///
    /// Uses `VACUUM INTO` to produce a clean, consistent snapshot without
    /// interrupting active connections, then compresses the result with gzip.
    /// Temporary files are always cleaned up (R11).
    pub async fn export_database(&self, dest_path: String) -> Result<()> {
        tracing::info!(name: BACKEND, dest = %dest_path, "Starting database export");

        let db_dir = self
            .db
            .get_path()
            .parent()
            .with_context(|| "Cannot determine database directory")?
            .to_path_buf();

        let temp_path = db_dir.join("patient_manager.db.tmp_export");

        // Ensure temp file is cleaned up even on failure
        let result = self.do_export(&temp_path, &dest_path).await;

        if temp_path.exists() {
            if let Err(e) = fs::remove_file(&temp_path) {
                tracing::warn!(name: BACKEND, "Failed to remove temp export file: {e}");
            }
        }

        result?;
        tracing::info!(name: BACKEND, dest = %dest_path, "Database export completed");
        Ok(())
    }

    async fn do_export(&self, temp_path: &PathBuf, dest_path: &str) -> Result<()> {
        // Create a clean, consistent copy via VACUUM INTO (R8)
        let temp_str = temp_path
            .to_str()
            .with_context(|| "Temp path contains invalid UTF-8")?;

        anyhow::ensure!(
            !temp_str.contains('\''),
            "Temp path contains unexpected characters"
        );
        sqlx::query(&format!("VACUUM INTO '{temp_str}'"))
            .execute(self.db.get_pool())
            .await
            .with_context(|| "VACUUM INTO failed")?;

        // Compress temp file → destination (R7)
        let input = fs::File::open(temp_path).with_context(|| "Cannot open temp export file")?;
        let output =
            fs::File::create(dest_path).with_context(|| "Cannot create destination file")?;
        let mut encoder = GzEncoder::new(output, Compression::default());
        let mut reader = io::BufReader::new(input);
        io::copy(&mut reader, &mut encoder).with_context(|| "Gzip compression failed")?;
        encoder
            .finish()
            .with_context(|| "Failed to finalise gzip stream")?;

        Ok(())
    }

    /// Decompresses and validates the backup at `source_path`, then stages it
    /// as a pending import (R9, R10). The active database is not modified — the
    /// replacement takes effect on next startup (R11 startup check in `Database::new`).
    pub async fn import_database(&self, source_path: String) -> Result<()> {
        tracing::info!(name: BACKEND, source = %source_path, "Starting database import");

        let db_dir = self
            .db
            .get_path()
            .parent()
            .with_context(|| "Cannot determine database directory")?
            .to_path_buf();

        let temp_path = db_dir.join("patient_manager.db.tmp_import");
        let pending_path = db_dir.join("patient_manager.db.pending");

        // Ensure temp file is cleaned up on failure
        let result = self
            .do_import(&source_path, &temp_path, &pending_path)
            .await;

        if result.is_err() && temp_path.exists() {
            if let Err(e) = fs::remove_file(&temp_path) {
                tracing::warn!(name: BACKEND, "Failed to remove temp import file: {e}");
            }
        }

        result?;
        tracing::info!(
            name: BACKEND,
            "Database import staged — will take effect on next startup"
        );
        Ok(())
    }

    async fn do_import(
        &self,
        source_path: &str,
        temp_path: &Path,
        pending_path: &Path,
    ) -> Result<()> {
        // Decompress source → temp (R9)
        let input = fs::File::open(source_path).with_context(|| "Cannot open backup file")?;
        let output =
            fs::File::create(temp_path).with_context(|| "Cannot create temp import file")?;
        let mut decoder = GzDecoder::new(io::BufReader::new(input));
        let mut writer = io::BufWriter::new(output);
        io::copy(&mut decoder, &mut writer).with_context(|| "Gzip decompression failed")?;
        drop(writer);

        // Validate the decompressed database (R9)
        self.validate_sqlite(temp_path).await?;

        // Stage as pending — active database is not touched (R10)
        fs::rename(temp_path, pending_path)
            .with_context(|| "Failed to stage pending database import")?;

        Ok(())
    }

    /// Opens the SQLite file at `path` and runs `PRAGMA integrity_check`.
    async fn validate_sqlite(&self, path: &Path) -> Result<()> {
        use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
        use sqlx::ConnectOptions;

        let path_str = path
            .to_str()
            .with_context(|| "Temp path contains invalid UTF-8")?;

        let opts = SqliteConnectOptions::new()
            .filename(path_str)
            .read_only(true)
            .disable_statement_logging();

        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(opts)
            .await
            .with_context(|| "Cannot open backup file as SQLite database")?;

        let row: (String,) = sqlx::query_as("PRAGMA integrity_check")
            .fetch_one(&pool)
            .await
            .with_context(|| "integrity_check query failed")?;

        pool.close().await;

        if row.0 != "ok" {
            anyhow::bail!("Backup file integrity check failed: {}", row.0);
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    /// Helper: create a minimal valid SQLite database file at the given path.
    async fn create_test_db(path: &PathBuf) {
        use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
        use sqlx::ConnectOptions;

        let opts = SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true)
            .disable_statement_logging();

        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(opts)
            .await
            .expect("Failed to create test db");

        sqlx::query("CREATE TABLE IF NOT EXISTS test_table (id INTEGER PRIMARY KEY)")
            .execute(&pool)
            .await
            .expect("Failed to create test table");

        pool.close().await;
    }

    #[tokio::test]
    async fn test_export_produces_valid_gzip_sqlite() {
        let dir = tempdir().expect("tempdir");
        let db_path = dir.path().join("patient_manager.db");
        create_test_db(&db_path).await;

        let db = Arc::new(
            Database::new(dir.path().to_path_buf(), false)
                .await
                .expect("Database::new"),
        );
        let orchestrator = DbBackupOrchestrator::new(db);

        let dest = dir.path().join("backup.db.gz");
        orchestrator
            .export_database(dest.to_str().unwrap().to_string())
            .await
            .expect("export_database");

        assert!(dest.exists(), "backup file should exist");
        assert!(
            dest.metadata().unwrap().len() > 0,
            "backup file should not be empty"
        );

        // Verify it is a valid gzip stream
        let file = fs::File::open(&dest).unwrap();
        let mut decoder = GzDecoder::new(io::BufReader::new(file));
        let mut buf = Vec::new();
        io::Read::read_to_end(&mut decoder, &mut buf).expect("should decompress without error");
        // SQLite magic header: "SQLite format 3\0"
        assert!(
            buf.starts_with(b"SQLite format 3"),
            "decompressed content should be SQLite"
        );
    }

    #[tokio::test]
    async fn test_import_stages_pending_file() {
        let dir = tempdir().expect("tempdir");
        let db_path = dir.path().join("patient_manager.db");
        create_test_db(&db_path).await;

        let db = Arc::new(
            Database::new(dir.path().to_path_buf(), false)
                .await
                .expect("Database::new"),
        );
        let orchestrator = DbBackupOrchestrator::new(db);

        // Export first
        let backup = dir.path().join("backup.db.gz");
        orchestrator
            .export_database(backup.to_str().unwrap().to_string())
            .await
            .expect("export_database");

        // Import the backup
        orchestrator
            .import_database(backup.to_str().unwrap().to_string())
            .await
            .expect("import_database");

        // Pending file should exist; active db should still be there
        let pending = dir.path().join("patient_manager.db.pending");
        assert!(pending.exists(), "pending file should be staged");
        assert!(db_path.exists(), "active database should still exist");
    }

    #[tokio::test]
    async fn test_import_rejects_invalid_gzip() {
        let dir = tempdir().expect("tempdir");
        let db_path = dir.path().join("patient_manager.db");
        create_test_db(&db_path).await;

        let db = Arc::new(
            Database::new(dir.path().to_path_buf(), false)
                .await
                .expect("Database::new"),
        );
        let orchestrator = DbBackupOrchestrator::new(db);

        // Write garbage as a "backup"
        let bad_backup = dir.path().join("bad.db.gz");
        fs::write(&bad_backup, b"this is not gzip").unwrap();

        let result = orchestrator
            .import_database(bad_backup.to_str().unwrap().to_string())
            .await;

        assert!(result.is_err(), "should reject invalid gzip");
        // Pending file must NOT have been staged
        assert!(
            !dir.path().join("patient_manager.db.pending").exists(),
            "no pending file on failure"
        );
    }

    /// R9: valid gzip wrapping a non-SQLite payload → integrity_check fails → error returned,
    /// no pending file staged.
    #[tokio::test]
    async fn test_import_rejects_valid_gzip_with_non_sqlite_content() {
        use std::io::Write;

        let dir = tempdir().expect("tempdir");
        create_test_db(&dir.path().join("patient_manager.db")).await;

        let db = Arc::new(
            Database::new(dir.path().to_path_buf(), false)
                .await
                .expect("Database::new"),
        );
        let orchestrator = DbBackupOrchestrator::new(db);

        // Build a valid gzip wrapping plain text (not a SQLite file)
        let bad_backup = dir.path().join("bad_content.db.gz");
        let file = fs::File::create(&bad_backup).unwrap();
        let mut encoder = GzEncoder::new(file, Compression::default());
        encoder.write_all(b"this is not a sqlite database").unwrap();
        encoder.finish().unwrap();

        let result = orchestrator
            .import_database(bad_backup.to_str().unwrap().to_string())
            .await;

        assert!(result.is_err(), "should reject non-SQLite gzip content");
        assert!(
            !dir.path().join("patient_manager.db.pending").exists(),
            "no pending file on failure"
        );
    }

    /// R11: export failure leaves no temp file behind.
    /// We simulate a failure by providing a read-only destination directory.
    #[tokio::test]
    async fn test_export_cleans_up_temp_file_on_failure() {
        let dir = tempdir().expect("tempdir");
        create_test_db(&dir.path().join("patient_manager.db")).await;

        let db = Arc::new(
            Database::new(dir.path().to_path_buf(), false)
                .await
                .expect("Database::new"),
        );
        let orchestrator = DbBackupOrchestrator::new(db);

        // Point to a non-existent subdirectory so the gzip write fails
        let bad_dest = dir.path().join("nonexistent_dir").join("backup.db.gz");
        let result = orchestrator
            .export_database(bad_dest.to_str().unwrap().to_string())
            .await;

        assert!(result.is_err(), "should fail with unreachable destination");
        // Temp export file must have been cleaned up
        assert!(
            !dir.path().join("patient_manager.db.tmp_export").exists(),
            "temp export file should be removed on failure"
        );
    }

    /// R11: import failure leaves no temp file behind.
    #[tokio::test]
    async fn test_import_cleans_up_temp_file_on_failure() {
        let dir = tempdir().expect("tempdir");
        create_test_db(&dir.path().join("patient_manager.db")).await;

        let db = Arc::new(
            Database::new(dir.path().to_path_buf(), false)
                .await
                .expect("Database::new"),
        );
        let orchestrator = DbBackupOrchestrator::new(db);

        // Invalid gzip triggers failure during decompression
        let bad_backup = dir.path().join("bad.db.gz");
        fs::write(&bad_backup, b"not gzip").unwrap();

        let result = orchestrator
            .import_database(bad_backup.to_str().unwrap().to_string())
            .await;

        assert!(result.is_err(), "should fail on invalid gzip");
        assert!(
            !dir.path().join("patient_manager.db.tmp_import").exists(),
            "temp import file should be removed on failure"
        );
    }
}

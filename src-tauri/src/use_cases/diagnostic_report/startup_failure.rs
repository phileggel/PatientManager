//! DGR-040 to DGR-045 — what failed at start-up, as the screen reads it, and the
//! report the user can send about it.

use std::path::{Path, PathBuf};

use serde::Serialize;
use specta::Type;

use crate::shared::logger::BACKEND;
use crate::shared::secure_path;
use crate::shared::{DatabaseStartError, DatabaseStartStage};

use super::error::DiagnosticReportError;
use super::orchestrator::DiagnosticReportResult;
use super::report;

/// DGR-040 — the step of the start that failed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum StartupStage {
    PendingImport,
    Open,
    Backup,
    ChecksumRepair,
    Repair,
    Migration,
    Other,
}

/// DGR-041 — what failed at start.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
pub struct StartupFailure {
    pub stage: StartupStage,
    pub migration_version: Option<i64>,
    pub migration_description: Option<String>,
    /// The error's innermost cause only; the home folder reads `~` (DGR-041).
    pub cause: String,
    /// DGR-042 — the backup beside the database was saved before the failure.
    pub backup_taken: bool,
}

impl StartupFailure {
    /// The database could not be made ready (DGR-040).
    pub fn from_database(err: &DatabaseStartError) -> Self {
        let stage = match err.stage {
            DatabaseStartStage::PendingImport => StartupStage::PendingImport,
            DatabaseStartStage::Open => StartupStage::Open,
            DatabaseStartStage::Backup => StartupStage::Backup,
            DatabaseStartStage::ChecksumRepair => StartupStage::ChecksumRepair,
            DatabaseStartStage::Repair => StartupStage::Repair,
            DatabaseStartStage::Migration => StartupStage::Migration,
        };
        Self {
            stage,
            migration_version: err.migration_version,
            migration_description: err.migration_description.clone(),
            cause: without_home(err.first_cause(), secure_path::user_home().as_deref()),
            backup_taken: err.backup_taken,
        }
    }

    /// Any other failure of the start-up (DGR-045).
    pub fn other(err: &anyhow::Error) -> Self {
        Self {
            stage: StartupStage::Other,
            migration_version: None,
            migration_description: None,
            cause: without_home(
                err.root_cause().to_string(),
                secure_path::user_home().as_deref(),
            ),
            backup_taken: false,
        }
    }
}

/// DGR-041 — a cause naming a file under the home folder names it from `~`, so the
/// user's account name stays out of the page and the report.
fn without_home(cause: String, home: Option<&Path>) -> String {
    match home.map(|home| home.to_string_lossy()) {
        Some(home) if !home.is_empty() => cause.replace(home.as_ref(), "~"),
        _ => cause,
    }
}

/// DGR-044A — the failure held since start-up, or the refusal when the start-up succeeded.
#[cfg(any(feature = "app", test))]
pub fn held_or_refused<T>(held: Option<T>) -> Result<T, DiagnosticReportError> {
    held.ok_or(DiagnosticReportError::NoStartupFailure)
}

/// Held by the application after a failed start: the failure, and the log the
/// report reads (`None` when the log folder could not be made).
pub struct StartupFailureReport {
    failure: StartupFailure,
    log_file: Option<PathBuf>,
}

impl StartupFailureReport {
    pub fn new(failure: StartupFailure, log_file: Option<PathBuf>) -> Self {
        Self { failure, log_file }
    }

    pub fn failure(&self) -> &StartupFailure {
        &self.failure
    }

    /// DGR-043 — write the report to `dest_path`, already validated by the command.
    pub async fn write(
        &self,
        dest_path: &Path,
    ) -> Result<DiagnosticReportResult, DiagnosticReportError> {
        let support_code = report::new_support_code();
        let text =
            report::build_startup_failure(&self.failure, self.log_file.as_deref(), &support_code);

        let dest = dest_path.to_path_buf();
        tokio::task::spawn_blocking(move || {
            secure_path::write_replacing(&dest, |file| {
                std::io::Write::write_all(file, text.as_bytes())
            })
        })
        .await
        .unwrap_or_else(|joined| Err(std::io::Error::other(joined)))
        .map_err(|e| {
            tracing::error!(target: BACKEND, err = ?e, "Failed to write the start-up failure report");
            DiagnosticReportError::ReportFailed
        })?;

        tracing::info!(target: BACKEND, support_code = %support_code, "Start-up failure report written");
        Ok(DiagnosticReportResult { support_code })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn migration_failure() -> StartupFailure {
        StartupFailure {
            stage: StartupStage::Migration,
            migration_version: Some(20261114),
            migration_description: Some("fund group one bank entry".to_string()),
            cause: "UNIQUE constraint failed: link.group_id".to_string(),
            backup_taken: true,
        }
    }

    #[test]
    fn test_dgr_041_any_other_failure_keeps_its_first_cause_only() {
        let err = anyhow::anyhow!("permission denied")
            .context("Failed to create data directory /home/someone/.local/share");

        let failure = StartupFailure::other(&err);

        assert_eq!(failure.stage, StartupStage::Other);
        assert_eq!(failure.cause, "permission denied");
        assert!(!failure.backup_taken);
    }

    #[test]
    fn test_dgr_041_the_home_folder_in_a_cause_reads_as_a_tilde() {
        let home = Path::new("/home/someone");

        let cause = without_home(
            "unable to open /home/someone/.local/share/app.db".to_string(),
            Some(home),
        );

        assert_eq!(cause, "unable to open ~/.local/share/app.db");
        assert_eq!(without_home("no path".to_string(), None), "no path");
    }

    #[test]
    fn test_dgr_044a_a_start_up_that_succeeded_refuses_the_report() {
        assert_eq!(
            held_or_refused::<()>(None).err(),
            Some(DiagnosticReportError::NoStartupFailure)
        );
        assert_eq!(held_or_refused(Some(7)).ok(), Some(7));
    }

    #[test]
    fn test_dgr_040_the_stage_crosses_the_wire_in_snake_case() {
        let value = serde_json::to_value(StartupStage::ChecksumRepair).expect("serialise");
        assert_eq!(value, serde_json::json!("checksum_repair"));
    }

    #[tokio::test]
    async fn test_dgr_043_the_report_is_written_and_carries_its_code() {
        let dir = tempfile::tempdir().expect("tempdir");
        let dest = dir.path().join("report.txt");
        let report = StartupFailureReport::new(migration_failure(), None);

        let result = report.write(&dest).await.expect("report written");

        let written = std::fs::read_to_string(&dest).expect("read report");
        assert!(written.contains(&format!("Support code: {}", result.support_code)));
        assert!(written.contains("Migration: 20261114 fund group one bank entry"));
    }

    #[tokio::test]
    async fn test_dgr_025_a_failure_report_that_cannot_be_written_fails() {
        let dir = tempfile::tempdir().expect("tempdir");
        let dest = dir.path().join("no-such-folder").join("report.txt");
        let report = StartupFailureReport::new(migration_failure(), None);

        let result = report.write(&dest).await;

        assert_eq!(result.err(), Some(DiagnosticReportError::ReportFailed));
    }
}

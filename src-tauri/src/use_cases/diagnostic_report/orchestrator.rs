use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Serialize;
use specta::Type;

use crate::shared::db_diagnostics::DatabaseDiagnostics;
use crate::shared::logger::BACKEND;

use super::error::DiagnosticReportError;
use super::report;

/// What the frontend shows once the report is written (DGR-014).
#[derive(Debug, Clone, Serialize, Type)]
pub struct DiagnosticReportResult {
    pub support_code: String,
}

/// Collects the state of the installation and writes it as a text file.
pub struct DiagnosticReportOrchestrator {
    database: Arc<dyn DatabaseDiagnostics>,
    log_file: PathBuf,
}

impl DiagnosticReportOrchestrator {
    pub fn new(database: Arc<dyn DatabaseDiagnostics>, log_file: PathBuf) -> Self {
        Self { database, log_file }
    }

    /// Write the report to `dest_path`, already validated by the command.
    pub async fn generate(
        &self,
        dest_path: &Path,
    ) -> Result<DiagnosticReportResult, DiagnosticReportError> {
        let support_code = report::new_support_code();
        let text = report::build(self.database.as_ref(), &self.log_file, &support_code).await;

        tokio::fs::write(dest_path, text).await.map_err(|e| {
            tracing::error!(target: BACKEND, err = ?e, "Failed to write the diagnostic report");
            DiagnosticReportError::ReportFailed
        })?;

        tracing::info!(target: BACKEND, support_code = %support_code, "Diagnostic report written");
        Ok(DiagnosticReportResult { support_code })
    }
}

#[cfg(test)]
mod tests {
    use super::super::report::tests::FakeDatabase;
    use super::*;

    fn orchestrator(log_dir: &Path) -> DiagnosticReportOrchestrator {
        DiagnosticReportOrchestrator::new(
            Arc::new(FakeDatabase::healthy()),
            log_dir.join("app.log"),
        )
    }

    #[tokio::test]
    async fn test_dgr_020_the_code_given_back_is_the_one_written_in_the_file() {
        let dir = tempfile::tempdir().expect("tempdir");
        let dest = dir.path().join("report.txt");

        let result = orchestrator(dir.path())
            .generate(&dest)
            .await
            .expect("report written");

        let written = std::fs::read_to_string(&dest).expect("read report");
        assert!(written.contains(&format!("Support code: {}", result.support_code)));
    }

    #[tokio::test]
    async fn test_dgr_025_a_file_that_cannot_be_written_fails_the_operation() {
        let dir = tempfile::tempdir().expect("tempdir");
        let dest = dir.path().join("no-such-folder").join("report.txt");

        let result = orchestrator(dir.path()).generate(&dest).await;

        assert_eq!(result.err(), Some(DiagnosticReportError::ReportFailed));
    }
}

use super::error::{FundPaymentReconciliationError, FundPaymentReconciliationTask};
use super::parsing::pdf_parser;
use super::service::ReconciliationService;
use crate::shared::logger::BACKEND;
use crate::shared::pdf_extractor;
use crate::shared::secure_path::{self, PathPolicy};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::sync::Arc;
use tauri::State;

// ============ Domain Types ============

// `NormalizedPdfLine`, `PdfProcedureGroup`, and `PdfParseResult` are the
// fund-PDF codec contract — moved to `fund_pdf_codec.rs` per IFC-060. This
// re-export preserves the existing import paths used by `service.rs`,
// `output/`, `data/`, `reconciliation/`, `parsing/pdf_parser.rs`, and the
// Specta-generated `parse_pdf_text` Tauri command.
pub use super::fund_pdf_codec::{NormalizedPdfLine, PdfParseResult, PdfProcedureGroup};

/// Type of detected anomaly
#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
pub enum AnomalyType {
    /// Fund in PDF differs from fund in database
    FundMismatch,
    /// Amount in PDF differs from amount in database
    AmountMismatch,
    /// Procedure date is off by 1 day (matched via date-1 pass)
    DateMismatch,
}

/// A single DB procedure match within an issue
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DbMatch {
    pub procedure_id: String,
    #[specta(type = String)]
    pub procedure_date: NaiveDate,
    pub fund_id: Option<String>,
    pub amount: Option<i64>,
    pub anomalies: Vec<AnomalyType>,
}

/// A nearby unreconciled procedure candidate for manual linking
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct NotFoundCandidate {
    pub procedure_id: String,
    pub patient_name: String,
    pub ssn: String,
    #[specta(type = String)]
    pub procedure_date: NaiveDate,
    pub amount: i64,
}

/// An unreconciled procedure for the post-reconciliation report
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct UnreconciledProcedure {
    pub procedure_id: String,
    pub patient_name: String,
    pub ssn: String,
    #[specta(type = String)]
    pub procedure_date: NaiveDate,
    pub amount: i64,
}

/// A reconciliation match result (unified discriminated union for all scenarios)
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type", content = "data")]
pub enum ReconciliationMatch {
    /// PDF line matched perfectly to one DB procedure (no anomalies)
    PerfectSingleMatch {
        pdf_line: NormalizedPdfLine,
        db_match: DbMatch,
    },
    /// PDF line matched perfectly to multiple DB procedures (no anomalies)
    PerfectGroupMatch {
        pdf_line: NormalizedPdfLine,
        db_matches: Vec<DbMatch>,
    },
    /// PDF line matched to one DB procedure with anomalies
    SingleMatchIssue {
        pdf_line: NormalizedPdfLine,
        db_match: DbMatch,
    },
    /// PDF line matched to multiple DB procedures with anomalies
    GroupMatchIssue {
        pdf_line: NormalizedPdfLine,
        db_matches: Vec<DbMatch>,
    },
    /// Too many procedures found for a single PDF line (above threshold, unresolvable)
    TooManyMatchIssue {
        pdf_line: NormalizedPdfLine,
        candidate_ids: Vec<String>,
    },
    /// PDF line not found in database; nearby_candidates are unreconciled procedures within ±1 day
    NotFoundIssue {
        pdf_line: NormalizedPdfLine,
        nearby_candidates: Vec<NotFoundCandidate>,
    },
}

impl ReconciliationMatch {
    /// True when this match represents an anomaly requiring user attention
    /// (any `*Issue` variant). Perfect matches return `false`.
    pub fn is_issue(&self) -> bool {
        matches!(
            self,
            ReconciliationMatch::SingleMatchIssue { .. }
                | ReconciliationMatch::GroupMatchIssue { .. }
                | ReconciliationMatch::TooManyMatchIssue { .. }
                | ReconciliationMatch::NotFoundIssue { .. }
        )
    }
}

/// Complete reconciliation result structured as unified matches
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ReconciliationResult {
    /// Unified array of all reconciliation matches (perfect + issues)
    pub matches: Vec<ReconciliationMatch>,
}

impl ReconciliationResult {
    /// Count of matches that represent an anomaly (any `*Issue` variant).
    pub fn issue_count(&self) -> usize {
        self.matches.iter().filter(|m| m.is_issue()).count()
    }
}

// ============ Fund Payment Reconciliation DTOs ============

/// Validation status for a fund payment candidate
#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FundPaymentValidationStatus {
    Valid,
    Invalid,
}

/// Type alias for backwards compatibility with Tauri API responses
/// Use crate::context::fund::FundPaymentGroupCandidate for new code
pub type FundPaymentCandidateFromPdf = crate::context::fund::FundPaymentGroupCandidate;

/// Validation result for a fund payment candidate
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FundPaymentCandidateValidation {
    pub candidate: FundPaymentCandidateFromPdf,
    pub status: FundPaymentValidationStatus,
    pub error: Option<String>,
}

/// Response from PDF reconciliation workflow
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ReconcileAndCandidatesResponse {
    /// Grouped payment candidates ready for user validation
    pub candidates: Vec<FundPaymentCandidateFromPdf>,
    /// Raw reconciliation details for reference
    pub reconciliation: ReconciliationResult,
    /// `true` when every candidate maps to an existing `FundPaymentGroup`
    /// (same `fund_label` + `payment_date` + `total_amount`). The frontend
    /// renders an "already imported" empty-state instead of the anomaly UI
    /// and refuses to dispatch downstream commands — guarding against the
    /// silent partial mutation that would otherwise occur if the user
    /// reached the auto-correction step.
    pub already_imported: bool,
}

/// Request to create fund payment groups from validated candidates
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CreateFundPaymentFromCandidatesRequest {
    /// Validated candidates to process
    pub candidates: Vec<FundPaymentCandidateFromPdf>,
}

/// Auto-correction action for an anomaly
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub enum AutoCorrection {
    /// Update procedure amount to PDF amount
    AmountMismatch {
        procedure_id: String,
        pdf_amount: i64,
    },
    /// Update procedure fund to PDF fund
    FundMismatch {
        procedure_id: String,
        pdf_fund_label: String,
    },
    /// Update procedure date to PDF date
    DateMismatch {
        procedure_id: String,
        #[specta(type = String)]
        pdf_date: NaiveDate,
    },
    /// Create new procedure from PDF line (creates patient if not found)
    CreateProcedure {
        ssn: String,
        patient_name: String,
        #[specta(type = String)]
        procedure_date: NaiveDate,
        #[specta(type = String)]
        payment_date: NaiveDate,
        billed_amount: i64,
        pdf_fund_label: String,
    },
    /// Link existing procedure to fund payment and correct patient SSN from PDF
    LinkProcedure {
        procedure_id: String,
        pdf_ssn: String,
        pdf_fund_label: String,
        #[specta(type = String)]
        payment_date: NaiveDate,
    },
    /// Contest the fund payment amount: keep billed_amount unchanged,
    /// set paid_amount to the PDF amount (what the fund claims to have paid).
    /// Sets payment_status to PartiallyReconciled.
    ContestAmount {
        procedure_id: String,
        /// Amount actually paid by the fund (from PDF), in thousandths of a euro
        paid_amount: i64,
    },
}

/// Request to create fund payment groups with auto-corrections
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CreateFundPaymentWithAutoCorrectionsRequest {
    /// Validated candidates to process
    pub candidates: Vec<FundPaymentCandidateFromPdf>,
    /// Auto-corrections to apply
    pub auto_corrections: Vec<AutoCorrection>,
}

// ============ Standalone functions (thin wrappers — testable without Tauri State) ============

pub async fn reconcile_pdf_procedures_fn(
    parse_result: PdfParseResult,
    service: Arc<ReconciliationService>,
) -> Result<ReconciliationResult, FundPaymentReconciliationError> {
    let response = service.reconcile(parse_result).await?;
    Ok(response.reconciliation)
}

pub async fn reconcile_and_create_candidates_fn(
    parse_result: PdfParseResult,
    service: Arc<ReconciliationService>,
    orchestrator: Arc<super::FundPaymentReconciliationOrchestrator>,
) -> Result<ReconcileAndCandidatesResponse, FundPaymentReconciliationError> {
    let mut response = service.reconcile(parse_result).await?;
    response.already_imported = orchestrator
        .all_candidates_are_duplicates(&response.candidates)
        .await?;
    Ok(response)
}

pub async fn create_fund_payment_from_candidates_fn(
    request: CreateFundPaymentFromCandidatesRequest,
    orchestrator: Arc<super::FundPaymentReconciliationOrchestrator>,
) -> Result<Vec<crate::context::fund::FundPaymentGroup>, FundPaymentReconciliationError> {
    orchestrator
        .create_multiple_from_candidates(request.candidates)
        .await
}

pub async fn create_fund_payment_with_auto_corrections_fn(
    request: CreateFundPaymentWithAutoCorrectionsRequest,
    patient_service: Arc<crate::context::patient::PatientService>,
    orchestrator: Arc<super::FundPaymentReconciliationOrchestrator>,
) -> Result<Vec<crate::context::fund::FundPaymentGroup>, FundPaymentReconciliationError> {
    orchestrator
        .create_multiple_with_auto_corrections(
            request.candidates,
            request.auto_corrections,
            patient_service,
        )
        .await
}

pub async fn get_unreconciled_procedures_in_range_fn(
    start_date: String,
    end_date: String,
    service: Arc<ReconciliationService>,
) -> Result<Vec<UnreconciledProcedure>, FundPaymentReconciliationError> {
    let parse = |raw: &str, field: &str| {
        NaiveDate::parse_from_str(raw, "%Y-%m-%d").map_err(|e| {
            tracing::warn!(target: BACKEND, field, error = %e, "Invalid date in unreconciled range query");
            FundPaymentReconciliationError::from(FundPaymentReconciliationTask::InvalidDateRange)
        })
    };
    let start = parse(&start_date, "start_date")?;
    let end = parse(&end_date, "end_date")?;
    service.find_unreconciled_in_range(start, end).await
}

// ============ Handlers ============

/// Handler for PDF text extraction from file path
#[tauri::command]
#[specta::specta]
pub async fn extract_pdf_text(file_path: String) -> Result<String, FundPaymentReconciliationError> {
    tracing::info!(target: BACKEND, "Extracting text from PDF");

    let allowed_root = secure_path::user_home().ok_or_else(|| {
        tracing::error!(target: BACKEND, "Cannot resolve user home directory");
        FundPaymentReconciliationError::from(FundPaymentReconciliationTask::PdfPathRejected)
    })?;
    let canonical = secure_path::validate_user_path(
        &file_path,
        &allowed_root,
        PathPolicy::ExistingFile {
            extensions: &["pdf"],
        },
    )
    .map_err(|e| {
        tracing::warn!(target: BACKEND, error = %e, "PDF path rejected by validator");
        FundPaymentReconciliationError::from(FundPaymentReconciliationTask::PdfPathRejected)
    })?;
    let result = pdf_extractor::extract_pdf_text(&canonical).map_err(|e| {
        tracing::error!(target: BACKEND, error = %format!("{e:#}"), "PDF text extraction failed");
        FundPaymentReconciliationError::from(FundPaymentReconciliationTask::PdfExtractionFailed)
    })?;

    tracing::info!(
        target: BACKEND,
        "Successfully extracted {} characters from PDF",
        result.len()
    );

    Ok(result)
}

/// Handler for parsing extracted PDF text into structured procedure groups.
/// Normalization (French date parsing) happens here — lines with unparseable
/// dates are counted as unparsed rather than propagating errors.
#[tauri::command]
#[specta::specta]
pub async fn parse_pdf_text(text: String) -> PdfParseResult {
    tracing::info!(target: BACKEND, chars = text.len(), "Parsing PDF text");

    let result = pdf_parser::parse_pdf_text(&text);

    tracing::info!(
        target: BACKEND,
        groups = result.groups.len(),
        total_lines = result.groups.iter().map(|g| g.lines.len()).sum::<usize>(),
        "PDF text parsed"
    );

    result
}

/// Handler for reconciling PDF procedures with database
#[tauri::command]
#[specta::specta]
pub async fn reconcile_pdf_procedures(
    parse_result: PdfParseResult,
    service: State<'_, Arc<ReconciliationService>>,
) -> Result<ReconciliationResult, FundPaymentReconciliationError> {
    tracing::info!(target: BACKEND, "Starting PDF reconciliation");
    reconcile_pdf_procedures_fn(parse_result, service.inner().clone())
        .await
        .inspect(|result| {
            let issue_count = result.issue_count();
            tracing::info!(
                target: BACKEND,
                "Reconciliation complete: {} perfect matches, {} issues",
                result.matches.len() - issue_count,
                issue_count
            );
        })
        .inspect_err(|e| {
            tracing::error!(target: BACKEND, error = %e, operation = "reconcile_pdf_procedures", "Reconciliation failed");
        })
}

/// Handler for complete reconciliation workflow: reconcile PDF and group into candidates
#[tauri::command]
#[specta::specta]
pub async fn reconcile_and_create_candidates(
    parse_result: PdfParseResult,
    service: State<'_, Arc<ReconciliationService>>,
    orchestrator: State<'_, Arc<super::FundPaymentReconciliationOrchestrator>>,
) -> Result<ReconcileAndCandidatesResponse, FundPaymentReconciliationError> {
    tracing::info!(target: BACKEND, "Starting complete reconciliation workflow");
    reconcile_and_create_candidates_fn(
        parse_result,
        service.inner().clone(),
        orchestrator.inner().clone(),
    )
    .await
        .inspect(|resp| {
            let issue_count = resp.reconciliation.issue_count();
            tracing::info!(
                target: BACKEND,
                "Workflow complete: {} candidates, {} perfect matches, {} issues",
                resp.candidates.len(),
                resp.reconciliation.matches.len() - issue_count,
                issue_count
            );
        })
        .inspect_err(|e| {
            tracing::error!(target: BACKEND, error = %e, operation = "reconcile_and_create_candidates", "Reconciliation workflow failed");
        })
}

/// Handler for creating fund payment groups from validated reconciliation candidates
#[tauri::command]
#[specta::specta]
pub async fn create_fund_payment_from_candidates(
    request: CreateFundPaymentFromCandidatesRequest,
    orchestrator: tauri::State<'_, std::sync::Arc<super::FundPaymentReconciliationOrchestrator>>,
) -> Result<Vec<crate::context::fund::FundPaymentGroup>, FundPaymentReconciliationError> {
    create_fund_payment_from_candidates_fn(request, orchestrator.inner().clone())
        .await
        .inspect_err(|e| {
            tracing::error!(target: BACKEND, error = %e, operation = "create_fund_payment_from_candidates", "Fund payment creation failed");
        })
}

/// Handler for creating fund payment groups with auto-corrections for anomalies
#[tauri::command]
#[specta::specta]
pub async fn create_fund_payment_with_auto_corrections(
    request: CreateFundPaymentWithAutoCorrectionsRequest,
    patient_service: tauri::State<'_, std::sync::Arc<crate::context::patient::PatientService>>,
    orchestrator: tauri::State<'_, std::sync::Arc<super::FundPaymentReconciliationOrchestrator>>,
) -> Result<Vec<crate::context::fund::FundPaymentGroup>, FundPaymentReconciliationError> {
    create_fund_payment_with_auto_corrections_fn(
        request,
        patient_service.inner().clone(),
        orchestrator.inner().clone(),
    )
    .await
    .inspect_err(|e| {
        tracing::error!(target: BACKEND, error = %e, operation = "create_fund_payment_with_auto_corrections", "Fund payment creation with corrections failed");
    })
}

/// Handler for getting all unreconciled procedures in a date range (for post-reconciliation report)
#[tauri::command]
#[specta::specta]
pub async fn get_unreconciled_procedures_in_range(
    start_date: String,
    end_date: String,
    service: State<'_, Arc<ReconciliationService>>,
) -> Result<Vec<UnreconciledProcedure>, FundPaymentReconciliationError> {
    tracing::info!(
        target: BACKEND,
        "Getting unreconciled procedures from {} to {}",
        start_date,
        end_date
    );
    get_unreconciled_procedures_in_range_fn(start_date, end_date, service.inner().clone())
        .await
        .inspect_err(|e| {
            tracing::error!(target: BACKEND, error = %e, operation = "get_unreconciled_procedures_in_range", "Unreconciled query failed");
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pdf_line(label: &str) -> NormalizedPdfLine {
        let date = NaiveDate::from_ymd_opt(2026, 1, 15).unwrap();
        NormalizedPdfLine {
            line_index: 0,
            payment_date: date,
            invoice_number: format!("{label}-inv"),
            fund_name: label.to_string(),
            patient_name: format!("{label}-patient"),
            ssn: "1234567890123".to_string(),
            nature: "SF".to_string(),
            procedure_start_date: date,
            procedure_end_date: date,
            is_period: false,
            amount: 100,
        }
    }

    fn db_match(id: &str) -> DbMatch {
        DbMatch {
            procedure_id: id.to_string(),
            procedure_date: NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
            fund_id: None,
            amount: Some(100),
            anomalies: vec![],
        }
    }

    #[test]
    fn is_issue_returns_true_only_for_issue_variants() {
        let perfect_single = ReconciliationMatch::PerfectSingleMatch {
            pdf_line: pdf_line("ok"),
            db_match: db_match("p1"),
        };
        let perfect_group = ReconciliationMatch::PerfectGroupMatch {
            pdf_line: pdf_line("ok"),
            db_matches: vec![db_match("p1")],
        };
        let single_issue = ReconciliationMatch::SingleMatchIssue {
            pdf_line: pdf_line("bad"),
            db_match: db_match("p1"),
        };
        let group_issue = ReconciliationMatch::GroupMatchIssue {
            pdf_line: pdf_line("bad"),
            db_matches: vec![db_match("p1")],
        };
        let too_many = ReconciliationMatch::TooManyMatchIssue {
            pdf_line: pdf_line("many"),
            candidate_ids: vec!["a".into(), "b".into()],
        };
        let not_found = ReconciliationMatch::NotFoundIssue {
            pdf_line: pdf_line("missing"),
            nearby_candidates: vec![],
        };

        assert!(!perfect_single.is_issue());
        assert!(!perfect_group.is_issue());
        assert!(single_issue.is_issue());
        assert!(group_issue.is_issue());
        assert!(too_many.is_issue());
        assert!(not_found.is_issue());
    }

    #[test]
    fn issue_count_counts_only_issue_variants() {
        let result = ReconciliationResult {
            matches: vec![
                ReconciliationMatch::PerfectSingleMatch {
                    pdf_line: pdf_line("ok"),
                    db_match: db_match("p1"),
                },
                ReconciliationMatch::SingleMatchIssue {
                    pdf_line: pdf_line("bad"),
                    db_match: db_match("p2"),
                },
                ReconciliationMatch::NotFoundIssue {
                    pdf_line: pdf_line("missing"),
                    nearby_candidates: vec![],
                },
            ],
        };
        assert_eq!(result.issue_count(), 2);
        assert_eq!(
            result.matches.len() - result.issue_count(),
            1,
            "perfect-match count derived correctly"
        );
    }

    #[test]
    fn issue_count_is_zero_for_empty_result() {
        let result = ReconciliationResult { matches: vec![] };
        assert_eq!(result.issue_count(), 0);
    }

    /// A malformed wire date short-circuits to `Task::InvalidDateRange` before
    /// the service (and thus the repository) is ever touched — the mock repos
    /// carry zero expectations, so any DB call would panic the test.
    #[tokio::test]
    async fn get_unreconciled_in_range_invalid_date_returns_typed_error() {
        use crate::context::fund::MockFundRepository;
        use crate::context::procedure::MockProcedureRepository;

        let service = Arc::new(ReconciliationService::new(
            Arc::new(MockProcedureRepository::new()),
            Arc::new(MockFundRepository::new()),
        ));

        let result = get_unreconciled_procedures_in_range_fn(
            "not-a-date".to_string(),
            "2026-01-31".to_string(),
            service,
        )
        .await;

        assert!(
            matches!(
                result,
                Err(FundPaymentReconciliationError::Task(
                    FundPaymentReconciliationTask::InvalidDateRange
                ))
            ),
            "invalid start_date must return InvalidDateRange, got: {result:?}",
        );
    }

    /// Boundary path-validation: a path that is non-existent / outside the
    /// allowed root (or an unresolvable home) is rejected with the typed
    /// `PdfPathRejected` — the new `extract_pdf_text` command error branch.
    #[tokio::test]
    async fn extract_pdf_text_rejects_invalid_path() {
        let result = extract_pdf_text("/no/such/file/at/all.pdf".to_string()).await;

        assert!(
            matches!(
                result,
                Err(FundPaymentReconciliationError::Task(
                    FundPaymentReconciliationTask::PdfPathRejected
                ))
            ),
            "invalid path must return PdfPathRejected, got: {result:?}",
        );
    }
}

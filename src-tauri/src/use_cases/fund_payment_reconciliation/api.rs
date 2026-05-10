use super::output::csv_exporter;
use super::parsing::pdf_extractor;
use super::parsing::pdf_parser;
use super::service::ReconciliationService;
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
    pub procedure_date: String,
    pub amount: i64,
}

/// An unreconciled procedure for the post-reconciliation report
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct UnreconciledProcedure {
    pub procedure_id: String,
    pub patient_name: String,
    pub ssn: String,
    pub procedure_date: String,
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

/// Complete reconciliation result structured as unified matches
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ReconciliationResult {
    /// Unified array of all reconciliation matches (perfect + issues)
    pub matches: Vec<ReconciliationMatch>,
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
) -> anyhow::Result<ReconciliationResult> {
    let response = service.reconcile(parse_result).await?;
    Ok(response.reconciliation)
}

pub async fn reconcile_and_create_candidates_fn(
    parse_result: PdfParseResult,
    service: Arc<ReconciliationService>,
) -> anyhow::Result<ReconcileAndCandidatesResponse> {
    service.reconcile(parse_result).await
}

pub async fn create_fund_payment_from_candidates_fn(
    request: CreateFundPaymentFromCandidatesRequest,
    orchestrator: Arc<super::FundPaymentReconciliationOrchestrator>,
) -> anyhow::Result<Vec<crate::context::fund::FundPaymentGroup>> {
    orchestrator
        .create_multiple_from_candidates(request.candidates)
        .await
}

pub async fn create_fund_payment_with_auto_corrections_fn(
    request: CreateFundPaymentWithAutoCorrectionsRequest,
    patient_service: Arc<crate::context::patient::PatientService>,
    orchestrator: Arc<super::FundPaymentReconciliationOrchestrator>,
) -> anyhow::Result<Vec<crate::context::fund::FundPaymentGroup>> {
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
) -> anyhow::Result<Vec<UnreconciledProcedure>> {
    service
        .find_unreconciled_in_range(&start_date, &end_date)
        .await
}

// ============ Handlers ============

/// Handler for PDF text extraction from file path
#[tauri::command]
#[specta::specta]
pub async fn extract_pdf_text(file_path: String) -> Result<String, String> {
    tracing::info!("Extracting text from PDF");

    let result = pdf_extractor::extract_pdf_text(&file_path)?;

    tracing::info!(
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
pub async fn parse_pdf_text(text: String) -> Result<PdfParseResult, String> {
    tracing::info!(chars = text.len(), "Parsing PDF text");

    let result = pdf_parser::parse_pdf_text(&text);

    tracing::info!(
        groups = result.groups.len(),
        total_lines = result.groups.iter().map(|g| g.lines.len()).sum::<usize>(),
        "PDF text parsed"
    );

    Ok(result)
}

/// Handler for reconciling PDF procedures with database
#[tauri::command]
#[specta::specta]
pub async fn reconcile_pdf_procedures(
    parse_result: PdfParseResult,
    service: State<'_, Arc<ReconciliationService>>,
) -> Result<ReconciliationResult, String> {
    tracing::info!("Starting PDF reconciliation");
    reconcile_pdf_procedures_fn(parse_result, service.inner().clone())
        .await
        .inspect(|result| {
            let issue_count = result
                .matches
                .iter()
                .filter(|m| {
                    matches!(
                        m,
                        ReconciliationMatch::SingleMatchIssue { .. }
                            | ReconciliationMatch::GroupMatchIssue { .. }
                            | ReconciliationMatch::TooManyMatchIssue { .. }
                            | ReconciliationMatch::NotFoundIssue { .. }
                    )
                })
                .count();
            tracing::info!(
                "Reconciliation complete: {} perfect matches, {} issues",
                result.matches.len() - issue_count,
                issue_count
            );
        })
        .map_err(|e| {
            tracing::error!(error = %e, operation = "reconcile_pdf_procedures", "Reconciliation failed");
            format!("{:#}", e)
        })
}

/// Handler for complete reconciliation workflow: reconcile PDF and group into candidates
#[tauri::command]
#[specta::specta]
pub async fn reconcile_and_create_candidates(
    parse_result: PdfParseResult,
    service: State<'_, Arc<ReconciliationService>>,
) -> Result<ReconcileAndCandidatesResponse, String> {
    tracing::info!("Starting complete reconciliation workflow");
    reconcile_and_create_candidates_fn(parse_result, service.inner().clone())
        .await
        .inspect(|resp| {
            let issue_count = resp
                .reconciliation
                .matches
                .iter()
                .filter(|m| {
                    matches!(
                        m,
                        ReconciliationMatch::SingleMatchIssue { .. }
                            | ReconciliationMatch::GroupMatchIssue { .. }
                            | ReconciliationMatch::TooManyMatchIssue { .. }
                            | ReconciliationMatch::NotFoundIssue { .. }
                    )
                })
                .count();
            tracing::info!(
                "Workflow complete: {} candidates, {} perfect matches, {} issues",
                resp.candidates.len(),
                resp.reconciliation.matches.len() - issue_count,
                issue_count
            );
        })
        .map_err(|e| {
            tracing::error!(error = %e, operation = "reconcile_and_create_candidates", "Reconciliation workflow failed");
            format!("{:#}", e)
        })
}

/// Handler for exporting reconciliation results to CSV format
#[tauri::command]
#[specta::specta]
pub async fn export_reconciliation_csv(result: ReconciliationResult) -> Result<String, String> {
    tracing::info!("Exporting reconciliation results to CSV");

    csv_exporter::export_to_csv(&result).inspect(|csv_data| {
        tracing::info!(bytes = csv_data.len(), "CSV export successful");
    })
}

/// Handler for creating fund payment groups from validated reconciliation candidates
#[tauri::command]
#[specta::specta]
pub async fn create_fund_payment_from_candidates(
    request: CreateFundPaymentFromCandidatesRequest,
    orchestrator: tauri::State<'_, std::sync::Arc<super::FundPaymentReconciliationOrchestrator>>,
) -> Result<Vec<crate::context::fund::FundPaymentGroup>, String> {
    create_fund_payment_from_candidates_fn(request, orchestrator.inner().clone())
        .await
        .map_err(|e| format!("{:#}", e))
}

/// Handler for creating fund payment groups with auto-corrections for anomalies
#[tauri::command]
#[specta::specta]
pub async fn create_fund_payment_with_auto_corrections(
    request: CreateFundPaymentWithAutoCorrectionsRequest,
    patient_service: tauri::State<'_, std::sync::Arc<crate::context::patient::PatientService>>,
    orchestrator: tauri::State<'_, std::sync::Arc<super::FundPaymentReconciliationOrchestrator>>,
) -> Result<Vec<crate::context::fund::FundPaymentGroup>, String> {
    create_fund_payment_with_auto_corrections_fn(
        request,
        patient_service.inner().clone(),
        orchestrator.inner().clone(),
    )
    .await
    .map_err(|e| format!("{:#}", e))
}

/// Handler for getting all unreconciled procedures in a date range (for post-reconciliation report)
#[tauri::command]
#[specta::specta]
pub async fn get_unreconciled_procedures_in_range(
    start_date: String,
    end_date: String,
    service: State<'_, Arc<ReconciliationService>>,
) -> Result<Vec<UnreconciledProcedure>, String> {
    tracing::info!(
        "Getting unreconciled procedures from {} to {}",
        start_date,
        end_date
    );
    get_unreconciled_procedures_in_range_fn(start_date, end_date, service.inner().clone())
        .await
        .map_err(|e| format!("{:#}", e))
}

/// Response for the edit modal: procedures in the group + procedures available to add
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FundPaymentGroupEditData {
    /// Procedures currently in the group (Reconciled / PartiallyReconciled)
    pub current_procedures: Vec<crate::context::procedure::Procedure>,
    /// Created procedures for the same fund not yet in the group
    pub available_procedures: Vec<crate::context::procedure::Procedure>,
}

/// Tauri command: Get edit data for a fund payment group
///
/// Returns two classified lists server-side so the frontend only handles display:
/// - `current_procedures`: in the group (Reconciled / PartiallyReconciled)
/// - `available_procedures`: Created procedures for the same fund, not in the group
#[tauri::command]
#[specta::specta]
pub async fn get_fund_payment_group_edit_data(
    group_id: String,
    fund_id: String,
    fund_service: State<'_, Arc<crate::context::fund::FundService>>,
    fund_payment_service: State<'_, Arc<crate::context::fund::FundPaymentService>>,
    procedure_service: State<'_, Arc<crate::context::procedure::ProcedureService>>,
    event_bus: State<'_, Arc<crate::core::event_bus::EventBus>>,
) -> Result<FundPaymentGroupEditData, String> {
    tracing::info!(
        group_id = %group_id,
        fund_id = %fund_id,
        "Processing get fund payment group edit data request"
    );

    let orchestrator = super::FundPaymentReconciliationOrchestrator::new(
        fund_service.inner().clone(),
        procedure_service.inner().clone(),
        fund_payment_service.inner().clone(),
        event_bus.inner().clone(),
    );

    let (current_procedures, available_procedures) = orchestrator
        .get_group_edit_data(&group_id, &fund_id)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "Failed to get fund payment group edit data");
            format!("{:#}", e)
        })?;

    tracing::info!(
        group_id = %group_id,
        current_count = current_procedures.len(),
        available_count = available_procedures.len(),
        "Fund payment group edit data retrieved successfully"
    );

    Ok(FundPaymentGroupEditData {
        current_procedures,
        available_procedures,
    })
}

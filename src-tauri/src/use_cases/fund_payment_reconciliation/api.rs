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

/// A normalized PDF procedure line — the ONE domain object for reconciliation.
///
/// All dates are NaiveDate (serialized as ISO YYYY-MM-DD via serde/specta).
/// Produced by the parser after normalization; used throughout the backend
/// and sent to the frontend via Tauri/Specta.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct NormalizedPdfLine {
    /// Unique index of the line in the original PDF
    pub line_index: u32,
    /// Payment date
    #[specta(type = String)]
    pub payment_date: NaiveDate,
    /// Invoice number
    pub invoice_number: String,
    /// Fund/organism name (e.g., "CPAM n° 931")
    pub fund_name: String,
    /// Patient name as registered with the fund
    pub patient_name: String,
    /// Social security number (13 digits)
    pub ssn: String,
    /// Nature of the act (e.g., "SF")
    pub nature: String,
    /// Start date of the act or period
    #[specta(type = String)]
    pub procedure_start_date: NaiveDate,
    /// End date (same as start for single-date acts)
    #[specta(type = String)]
    pub procedure_end_date: NaiveDate,
    /// True if this line covers a period (start ≠ end)
    pub is_period: bool,
    /// Amount in millièmes (e.g. 1234 = 1.234 €)
    pub amount: i64,
}

/// A group of procedure lines paid by the same fund on the same date
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct PdfProcedureGroup {
    /// Fund short label from data lines (e.g., "CPAM n° 931")
    pub fund_label: String,
    /// Full fund description from the total line
    pub fund_full_name: String,
    /// Payment date for this group
    #[specta(type = String)]
    pub payment_date: NaiveDate,
    /// Total amount stated in the PDF (millièmes)
    pub total_amount: i64,
    /// Whether the sum of line amounts matches the stated total
    pub is_total_valid: bool,
    /// Individual procedure lines in this group
    pub lines: Vec<NormalizedPdfLine>,
}

/// Complete parse result for a PDF statement
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct PdfParseResult {
    /// All procedure groups found in the document
    pub groups: Vec<PdfProcedureGroup>,
    /// Number of lines that could not be parsed
    pub unparsed_line_count: u32,
    /// Sample unparsed lines for debugging (max 5)
    pub unparsed_lines: Vec<String>,
}

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
        procedure_amount: i64,
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
    /// Contest the fund payment amount: keep procedure_amount unchanged,
    /// set actual_payment_amount to the PDF amount (what the fund claims to have paid).
    /// Sets payment_status to PartiallyReconciled.
    ContestAmount {
        procedure_id: String,
        /// Amount actually paid by the fund (from PDF), in millièmes
        actual_payment_amount: i64,
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
    tracing::info!("Extracting text from PDF: {}", file_path);

    let result = pdf_extractor::extract_pdf_text(&file_path)?;

    tracing::info!(
        "Successfully extracted {} characters from PDF",
        result.len()
    );

    Ok(result)
}

/// Handler for PDF text extraction from bytes
#[tauri::command]
#[specta::specta]
pub async fn extract_pdf_text_from_bytes(bytes: Vec<u8>) -> Result<String, String> {
    tracing::info!("Extracting text from PDF bytes ({} bytes)", bytes.len());

    let result = pdf_extractor::extract_pdf_text_from_bytes(&bytes)?;

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
    tracing::info!("Parsing PDF text ({} characters)", text.len());

    let result = pdf_parser::parse_pdf_text(&text);

    tracing::info!(
        "Parsed {} groups with {} total lines",
        result.groups.len(),
        result.groups.iter().map(|g| g.lines.len()).sum::<usize>()
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
            tracing::error!("Reconciliation failed: {:#}", e);
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
            tracing::error!("Reconciliation workflow failed: {:#}", e);
            format!("{:#}", e)
        })
}

/// Handler for exporting reconciliation results to CSV format
#[tauri::command]
#[specta::specta]
pub async fn export_reconciliation_csv(result: ReconciliationResult) -> Result<String, String> {
    tracing::info!("Exporting reconciliation results to CSV");

    csv_exporter::export_to_csv(&result).inspect(|csv_data| {
        tracing::info!("CSV export successful ({} bytes)", csv_data.len());
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

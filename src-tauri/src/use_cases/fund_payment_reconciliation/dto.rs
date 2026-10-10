//! Types the core and the command adapters both use: they live in the core (B47).

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use specta::Type;

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

/// A group of the PDF the import leaves out because its stated total is not
/// positive: the fund takes money back (FPA-070). It is named to the user, who
/// records it by hand; nothing of it is matched or created.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct LeftOutPdfGroup {
    /// Fund label as the PDF states it
    pub fund_label: String,
    #[specta(type = String)]
    pub payment_date: NaiveDate,
    /// Total stated in the PDF (thousandths of a euro), zero or negative
    pub total_amount: i64,
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
    /// Groups left out of the import (FPA-070), in the order of the PDF.
    pub left_out_groups: Vec<LeftOutPdfGroup>,
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

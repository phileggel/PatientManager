use serde::Serialize;
use specta::Type;
use thiserror::Error;

use crate::context::bank::BankError;
use crate::context::fund::FundError;

/// Use-case-specific guards for bank-statement reconciliation.
///
/// Codes that do NOT belong to any single bounded context: the PDF parse /
/// path-validation pipeline failures, the R26 "no SEPA credit lines" halt (the
/// frontend keys its dedicated guidance on this code), the confirmed-match date
/// guard, and the catch-all for the use-case-owned label-mapping repository's
/// infra failures. Tagged with `code` so each variant emits `{ "code": "..." }`.
#[derive(Debug, Clone, Error, Serialize, Type)]
#[serde(tag = "code")]
pub enum BankStatementReconciliationTask {
    /// R26 — the parsed statement contains no actionable VIR SEPA credit lines.
    /// The frontend matches on this code to show dedicated "no SEPA lines"
    /// guidance instead of the generic error.
    #[error("The bank statement contains no VIR SEPA credit lines")]
    NoSepaCreditLines,

    /// The user home directory could not be resolved, so the upload path cannot
    /// be sandbox-validated.
    #[error("Cannot resolve the user home directory")]
    HomeDirUnresolved,

    /// The supplied statement path failed sandbox validation (outside the
    /// allowed root, wrong extension, missing file, traversal). Detail is logged
    /// at the call site; the wire carries no path.
    #[error("The bank statement file path was rejected")]
    PathRejected,

    /// PDF text extraction failed after the path passed validation (corrupt or
    /// unreadable PDF).
    #[error("Could not extract text from the bank statement PDF")]
    PdfExtractionFailed,

    /// A confirmed match carried a date that does not parse as `YYYY-MM-DD`.
    #[error("A confirmed match has an invalid date")]
    InvalidConfirmedMatchDate,

    /// BAS-094 — the sum of groups assigned to a line would exceed the line
    /// amount. The correction is rejected; the reconciliation is left unchanged.
    #[error("Assigned groups total exceeds the line amount")]
    AssignmentOverflow,

    /// BAS-090 — a group does not meet the fund/date/already-settled eligibility
    /// criteria for the target line. The correction is rejected.
    #[error("Group is not eligible for this line")]
    GroupNotEligible,

    /// BAS-067 — a group has already been consumed by another line and cannot
    /// be assigned a second time.
    #[error("Group has already been consumed by another line")]
    GroupAlreadyConsumed,

    /// The `line_id` supplied in a correction does not match any line in the
    /// current reconciliation (stale or malformed client state).
    #[error("Line not found in the current reconciliation")]
    LineNotFound,

    /// The `fund_id` supplied in a `LinkFund` correction does not correspond to
    /// any known fund.
    #[error("Fund not found")]
    FundNotFound,

    /// Failure from the use-case-owned label-mapping repository. Logged at the
    /// call site via `tracing::error!`; the wire carries no detail.
    #[error("An unexpected database error occurred")]
    DatabaseError,
}

/// Composite error for the bank-statement reconciliation use case.
///
/// Holds ONLY `#[from]` wrappers — the two bounded-context enums it orchestrates
/// (bank + fund) plus the use-case task sub-enum. Each carries its own
/// `#[serde(tag = "code")]`, so the untagged composite flattens to a single
/// `{ "code": "...", ... }` payload on the wire.
///
/// Each BC enum + the Task sub-enum emit `{ "code": "DatabaseError" }` for their
/// infra catch-all; the collision is intentional — the frontend maps the single
/// code to one message.
#[derive(Debug, Error, Serialize, Type)]
#[serde(untagged)]
pub enum BankStatementReconciliationError {
    #[error(transparent)]
    Bank(#[from] BankError),

    #[error(transparent)]
    Fund(#[from] FundError),

    #[error(transparent)]
    Task(#[from] BankStatementReconciliationTask),
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, to_value};

    #[test]
    fn each_variant_emits_a_code() {
        for (err, code) in [
            (
                BankStatementReconciliationTask::NoSepaCreditLines,
                "NoSepaCreditLines",
            ),
            (
                BankStatementReconciliationTask::HomeDirUnresolved,
                "HomeDirUnresolved",
            ),
            (
                BankStatementReconciliationTask::PathRejected,
                "PathRejected",
            ),
            (
                BankStatementReconciliationTask::PdfExtractionFailed,
                "PdfExtractionFailed",
            ),
            (
                BankStatementReconciliationTask::InvalidConfirmedMatchDate,
                "InvalidConfirmedMatchDate",
            ),
            (
                BankStatementReconciliationTask::AssignmentOverflow,
                "AssignmentOverflow",
            ),
            (
                BankStatementReconciliationTask::GroupNotEligible,
                "GroupNotEligible",
            ),
            (
                BankStatementReconciliationTask::GroupAlreadyConsumed,
                "GroupAlreadyConsumed",
            ),
            (
                BankStatementReconciliationTask::LineNotFound,
                "LineNotFound",
            ),
            (
                BankStatementReconciliationTask::FundNotFound,
                "FundNotFound",
            ),
            (
                BankStatementReconciliationTask::DatabaseError,
                "DatabaseError",
            ),
        ] {
            let composite: BankStatementReconciliationError = err.into();
            assert_eq!(to_value(&composite).unwrap(), json!({ "code": code }));
        }

        // BC-wrapped variants flatten through the untagged composite, payload intact.
        let bank: BankStatementReconciliationError = BankError::TransferNotFound {
            bank_transfer_id: "bt-1".into(),
        }
        .into();
        assert_eq!(
            to_value(&bank).unwrap(),
            json!({ "code": "TransferNotFound", "bank_transfer_id": "bt-1" }),
        );

        let fund: BankStatementReconciliationError = FundError::PaymentGroupNotFound {
            fund_payment_group_id: "fpg-1".into(),
        }
        .into();
        assert_eq!(
            to_value(&fund).unwrap(),
            json!({ "code": "PaymentGroupNotFound", "fund_payment_group_id": "fpg-1" }),
        );

        // Intentional collision: BC enums and the Task catch-all share DatabaseError.
        let bank_db: BankStatementReconciliationError = BankError::DatabaseError.into();
        let task_db: BankStatementReconciliationError =
            BankStatementReconciliationTask::DatabaseError.into();
        assert_eq!(to_value(&bank_db).unwrap(), to_value(&task_db).unwrap());
    }
}

use serde::Serialize;
use specta::Type;
use thiserror::Error;

use crate::context::procedure::ProcedureError;

/// Use-case-specific guards and catch-alls for the overpayment use case.
///
/// Tagged with `code` so each variant emits `{ "code": "..." }` on the wire.
/// The frontend narrows on `code` per F27.
#[derive(Debug, Clone, PartialEq, Error, Serialize, Type)]
#[serde(tag = "code")]
pub enum OverpaymentTask {
    /// Source procedure not found by id (create or cancel path).
    #[error("Source procedure not found: {id}")]
    SourceProcedureNotFound { id: String },

    /// REF-010 — source procedure status is not eligible for a refund.
    #[error("Source procedure is not eligible for a refund")]
    SourceNotRefundable,

    /// REF-030 — refund_date is malformed, in the future, or before the
    /// source procedure's confirmed_payment_date.
    #[error("Invalid refund date")]
    InvalidRefundDate,

    /// REF-040 — reason string exceeds 255 characters.
    #[error("Reason must not exceed 255 characters")]
    ReasonTooLong,

    /// REF-060 — transfer_type is not accepted for refunds ("Cash", "Fund",
    /// or an unknown value).
    #[error("Transfer type is not accepted for refunds")]
    TransferTypeRejected,

    /// REF-070 — bank_account_id was provided as empty.
    #[error("Bank account ID is required")]
    BankAccountRequired,

    /// REF-070 — bank_account_id was provided but the account does not exist.
    #[error("Bank account not found: {id}")]
    BankAccountNotFound { id: String },

    /// The source procedure has no associated fund — cannot create the refund
    /// FundPaymentGroup.
    #[error("Source procedure has no fund: {id}")]
    SourceHasNoFund { id: String },

    /// REF-240 — the fund payment group belongs to an overpayment refund and
    /// must be removed via cancel, not direct deletion.
    #[error("Fund payment group is protected by an overpayment refund")]
    RefundGroupProtected,

    /// Cancel path (REF-210) — no overpayment record was found for the given
    /// source_procedure_id.
    #[error("Overpayment refund record not found")]
    RefundRecordNotFound,

    /// Failure from a repository or service the orchestrator delegates to.
    /// Logged at the call site; the wire surface carries no detail.
    #[error("An unexpected database error occurred")]
    DatabaseError,
}

/// Composite error for the overpayment use case.
///
/// `ProcedureError` is included because the orchestrator delegates procedure
/// creation, update, and deletion to `ProcedureService`, whose typed errors
/// are already FE-meaningful (e.g. `ProcedureNotFound` when the source
/// procedure vanishes mid-flight). All other BC service failures (fund,
/// bank) collapse to `OverpaymentTask::DatabaseError`.
///
/// Both arms may emit `{ "code": "DatabaseError" }` — collision intentional,
/// see `docs/techdebt.md`.
#[derive(Debug, Error, Serialize, Type)]
#[serde(untagged)]
pub enum OverpaymentError {
    #[error(transparent)]
    Procedure(#[from] ProcedureError),

    #[error(transparent)]
    Task(#[from] OverpaymentTask),
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, to_value};

    #[test]
    fn each_variant_emits_a_code() {
        // BC-wrapped variant via #[from] ProcedureError.
        let proc_not_found: OverpaymentError = ProcedureError::ProcedureNotFound {
            procedure_id: "p-1".into(),
        }
        .into();
        assert_eq!(
            to_value(&proc_not_found).unwrap(),
            json!({ "code": "ProcedureNotFound", "procedure_id": "p-1" }),
        );

        // OverpaymentTask variants with payloads.
        let source_not_found: OverpaymentError = OverpaymentTask::SourceProcedureNotFound {
            id: "proc-1".into(),
        }
        .into();
        assert_eq!(
            to_value(&source_not_found).unwrap(),
            json!({ "code": "SourceProcedureNotFound", "id": "proc-1" }),
        );

        let bank_not_found: OverpaymentError =
            OverpaymentTask::BankAccountNotFound { id: "acc-1".into() }.into();
        assert_eq!(
            to_value(&bank_not_found).unwrap(),
            json!({ "code": "BankAccountNotFound", "id": "acc-1" }),
        );

        let no_fund: OverpaymentError = OverpaymentTask::SourceHasNoFund {
            id: "proc-1".into(),
        }
        .into();
        assert_eq!(
            to_value(&no_fund).unwrap(),
            json!({ "code": "SourceHasNoFund", "id": "proc-1" }),
        );

        // Unit variants must still emit their code (never null).
        let cases: &[(&str, OverpaymentError)] = &[
            (
                "SourceNotRefundable",
                OverpaymentTask::SourceNotRefundable.into(),
            ),
            (
                "InvalidRefundDate",
                OverpaymentTask::InvalidRefundDate.into(),
            ),
            ("ReasonTooLong", OverpaymentTask::ReasonTooLong.into()),
            (
                "TransferTypeRejected",
                OverpaymentTask::TransferTypeRejected.into(),
            ),
            (
                "BankAccountRequired",
                OverpaymentTask::BankAccountRequired.into(),
            ),
            (
                "RefundGroupProtected",
                OverpaymentTask::RefundGroupProtected.into(),
            ),
            (
                "RefundRecordNotFound",
                OverpaymentTask::RefundRecordNotFound.into(),
            ),
            ("DatabaseError", OverpaymentTask::DatabaseError.into()),
        ];
        for (code, variant) in cases {
            assert_eq!(
                to_value(variant).unwrap(),
                json!({ "code": code }),
                "variant {code} must serialize to {{\"code\": \"{code}\"}}",
            );
        }

        // Intentional collision: ProcedureError::DatabaseError also emits
        // { "code": "DatabaseError" }, matching OverpaymentTask::DatabaseError.
        let bc_db: OverpaymentError = ProcedureError::DatabaseError.into();
        let task_db: OverpaymentError = OverpaymentTask::DatabaseError.into();
        assert_eq!(
            to_value(&bc_db).unwrap(),
            json!({ "code": "DatabaseError" })
        );
        assert_eq!(
            to_value(&task_db).unwrap(),
            json!({ "code": "DatabaseError" })
        );
        assert_eq!(to_value(&bc_db).unwrap(), to_value(&task_db).unwrap());
    }
}

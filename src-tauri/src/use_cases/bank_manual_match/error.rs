use serde::Serialize;
use specta::Type;
use thiserror::Error;

use crate::context::bank::BankError;
use crate::context::fund::FundError;
use crate::context::procedure::ProcedureError;

/// Use-case-specific guards for manual bank-transfer matching.
///
/// The single guard that does NOT belong to any one bounded context: R4's
/// immutable-type cross-check, which rejects driving a FUND transfer through a
/// direct-payment command (or vice versa). Tagged with `code` so the variant
/// emits `{ "code": "WrongTransferType" }` on the wire.
#[derive(Debug, Clone, Error, Serialize, Type)]
#[serde(tag = "code")]
pub enum BankManualMatchTask {
    /// R4 — the targeted transfer's type does not match the command: a FUND
    /// transfer was passed to a direct-payment operation, or a direct transfer
    /// to a FUND operation. The matching-typed command must be used instead.
    #[error("Transfer type does not match the requested operation")]
    WrongTransferType,
}

/// Composite error for the manual bank-transfer matching use case.
///
/// Holds ONLY `#[from]` wrappers — the three bounded-context enums it
/// orchestrates (bank + fund + procedure) plus the use-case task sub-enum. Each
/// carries its own `#[serde(tag = "code")]`, so the untagged composite flattens
/// to a single `{ "code": "...", ... }` payload on the wire.
///
/// Each BC enum emits `{ "code": "DatabaseError" }` for its infra catch-all; the
/// collision is intentional — the frontend maps the single code to one message.
/// See `fund_payment_manual_management/error.rs` for the same precedent.
#[derive(Debug, Error, Serialize, Type)]
#[serde(untagged)]
pub enum BankManualMatchError {
    #[error(transparent)]
    Bank(#[from] BankError),

    #[error(transparent)]
    Fund(#[from] FundError),

    #[error(transparent)]
    Procedure(#[from] ProcedureError),

    #[error(transparent)]
    Task(#[from] BankManualMatchTask),
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, to_value};

    #[test]
    fn each_variant_emits_a_code() {
        // Task guard must emit its code (never null under the untagged composite).
        let wrong_type: BankManualMatchError = BankManualMatchTask::WrongTransferType.into();
        assert_eq!(
            to_value(&wrong_type).unwrap(),
            json!({ "code": "WrongTransferType" }),
        );

        // BC-wrapped variants flatten through the untagged composite, payload intact.
        let transfer_not_found: BankManualMatchError = BankError::TransferNotFound {
            bank_transfer_id: "bt-7".into(),
        }
        .into();
        assert_eq!(
            to_value(&transfer_not_found).unwrap(),
            json!({ "code": "TransferNotFound", "bank_transfer_id": "bt-7" }),
        );

        let group_not_found: BankManualMatchError = FundError::PaymentGroupNotFound {
            fund_payment_group_id: "fpg-7".into(),
        }
        .into();
        assert_eq!(
            to_value(&group_not_found).unwrap(),
            json!({ "code": "PaymentGroupNotFound", "fund_payment_group_id": "fpg-7" }),
        );

        let procedure_not_found: BankManualMatchError = ProcedureError::ProcedureNotFound {
            procedure_id: "proc-1".into(),
        }
        .into();
        assert_eq!(
            to_value(&procedure_not_found).unwrap(),
            json!({ "code": "ProcedureNotFound", "procedure_id": "proc-1" }),
        );

        // Intentional collision: every BC enum's infra catch-all emits the same
        // `{ "code": "DatabaseError" }` on the wire.
        let bank_db: BankManualMatchError = BankError::DatabaseError.into();
        let fund_db: BankManualMatchError = FundError::DatabaseError.into();
        let proc_db: BankManualMatchError = ProcedureError::DatabaseError.into();
        assert_eq!(to_value(&bank_db).unwrap(), to_value(&fund_db).unwrap());
        assert_eq!(to_value(&fund_db).unwrap(), to_value(&proc_db).unwrap());
        assert_eq!(
            to_value(&bank_db).unwrap(),
            json!({ "code": "DatabaseError" })
        );
    }
}

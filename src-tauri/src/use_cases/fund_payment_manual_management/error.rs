use serde::Serialize;
use specta::Type;
use thiserror::Error;

use crate::context::fund::FundError;
use crate::context::procedure::ProcedureError;

/// Use-case-specific guards for manual fund-payment-group management.
///
/// Codes that do NOT belong to any single bounded context: the
/// state-dependent "group is locked by bank-reconciled procedures" guard.
/// Tagged with `code` so each variant emits `{ "code": "..." }`.
#[derive(Debug, Clone, Error, Serialize, Type)]
#[serde(tag = "code")]
pub enum FundPaymentManualManagementTask {
    /// The group contains bank-reconciled procedures (`FundPaid` /
    /// `PartiallyFundPaid`); it cannot be modified or deleted (R9).
    #[error("The fund payment group contains bank-reconciled procedures")]
    GroupLocked,
}

/// Composite error for the manual fund-payment-management use case.
///
/// Holds ONLY `#[from]` wrappers — the two bounded-context enums it
/// orchestrates (fund + procedure) plus the use-case task sub-enum. Each
/// carries its own `#[serde(tag = "code")]`, so the untagged composite
/// flattens to a single `{ "code": "...", ... }` payload on the wire.
///
/// Both BC enums can emit `{ "code": "DatabaseError" }`; the collision is
/// intentional — the frontend maps the single
/// code to one message. See `fund_payment_reconciliation/error.rs` for the same
/// precedent.
#[derive(Debug, Error, Serialize, Type)]
#[serde(untagged)]
pub enum FundPaymentManualManagementError {
    #[error(transparent)]
    Fund(#[from] FundError),

    #[error(transparent)]
    Procedure(#[from] ProcedureError),

    #[error(transparent)]
    Task(#[from] FundPaymentManualManagementTask),
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, to_value};

    #[test]
    fn each_variant_emits_a_code() {
        // The Task unit variant emits its code (never null).
        let locked: FundPaymentManualManagementError =
            FundPaymentManualManagementTask::GroupLocked.into();
        assert_eq!(to_value(&locked).unwrap(), json!({ "code": "GroupLocked" }));

        // BC-wrapped variants flatten through the untagged composite.
        let fund: FundPaymentManualManagementError = FundError::PaymentGroupNotFound {
            fund_payment_group_id: "fpg-7".into(),
        }
        .into();
        assert_eq!(
            to_value(&fund).unwrap(),
            json!({ "code": "PaymentGroupNotFound", "fund_payment_group_id": "fpg-7" }),
        );

        let procedure: FundPaymentManualManagementError = ProcedureError::ProcedureNotFound {
            procedure_id: "proc-1".into(),
        }
        .into();
        assert_eq!(
            to_value(&procedure).unwrap(),
            json!({ "code": "ProcedureNotFound", "procedure_id": "proc-1" }),
        );

        // Intentional collision: each BC enum emits the same
        // `{ "code": "DatabaseError" }` on the wire.
        let fund_db: FundPaymentManualManagementError = FundError::DatabaseError.into();
        let procedure_db: FundPaymentManualManagementError = ProcedureError::DatabaseError.into();
        assert_eq!(
            to_value(&fund_db).unwrap(),
            to_value(&procedure_db).unwrap()
        );
    }
}

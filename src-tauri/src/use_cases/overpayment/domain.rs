use serde::{Deserialize, Serialize};
use specta::Type;

use crate::context::procedure::ProcedureStatus;

/// Request DTO for creating an overpayment refund (REF-050 through REF-160).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CreateOverpaymentRequest {
    pub source_procedure_id: String,
    /// ISO date string (YYYY-MM-DD) — validated against REF-030.
    pub refund_date: String,
    /// Domain enum name: "CreditCard", "Check", or "OutgoingWire" (REF-060).
    pub transfer_type: String,
    /// Bank account to use for the refund bank transfer (REF-070).
    pub bank_account_id: String,
    /// Optional free-text reason, max 255 chars (REF-040).
    pub reason: Option<String>,
}

/// Request DTO for cancelling an overpayment (REF-210).
/// The frontend always passes the source_procedure_id as identifier.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CancelOverpaymentRequest {
    pub source_procedure_id: String,
}

/// DTO for surfacing ProcedureRefund data to the frontend.
/// Used when the OverpaymentRefund modal needs to resolve source_procedure_id (REF-200).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ProcedureRefundInfo {
    pub id: String,
    pub source_procedure_id: String,
    pub refund_procedure_id: String,
    pub refund_date: String,
    pub reason: Option<String>,
    pub previous_payment_status: ProcedureStatus,
}

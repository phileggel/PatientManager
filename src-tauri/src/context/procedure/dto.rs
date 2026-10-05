//! Types the core and the command adapters both use: they live in the core (B47).

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use specta::Type;

/// Raw procedure type data from frontend (unvalidated)
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct RawProcedureType {
    pub id: String,
    pub name: String,
    pub default_amount: i64,
    pub category: Option<String>,
}

/// Candidate procedure for batch creation and validation for orchestrators
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ProcedureCandidate {
    pub patient_id: String,
    pub fund_id: Option<String>,
    pub procedure_type_id: String,
    #[specta(type = String)]
    pub procedure_date: NaiveDate,
    pub billed_amount: i64,
    pub payment_method: Option<String>,
    #[specta(type = Option<String>)]
    pub confirmed_payment_date: Option<NaiveDate>,
    pub paid_amount: Option<i64>,
    pub awaited_amount: Option<i64>,
}

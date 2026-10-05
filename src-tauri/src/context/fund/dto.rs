//! Types the core and the command adapters both use: they live in the core (B47).

use serde::{Deserialize, Serialize};
use specta::Type;

/// Fund candidate for batch import - semantically different from Fund (lacks ID, created_at)
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FundCandidate {
    pub temp_id: String,
    pub fund_identifier: String,
    pub fund_name: String,
}

/// Fund payment group candidate created from PDF reconciliation data
/// Groups matched procedures by (fund_id + payment_date)
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FundPaymentGroupCandidate {
    /// Fund identifier from PDF (e.g., "CPAM n° 931")
    pub fund_label: String,
    /// Payment date (serialized as ISO string YYYY-MM-DD for frontend)
    #[specta(type = String)]
    pub payment_date: chrono::NaiveDate,
    /// Total amount stated in PDF for this group
    pub total_amount: i64,
    /// List of matched procedure IDs for this group
    pub procedure_ids: Vec<String>,
    /// Sum of matched procedure amounts
    pub matched_amount: i64,
    /// Coverage status: is matched_amount == total_amount?
    pub is_fully_covered: bool,
}

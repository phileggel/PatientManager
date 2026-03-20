/// Bank manual match use case
///
/// Handles creating, updating, and deleting bank transfers with manual
/// selection of fund payment groups (FUND) or procedures (direct payments).
mod api;
mod orchestrator;

pub use api::*;
pub use orchestrator::{
    BankManualMatchOrchestrator, BankManualMatchResult, DirectPaymentProcedureCandidate,
    FundGroupCandidate,
};

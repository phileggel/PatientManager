/// Bank manual match use case
///
/// Handles creating, updating, and deleting bank transfers with manual
/// selection of fund payment groups (FUND) or procedures (direct payments).
mod api;
mod error;
mod orchestrator;

pub use api::*;
pub use error::{BankManualMatchError, BankManualMatchTask};
pub use orchestrator::{
    BankManualMatchOrchestrator, BankManualMatchResult, DirectPaymentProcedureCandidate,
    FundGroupCandidate,
};

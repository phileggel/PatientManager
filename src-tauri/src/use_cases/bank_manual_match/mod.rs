/// Bank manual match use case
///
/// Handles creating, updating, and deleting bank transfers with manual
/// selection of fund payment groups (FUND) or procedures (direct payments).
#[cfg(feature = "app")]
mod api;
mod error;
mod orchestrator;
mod sqlx_uow;
mod uow;

#[cfg(feature = "app")]
pub use api::*;
pub use error::{BankManualMatchError, BankManualMatchTask};
pub use orchestrator::{
    BankManualMatchOrchestrator, BankManualMatchResult, DirectPaymentProcedureCandidate,
    FundGroupCandidate,
};
pub use uow::{
    GroupSettlementOperation, GroupSettlementTransactionManager, GroupSettlementUnitOfWork,
};

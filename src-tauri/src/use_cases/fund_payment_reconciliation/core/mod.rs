/// Core reconciliation algorithm (pure matching logic)
pub mod processor;
pub mod types;

pub use processor::ReconciliationProcessor;
pub use types::{InternalAmount, MAX_GROUP_CANDIDATES};

/// Core types for reconciliation
pub const MAX_GROUP_CANDIDATES: usize = 8;
pub const MAX_SUBSET_CANDIDATES: usize = 15;

/// Monetary amount with fixed precision to avoid floating point errors
/// Internally stored as thousandths (1/1000) to preserve precision
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct InternalAmount(pub i64);

impl InternalAmount {
    /// Create from f64 euros (used by tests for convenient initialization)
    #[cfg(test)]
    pub fn from_f64(amount: f64) -> Self {
        Self((amount * 1000.0_f64).round() as i64)
    }

    pub fn to_f64(self) -> f64 {
        self.0 as f64 / 1000.0
    }
}

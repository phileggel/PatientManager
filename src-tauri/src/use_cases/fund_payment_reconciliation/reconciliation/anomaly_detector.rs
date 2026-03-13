/// Anomaly detection during reconciliation
use crate::use_cases::fund_payment_reconciliation::data::FundCache;

/// Detects anomalies between PDF data and database procedures
pub struct AnomalyDetector<'a> {
    pub fund_cache: &'a FundCache,
}

impl<'a> AnomalyDetector<'a> {
    pub fn new(fund_cache: &'a FundCache) -> Self {
        Self { fund_cache }
    }
}

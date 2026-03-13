/// Fund caching to eliminate N+1 queries
use crate::context::fund::{AffiliatedFund, FundRepository};
use crate::context::procedure::Procedure;
use crate::use_cases::fund_payment_reconciliation::api::{AnomalyType, NormalizedPdfLine};
use std::collections::HashMap;
use std::sync::Arc;

/// Cache of all funds loaded at reconciliation start
pub struct FundCache {
    cache: HashMap<String, AffiliatedFund>,
}

impl FundCache {
    /// Build fund cache by loading all funds once
    /// Instead of calling fund_repository.read_fund() N times, load all once
    pub async fn build(fund_repository: Arc<dyn FundRepository>) -> anyhow::Result<Self> {
        tracing::debug!("Building fund cache (single query instead of N lookups)");

        let all_funds = fund_repository.read_all_funds().await?;
        let mut cache = HashMap::new();

        for fund in all_funds {
            cache.insert(fund.id.clone(), fund);
        }

        tracing::info!(
            fund_count = cache.len(),
            "Fund cache built with {} funds",
            cache.len()
        );

        Ok(Self { cache })
    }

    /// Check fund anomaly using pre-loaded cache instead of DB lookup
    /// This replaces check_fund_anomaly() in reconciliation to avoid N+1 queries
    pub fn check_fund_anomaly(
        &self,
        pdf_line: &NormalizedPdfLine,
        procedure: &Procedure,
    ) -> Option<AnomalyType> {
        if let Some(db_fund_id) = &procedure.fund_id {
            if let Some(fund) = self.cache.get(db_fund_id) {
                let fund_matches = pdf_line.fund_name.contains(&fund.name)
                    || pdf_line.fund_name.contains(&fund.fund_identifier);
                if !fund_matches {
                    return Some(AnomalyType::FundMismatch);
                }
            }
        }
        None
    }
}

#[cfg(test)]
impl FundCache {
    /// Helper for creating test fixtures with predefined funds
    pub fn for_test(funds: Vec<AffiliatedFund>) -> Self {
        let mut cache = HashMap::new();
        for fund in funds {
            cache.insert(fund.id.clone(), fund);
        }
        Self { cache }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::context::fund::FundRepository;
    use async_trait::async_trait;

    struct MockFundRepository {
        funds: Vec<AffiliatedFund>,
    }

    #[async_trait]
    impl FundRepository for MockFundRepository {
        async fn create_fund(&self, _: &str, _: &str) -> anyhow::Result<AffiliatedFund> {
            unimplemented!()
        }
        async fn read_fund(&self, _: &str) -> anyhow::Result<Option<AffiliatedFund>> {
            unimplemented!()
        }
        async fn read_all_funds(&self) -> anyhow::Result<Vec<AffiliatedFund>> {
            Ok(self.funds.clone())
        }
        async fn update_fund(&self, _: AffiliatedFund) -> anyhow::Result<AffiliatedFund> {
            unimplemented!()
        }
        async fn delete_fund(&self, _: &str) -> anyhow::Result<()> {
            unimplemented!()
        }
        async fn find_fund_by_identifier(&self, _: &str) -> anyhow::Result<Option<AffiliatedFund>> {
            unimplemented!()
        }
        async fn create_batch(
            &self,
            _: Vec<AffiliatedFund>,
        ) -> anyhow::Result<Vec<AffiliatedFund>> {
            unimplemented!()
        }
    }

    fn create_pdf_line(fund_name: &str) -> NormalizedPdfLine {
        use chrono::NaiveDate;
        NormalizedPdfLine {
            line_index: 0,
            payment_date: NaiveDate::from_ymd_opt(2025, 5, 15).unwrap(),
            invoice_number: "INV001".to_string(),
            fund_name: fund_name.to_string(),
            patient_name: "Test Patient".to_string(),
            ssn: "123456789".to_string(),
            nature: "SF".to_string(),
            procedure_start_date: NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            procedure_end_date: NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            is_period: false,
            amount: 50000,
        }
    }

    fn create_procedure(fund_id: Option<&str>) -> Procedure {
        Procedure::new(
            "patient-1".to_string(),
            fund_id.map(|s| s.to_string()),
            "proc-type-1".to_string(),
            "2025-05-10".to_string(),
            Some(50000),
            crate::context::procedure::PaymentMethod::None,
            None,
            None,
            crate::context::procedure::ProcedureStatus::None,
        )
        .expect("Procedure creation failed")
    }

    #[tokio::test]
    async fn test_fund_cache_build() {
        let fund = AffiliatedFund::new("CPAM n° 931".to_string(), "CPAM 931".to_string())
            .expect("Fund creation failed");

        let repo = Arc::new(MockFundRepository { funds: vec![fund] });

        let result = FundCache::build(repo).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_fund_cache_empty() {
        let repo = Arc::new(MockFundRepository { funds: vec![] });
        let result = FundCache::build(repo).await;
        assert!(result.is_ok());
    }

    #[test]
    fn test_check_fund_anomaly_matching() {
        let fund = AffiliatedFund::new("fund-931".to_string(), "CPAM 931".to_string())
            .expect("Fund creation failed");

        let cache = FundCache::for_test(vec![fund]);
        let pdf_line = create_pdf_line("CPAM 931");
        let proc = create_procedure(Some("fund-931"));

        let anomaly = cache.check_fund_anomaly(&pdf_line, &proc);
        assert_eq!(anomaly, None); // Matching fund = no anomaly
    }

    #[test]
    fn test_check_fund_anomaly_mismatch() {
        let fund = AffiliatedFund::new("fund-931".to_string(), "CPAM 931".to_string())
            .expect("Fund creation failed");

        let fund_id = fund.id.clone();
        let cache = FundCache::for_test(vec![fund]);
        let pdf_line = create_pdf_line("MGEN"); // Different fund
        let proc = create_procedure(Some(&fund_id));

        let anomaly = cache.check_fund_anomaly(&pdf_line, &proc);
        assert_eq!(anomaly, Some(AnomalyType::FundMismatch));
    }

    #[test]
    fn test_check_fund_anomaly_no_procedure_fund() {
        let fund = AffiliatedFund::new("fund-931".to_string(), "CPAM 931".to_string())
            .expect("Fund creation failed");

        let cache = FundCache::for_test(vec![fund]);
        let pdf_line = create_pdf_line("CPAM 931");
        let proc = create_procedure(None); // No fund in procedure

        let anomaly = cache.check_fund_anomaly(&pdf_line, &proc);
        assert_eq!(anomaly, None); // No fund in procedure = no anomaly
    }

    #[test]
    fn test_check_fund_anomaly_fund_identifier_match() {
        let fund = AffiliatedFund::new("CPAM n° 931".to_string(), "CPAM".to_string())
            .expect("Fund creation failed");

        let fund_id = fund.id.clone();
        let cache = FundCache::for_test(vec![fund]);
        let pdf_line = create_pdf_line("CPAM n° 931"); // Matches fund_identifier
        let proc = create_procedure(Some(&fund_id));

        let anomaly = cache.check_fund_anomaly(&pdf_line, &proc);
        assert_eq!(anomaly, None); // fund_identifier match = no anomaly
    }
}

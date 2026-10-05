/// Build a pool of unpaid procedures for reconciliation
use crate::context::procedure::{Procedure, ProcedureRepository};
use crate::shared::logger::BACKEND;
use crate::use_cases::fund_payment_reconciliation::dto::NormalizedPdfLine;
use crate::use_cases::fund_payment_reconciliation::parsing::dates::{
    add_one_day, subtract_one_day,
};
use chrono::NaiveDate;
use std::collections::HashMap;
use std::sync::Arc;

/// Builder for the procedure pool used during reconciliation
pub struct ProcedurePoolBuilder {
    procedure_repository: Arc<dyn ProcedureRepository>,
}

impl ProcedurePoolBuilder {
    pub fn new(procedure_repository: Arc<dyn ProcedureRepository>) -> Self {
        Self {
            procedure_repository,
        }
    }

    /// Build pool of unpaid procedures grouped by SSN
    /// OPTIMIZATION: Uses batch query returning (SSN, Procedure) tuples
    /// 1 query for N SSNs instead of N individual queries
    pub async fn build(
        &self,
        pdf_lines: &[&NormalizedPdfLine],
    ) -> anyhow::Result<HashMap<String, Vec<Procedure>>> {
        // Early return for empty input: nothing to reconcile
        if pdf_lines.is_empty() {
            return Ok(HashMap::new());
        }

        let unique_ssns: Vec<String> = pdf_lines
            .iter()
            .map(|l| l.ssn.clone())
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();

        let mut min_date: Option<NaiveDate> = None;
        let mut max_date: Option<NaiveDate> = None;

        for line in pdf_lines {
            let start = line.procedure_start_date;
            let end = line.procedure_end_date;
            if min_date.as_ref().is_none_or(|d| start < *d) {
                min_date = Some(start);
            }
            if max_date.as_ref().is_none_or(|d| end > *d) {
                max_date = Some(end);
            }
        }

        // After the loop above, min_date and max_date must be Some
        // because pdf_lines is not empty and all lines parse successfully
        let (min, max) = match (min_date, max_date) {
            (Some(m), Some(max_d)) => (m, max_d),
            _ => return Ok(HashMap::new()), // Safety: should not happen given loop above
        };

        let extended_start = subtract_one_day(min)?;
        let extended_end = add_one_day(max)?;

        tracing::info!(
            target: BACKEND,
            ssn_count = unique_ssns.len(),
            date_range = format!("{} to {}", extended_start, extended_end),
            "Fetching procedures with batch query"
        );

        let all_procedures = self
            .procedure_repository
            .find_procedures_by_ssns_and_date_range_with_ssn(
                &unique_ssns,
                extended_start,
                extended_end,
            )
            .await?;

        tracing::info!(
            target: BACKEND,
            total_fetched = all_procedures.len(),
            "Fetched procedures from database"
        );

        // Group by SSN, keeping the candidates of an automatic fund match only (FPA-010).
        let mut pool: HashMap<String, Vec<Procedure>> = HashMap::new();
        let mut excluded_count = 0;
        for (ssn, proc) in all_procedures {
            if proc.payment_status.is_fund_match_candidate() {
                pool.entry(ssn).or_default().push(proc);
            } else {
                excluded_count += 1;
            }
        }

        tracing::info!(
            target: BACKEND,
            ssn_count = unique_ssns.len(),
            pool_count = pool.len(),
            procedures_total = pool.values().map(|v| v.len()).sum::<usize>(),
            excluded_procedures = excluded_count,
            "Pool built"
        );

        Ok(pool)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::context::procedure::{
        PaymentMethod, Procedure, ProcedureRepository, ProcedureStatus,
    };
    use crate::use_cases::fund_payment_reconciliation::dto::NormalizedPdfLine;
    use async_trait::async_trait;
    use chrono::NaiveDate;

    struct MockProcedureRepository {
        procedures: Vec<(String, Procedure)>,
    }

    #[async_trait]
    impl ProcedureRepository for MockProcedureRepository {
        async fn create_procedure(
            &self,
            _: String,
            _: Option<String>,
            _: String,
            _: NaiveDate,
            _: i64,
            _: PaymentMethod,
            _: Option<NaiveDate>,
            _: Option<NaiveDate>,
            _: Option<i64>,
            _: ProcedureStatus,
        ) -> anyhow::Result<Procedure> {
            unimplemented!()
        }
        async fn read_procedure(&self, _: &str) -> anyhow::Result<Option<Procedure>> {
            unimplemented!()
        }
        async fn read_all_procedures(&self) -> anyhow::Result<Vec<Procedure>> {
            unimplemented!()
        }
        async fn find_procedures_by_ssns_and_date_range_with_ssn(
            &self,
            _: &[String],
            _: NaiveDate,
            _: NaiveDate,
        ) -> anyhow::Result<Vec<(String, Procedure)>> {
            Ok(self.procedures.clone())
        }
        async fn update_procedure(&self, _: Procedure) -> anyhow::Result<Procedure> {
            unimplemented!()
        }
        async fn delete_procedure(&self, _: &str) -> anyhow::Result<()> {
            unimplemented!()
        }
        async fn create_batch(&self, _: Vec<Procedure>) -> anyhow::Result<Vec<Procedure>> {
            unimplemented!()
        }
        async fn read_procedures_by_ids(&self, _: &[String]) -> anyhow::Result<Vec<Procedure>> {
            unimplemented!()
        }
        async fn read_procedures_by_patient_id(&self, _: &str) -> anyhow::Result<Vec<Procedure>> {
            unimplemented!()
        }
        async fn find_procedures_by_ssn_and_date_range(
            &self,
            _: &str,
            _: NaiveDate,
            _: NaiveDate,
        ) -> anyhow::Result<Vec<Procedure>> {
            unimplemented!()
        }
        async fn find_procedure_exact(
            &self,
            _: &str,
            _: Option<&str>,
            _: NaiveDate,
            _: i64,
        ) -> anyhow::Result<Option<Procedure>> {
            unimplemented!()
        }
        async fn update_batch(&self, _: Vec<Procedure>) -> anyhow::Result<Vec<Procedure>> {
            unimplemented!()
        }
        async fn find_unpaid_by_fund(&self, _: &str) -> anyhow::Result<Vec<Procedure>> {
            unimplemented!()
        }
        async fn has_blocking_procedures_in_month(&self, _: &str) -> anyhow::Result<bool> {
            unimplemented!()
        }
        async fn delete_procedures_by_month(&self, _: &str) -> anyhow::Result<u64> {
            unimplemented!()
        }
        async fn find_unreconciled_by_date_range(
            &self,
            _: NaiveDate,
            _: NaiveDate,
        ) -> anyhow::Result<Vec<crate::context::procedure::UnreconciledProcedure>> {
            unimplemented!()
        }
        async fn find_created_in_date_range(
            &self,
            _: NaiveDate,
            _: NaiveDate,
        ) -> anyhow::Result<Vec<Procedure>> {
            unimplemented!()
        }
        async fn find_created_by_fund_before_date(
            &self,
            _: &str,
            _: NaiveDate,
        ) -> anyhow::Result<Vec<Procedure>> {
            unimplemented!()
        }
        async fn find_open_by_fund_with_patient(
            &self,
            _: &str,
        ) -> anyhow::Result<Vec<crate::context::procedure::OpenProcedureCandidate>> {
            unimplemented!()
        }
    }

    fn create_pdf_line(ssn: &str) -> NormalizedPdfLine {
        NormalizedPdfLine {
            line_index: 0,
            payment_date: NaiveDate::from_ymd_opt(2025, 5, 15).unwrap(),
            invoice_number: "INV001".to_string(),
            fund_name: "CPAM n° 931".to_string(),
            patient_name: "Test Patient".to_string(),
            ssn: ssn.to_string(),
            nature: "SF".to_string(),
            procedure_start_date: NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            procedure_end_date: NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            is_period: false,
            amount: 50000,
        }
    }

    fn create_procedure(ssn: &str, status: ProcedureStatus) -> (String, Procedure) {
        let proc = Procedure::new(
            "patient-1".to_string(),
            Some("fund-1".to_string()),
            "proc-type-1".to_string(),
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            50000,
            PaymentMethod::None,
            None,
            None,
            None,
            status,
        )
        .expect("Procedure creation failed");
        (ssn.to_string(), proc)
    }

    #[tokio::test]
    async fn test_empty_pdf_lines_returns_empty_pool() {
        let repo = Arc::new(MockProcedureRepository { procedures: vec![] });
        let builder = ProcedurePoolBuilder::new(repo);
        let result = builder.build(&[]).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), 0);
    }

    #[tokio::test]
    async fn test_filters_paid_procedures() {
        let procs = vec![
            create_procedure("111111111", ProcedureStatus::None),
            create_procedure("111111111", ProcedureStatus::DirectlyPaid),
            create_procedure("111111111", ProcedureStatus::FundPaid),
            create_procedure("111111111", ProcedureStatus::Reconciled),
        ];

        let repo = Arc::new(MockProcedureRepository { procedures: procs });
        let builder = ProcedurePoolBuilder::new(repo);
        let line = create_pdf_line("111111111");
        let result = builder.build(&[&line]).await;

        assert!(result.is_ok());
        let pool = result.unwrap();
        assert_eq!(pool.len(), 1);
        // Should have 2 procedures: None + Reconciled (DirectlyPaid and FundPaid are excluded)
        assert_eq!(pool["111111111"].len(), 2);
    }

    /// FPA-010: the pool holds a procedure of every candidate status and of no other.
    #[tokio::test]
    async fn debt_032_the_pool_holds_exactly_the_candidate_statuses() {
        let procs = ProcedureStatus::ALL
            .into_iter()
            .map(|status| create_procedure("111111111", status))
            .collect();
        let repo = Arc::new(MockProcedureRepository { procedures: procs });
        let builder = ProcedurePoolBuilder::new(repo);
        let line = create_pdf_line("111111111");

        let pool = builder.build(&[&line]).await.unwrap();

        let pooled: Vec<ProcedureStatus> = pool["111111111"]
            .iter()
            .map(|procedure| procedure.payment_status)
            .collect();
        assert_eq!(
            pooled,
            [
                ProcedureStatus::None,
                ProcedureStatus::Created,
                ProcedureStatus::Reconciled,
                ProcedureStatus::PartiallyReconciled,
            ]
        );
    }

    #[tokio::test]
    async fn test_groups_by_ssn() {
        let procs = vec![
            create_procedure("111111111", ProcedureStatus::None),
            create_procedure("222222222", ProcedureStatus::None),
            create_procedure("111111111", ProcedureStatus::Reconciled),
        ];

        let repo = Arc::new(MockProcedureRepository { procedures: procs });
        let builder = ProcedurePoolBuilder::new(repo);
        let line1 = create_pdf_line("111111111");
        let line2 = create_pdf_line("222222222");
        let result = builder.build(&[&line1, &line2]).await;

        assert!(result.is_ok());
        let pool = result.unwrap();
        assert_eq!(pool.len(), 2);
        assert_eq!(pool["111111111"].len(), 2);
        assert_eq!(pool["222222222"].len(), 1);
    }
}

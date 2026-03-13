use super::anomaly_detector::AnomalyDetector;
use crate::context::procedure::Procedure;
use crate::use_cases::fund_payment_reconciliation::api::{AnomalyType, DbMatch, NormalizedPdfLine};
use crate::use_cases::fund_payment_reconciliation::core::{
    InternalAmount, ReconciliationProcessor, MAX_GROUP_CANDIDATES,
};
use crate::use_cases::fund_payment_reconciliation::data::FundCache;
/// State machine for a single reconciliation pass
use std::collections::{HashMap, HashSet};

/// Result of a single reconciliation pass
#[derive(Debug)]
pub struct PassResult {
    /// Successful matches grouped by PDF line index
    pub raw_matches: HashMap<u32, Vec<DbMatch>>,
    /// Lines with too many procedure candidates that need manual resolution
    pub too_many_issues: HashMap<u32, Vec<String>>,
    /// Remaining unmatched procedures in the pool
    pub pool: HashMap<String, Vec<Procedure>>,
}

/// Encapsulates all state for a reconciliation pass
/// Eliminates the need to pass 10+ parameters between methods
pub struct ReconciliationPass {
    raw_matches: HashMap<u32, Vec<DbMatch>>,
    pool: HashMap<String, Vec<Procedure>>,
    too_many_issues: HashMap<u32, Vec<String>>,
    matched_indices: HashSet<usize>,
}

impl ReconciliationPass {
    pub fn new(pool: HashMap<String, Vec<Procedure>>) -> Self {
        Self {
            raw_matches: HashMap::new(),
            pool,
            too_many_issues: HashMap::new(),
            matched_indices: HashSet::new(),
        }
    }

    /// Run a single reconciliation pass
    pub async fn run(
        &mut self,
        pass: u8,
        normalized_lines: &[NormalizedPdfLine],
        fund_cache: &FundCache,
    ) -> anyhow::Result<()> {
        let is_period_pass = pass.is_multiple_of(2);
        let use_date_minus_one = pass >= 5;
        let require_exact_amount = pass <= 2 || (5..=6).contains(&pass);

        let pass_type = if is_period_pass { "period" } else { "single" };
        let amount_mode = if require_exact_amount {
            "exact"
        } else {
            "closest"
        };
        let date_mode = if use_date_minus_one {
            "minus-1-day"
        } else {
            "exact"
        };

        tracing::debug!(
            pass = pass,
            pass_type = pass_type,
            amount_mode = amount_mode,
            date_mode = date_mode,
            "Starting reconciliation pass"
        );

        let mut pass_matches = 0;
        let detector = AnomalyDetector::new(fund_cache);

        for (idx, normalized) in normalized_lines.iter().enumerate() {
            if self.matched_indices.contains(&idx) {
                continue;
            }
            if is_period_pass != normalized.is_period {
                continue;
            }

            let ssn_cloned = normalized.ssn.clone();
            let (filter_start, filter_end) = if use_date_minus_one {
                (
                    crate::use_cases::fund_payment_reconciliation::parsing::dates::subtract_one_day(normalized.procedure_start_date)?,
                    normalized.procedure_end_date,
                )
            } else {
                (
                    normalized.procedure_start_date,
                    normalized.procedure_end_date,
                )
            };

            // Clone procedures to avoid holding pool borrow
            let candidates_cloned: Vec<Procedure> = match self.pool.get(&ssn_cloned) {
                Some(procs) if !procs.is_empty() => procs
                    .iter()
                    .filter(|p| p.procedure_date >= filter_start && p.procedure_date <= filter_end)
                    .cloned()
                    .collect(),
                _ => continue,
            };

            if candidates_cloned.is_empty() {
                continue;
            }

            // Check for too many candidates
            if candidates_cloned.len() > MAX_GROUP_CANDIDATES {
                let candidate_ids: Vec<String> =
                    candidates_cloned.iter().map(|p| p.id.clone()).collect();
                tracing::warn!(
                    line_index = normalized.line_index,
                    ssn = %ssn_cloned,
                    candidate_count = candidates_cloned.len(),
                    max_allowed = MAX_GROUP_CANDIDATES,
                    "Too many procedure candidates - unable to auto-resolve"
                );
                self.too_many_issues
                    .insert(normalized.line_index, candidate_ids);
                self.matched_indices.insert(idx);
                pass_matches += 1;
                continue;
            }

            let base_anomalies = if use_date_minus_one {
                vec![AnomalyType::DateMismatch]
            } else {
                Vec::new()
            };

            let candidates_refs: Vec<&Procedure> = candidates_cloned.iter().collect();
            let matched_ids = if is_period_pass {
                self.process_period_match(
                    idx,
                    normalized,
                    &candidates_refs,
                    base_anomalies,
                    require_exact_amount,
                    &detector,
                )?
            } else {
                self.process_single_match(
                    idx,
                    normalized,
                    &candidates_refs,
                    base_anomalies,
                    require_exact_amount,
                    use_date_minus_one,
                    &detector,
                )?
            };

            // Cleanup pool after match processing
            if let Some(ids) = matched_ids {
                if let Some(pool_procs) = self.pool.get_mut(&ssn_cloned) {
                    pool_procs.retain(|p| !ids.contains(&p.id));
                }
                pass_matches += 1;
            }
        }

        let remaining = normalized_lines.len() - self.matched_indices.len();
        tracing::info!(
            pass = pass,
            pass_type = pass_type,
            amount_mode = amount_mode,
            date_mode = date_mode,
            matches_found = pass_matches,
            remaining_unmatched = remaining,
            "Reconciliation pass completed"
        );

        Ok(())
    }

    /// Process a period match
    fn process_period_match(
        &mut self,
        idx: usize,
        normalized: &NormalizedPdfLine,
        date_candidates: &[&Procedure],
        base_anomalies: Vec<AnomalyType>,
        require_exact_amount: bool,
        detector: &AnomalyDetector,
    ) -> anyhow::Result<Option<Vec<String>>> {
        let match_result = if require_exact_amount {
            ReconciliationProcessor::find_exact_combination(
                date_candidates,
                InternalAmount(normalized.amount),
            )
        } else {
            ReconciliationProcessor::find_best_combination(
                date_candidates,
                InternalAmount(normalized.amount),
            )
        };

        let Some((matched_procs, sum)) = match_result else {
            return Ok(None);
        };

        // Build matches and check anomalies
        let mut anomalies = base_anomalies.clone();
        if sum != InternalAmount(normalized.amount) {
            anomalies.push(AnomalyType::AmountMismatch);
            tracing::warn!(
                line_index = normalized.line_index,
                ssn = %normalized.ssn,
                pdf_amount = InternalAmount(normalized.amount).to_f64(),
                db_sum = sum.to_f64(),
                "Amount mismatch detected in period match"
            );
        }

        let db_matches =
            self.build_period_db_matches(normalized, &matched_procs, anomalies, detector);

        tracing::debug!(
            line_index = normalized.line_index,
            ssn = %normalized.ssn,
            procedure_count = matched_procs.len(),
            anomaly_count = db_matches.iter().map(|m| m.anomalies.len()).sum::<usize>(),
            "Period match found"
        );

        let matched_ids: Vec<String> = matched_procs.iter().map(|p| p.id.clone()).collect();
        self.raw_matches.insert(normalized.line_index, db_matches);
        self.matched_indices.insert(idx);

        Ok(Some(matched_ids))
    }

    /// Process a single match
    #[allow(clippy::too_many_arguments)]
    fn process_single_match(
        &mut self,
        idx: usize,
        normalized: &NormalizedPdfLine,
        date_candidates: &[&Procedure],
        base_anomalies: Vec<AnomalyType>,
        require_exact_amount: bool,
        use_date_minus_one: bool,
        detector: &AnomalyDetector,
    ) -> anyhow::Result<Option<Vec<String>>> {
        let single_match = if require_exact_amount {
            ReconciliationProcessor::find_single_exact_match(
                date_candidates,
                InternalAmount(normalized.amount),
            )
        } else {
            ReconciliationProcessor::find_single_closest_match(
                date_candidates,
                InternalAmount(normalized.amount),
            )
        };

        let Some(proc) = single_match else {
            return Ok(None);
        };

        let mut anomalies = base_anomalies.clone();

        if let Some(db_amount) = proc.procedure_amount {
            let db_internal = InternalAmount(db_amount);
            if db_internal != InternalAmount(normalized.amount) {
                anomalies.push(AnomalyType::AmountMismatch);
                tracing::warn!(
                    line_index = normalized.line_index,
                    ssn = %normalized.ssn,
                    procedure_id = %proc.id,
                    pdf_amount = InternalAmount(normalized.amount).to_f64(),
                    db_amount = db_amount,
                    "Amount mismatch detected in single match"
                );
            }
        }

        if let Some(fa) = detector.fund_cache.check_fund_anomaly(normalized, proc) {
            anomalies.push(fa);
            tracing::warn!(
                line_index = normalized.line_index,
                ssn = %normalized.ssn,
                procedure_id = %proc.id,
                pdf_fund = %normalized.fund_name,
                anomaly_type = "FundMismatch",
                "Fund mismatch detected"
            );
        }

        if use_date_minus_one {
            tracing::debug!(
                line_index = normalized.line_index,
                ssn = %normalized.ssn,
                procedure_id = %proc.id,
                pdf_date = %normalized.procedure_start_date,
                db_date = %proc.procedure_date,
                "Date mismatch (matched with -1 day)"
            );
        }

        tracing::debug!(
            line_index = normalized.line_index,
            ssn = %normalized.ssn,
            procedure_id = %proc.id,
            anomaly_count = anomalies.len(),
            "Single match found"
        );

        self.raw_matches.insert(
            normalized.line_index,
            vec![DbMatch {
                procedure_id: proc.id.clone(),
                procedure_date: proc.procedure_date,
                fund_id: proc.fund_id.clone(),
                amount: proc.procedure_amount,
                anomalies,
            }],
        );

        self.matched_indices.insert(idx);

        Ok(Some(vec![proc.id.clone()]))
    }

    /// Build DbMatch entries for a period match with fund anomaly checking
    fn build_period_db_matches(
        &self,
        normalized: &NormalizedPdfLine,
        matched_procs: &[&Procedure],
        base_anomalies: Vec<AnomalyType>,
        detector: &AnomalyDetector,
    ) -> Vec<DbMatch> {
        let mut db_matches = Vec::new();

        for proc in matched_procs {
            let mut proc_anomalies = base_anomalies.clone();

            if let Some(fa) = detector.fund_cache.check_fund_anomaly(normalized, proc) {
                proc_anomalies.push(fa);
                tracing::warn!(
                    line_index = normalized.line_index,
                    ssn = %normalized.ssn,
                    procedure_id = %proc.id,
                    pdf_fund = %normalized.fund_name,
                    anomaly_type = "FundMismatch",
                    "Fund mismatch detected"
                );
            }

            db_matches.push(DbMatch {
                procedure_id: proc.id.clone(),
                procedure_date: proc.procedure_date,
                fund_id: proc.fund_id.clone(),
                amount: proc.procedure_amount,
                anomalies: proc_anomalies,
            });
        }

        db_matches
    }

    /// Destructure into results including the pool for perfect match checking
    pub fn into_result(self) -> PassResult {
        PassResult {
            raw_matches: self.raw_matches,
            too_many_issues: self.too_many_issues,
            pool: self.pool,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::context::fund::AffiliatedFund;
    use crate::context::procedure::PaymentMethod;
    use crate::context::procedure::ProcedureStatus;
    use chrono::NaiveDate;

    // ============================================================================
    // FIXTURES
    // ============================================================================

    fn create_procedure(
        _id: &str,
        _ssn: &str,
        procedure_date: &str,
        amount: Option<i64>,
        fund_id: Option<&str>,
    ) -> Procedure {
        Procedure::new(
            "patient-1".to_string(),
            fund_id.map(|s| s.to_string()),
            "proc-type-1".to_string(),
            procedure_date.to_string(),
            amount,
            PaymentMethod::None,
            None,
            None,
            ProcedureStatus::None,
        )
        .expect("Procedure creation failed in test")
    }

    fn create_fund_cache() -> FundCache {
        let fund = AffiliatedFund::new("CPAM n° 931".to_string(), "CPAM 931".to_string())
            .expect("Fund creation failed in test");
        FundCache::for_test(vec![fund])
    }

    fn make_normalized_line(
        line_index: u32,
        ssn: &str,
        amount: i64,
        start_date: NaiveDate,
        end_date: NaiveDate,
        is_period: bool,
    ) -> NormalizedPdfLine {
        NormalizedPdfLine {
            line_index,
            payment_date: NaiveDate::from_ymd_opt(2025, 5, 15).unwrap(),
            invoice_number: "INV001".to_string(),
            fund_name: "CPAM n° 931".to_string(),
            patient_name: "Test Patient".to_string(),
            ssn: ssn.to_string(),
            nature: "SF".to_string(),
            procedure_start_date: start_date,
            procedure_end_date: end_date,
            is_period,
            amount,
        }
    }

    // ============================================================================
    // TEST: Construction et state initial
    // ============================================================================

    #[test]
    fn test_new_creates_empty_state() {
        let pool = HashMap::new();
        let pass = ReconciliationPass::new(pool);

        // State should be empty
        assert!(pass.raw_matches.is_empty());
        assert!(pass.too_many_issues.is_empty());
        assert!(pass.matched_indices.is_empty());
    }

    #[test]
    fn test_new_preserves_pool() {
        let mut pool = HashMap::new();
        let proc = create_procedure(
            "proc-1",
            "123456789",
            "2025-05-10",
            Some(50000),
            Some("fund-931"),
        );
        pool.insert("123456789".to_string(), vec![proc.clone()]);

        let pass = ReconciliationPass::new(pool.clone());

        // Pool should be preserved
        assert_eq!(pass.pool.len(), 1);
        assert!(pass.pool.contains_key("123456789"));
    }

    // ============================================================================
    // TEST: into_result extraction
    // ============================================================================

    #[test]
    fn test_into_result_extracts_all_fields() {
        let mut pool = HashMap::new();
        let proc = create_procedure(
            "proc-1",
            "123456789",
            "2025-05-10",
            Some(50000),
            Some("fund-931"),
        );
        pool.insert("123456789".to_string(), vec![proc]);

        let pass = ReconciliationPass::new(pool.clone());
        let result = pass.into_result();

        assert_eq!(result.raw_matches.len(), 0);
        assert_eq!(result.too_many_issues.len(), 0);
        assert_eq!(result.pool.len(), 1);
        assert!(result.pool.contains_key("123456789"));
    }

    // ============================================================================
    // TEST: Pass type detection (single vs period)
    // ============================================================================

    #[tokio::test]
    async fn test_pass_1_is_single_pass() {
        let pool = HashMap::new();
        let mut pass = ReconciliationPass::new(pool);
        let fund_cache = create_fund_cache();

        // Pass 1 should be single (odd), exact amount
        let result = pass.run(1, &[], &fund_cache).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_pass_2_is_period_pass() {
        let pool = HashMap::new();
        let mut pass = ReconciliationPass::new(pool);
        let fund_cache = create_fund_cache();

        // Pass 2 should be period (even), exact amount
        let result = pass.run(2, &[], &fund_cache).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_pass_5_uses_date_minus_one() {
        let pool = HashMap::new();
        let mut pass = ReconciliationPass::new(pool);
        let fund_cache = create_fund_cache();

        // Pass 5 >= 5, should use date-1
        let result = pass.run(5, &[], &fund_cache).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_pass_4_uses_closest_amount() {
        let pool = HashMap::new();
        let mut pass = ReconciliationPass::new(pool);
        let fund_cache = create_fund_cache();

        // Pass 4 > 2 and not in (5..=6), should use closest amount
        let result = pass.run(4, &[], &fund_cache).await;
        assert!(result.is_ok());
    }

    // ============================================================================
    // TEST: Empty input handling
    // ============================================================================

    #[tokio::test]
    async fn test_empty_pdf_lines_returns_ok() {
        let pool = HashMap::new();
        let mut pass = ReconciliationPass::new(pool);
        let fund_cache = create_fund_cache();

        let result = pass.run(1, &[], &fund_cache).await;
        assert!(result.is_ok());

        let result = pass.into_result();
        assert_eq!(result.raw_matches.len(), 0);
        assert_eq!(result.too_many_issues.len(), 0);
    }

    // ============================================================================
    // TEST: Already matched lines are skipped
    // ============================================================================

    #[tokio::test]
    async fn test_matched_indices_skip_lines() {
        let pool = HashMap::new();
        let mut pass = ReconciliationPass::new(pool);

        // Mark index 0 as already matched
        pass.matched_indices.insert(0);

        let normalized_lines = vec![make_normalized_line(
            0,
            "123456789",
            50000,
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            false,
        )];

        let fund_cache = create_fund_cache();
        let result = pass.run(1, &normalized_lines, &fund_cache).await;
        assert!(result.is_ok());

        // Line should still be skipped
        let result = pass.into_result();
        assert_eq!(result.raw_matches.len(), 0);
    }

    // ============================================================================
    // TEST: Period vs single line filtering
    // ============================================================================

    #[tokio::test]
    async fn test_period_pass_skips_single_lines() {
        let pool = HashMap::new();
        let mut pass = ReconciliationPass::new(pool);

        let normalized_lines = vec![make_normalized_line(
            0,
            "123456789",
            50000,
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            false, // Single date
        )];

        let fund_cache = create_fund_cache();
        // Pass 2 is period pass (even)
        let result = pass.run(2, &normalized_lines, &fund_cache).await;
        assert!(result.is_ok());

        let result = pass.into_result();
        assert_eq!(result.raw_matches.len(), 0); // Should not match single line in period pass
    }

    #[tokio::test]
    async fn test_single_pass_skips_period_lines() {
        let pool = HashMap::new();
        let mut pass = ReconciliationPass::new(pool);

        let normalized_lines = vec![make_normalized_line(
            0,
            "123456789",
            100000,
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            NaiveDate::from_ymd_opt(2025, 5, 15).unwrap(),
            true, // Period
        )];

        let fund_cache = create_fund_cache();
        // Pass 1 is single pass (odd)
        let result = pass.run(1, &normalized_lines, &fund_cache).await;
        assert!(result.is_ok());

        let result = pass.into_result();
        assert_eq!(result.raw_matches.len(), 0); // Should not match period line in single pass
    }

    // ============================================================================
    // TEST: SSN not in pool - no match
    // ============================================================================

    #[tokio::test]
    async fn test_ssn_not_in_pool_no_match() {
        let pool = HashMap::new(); // Empty pool
        let mut pass = ReconciliationPass::new(pool);

        let normalized_lines = vec![make_normalized_line(
            0,
            "999999999",
            50000,
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            false,
        )];

        let fund_cache = create_fund_cache();
        let result = pass.run(1, &normalized_lines, &fund_cache).await;
        assert!(result.is_ok());

        let result = pass.into_result();
        assert_eq!(result.raw_matches.len(), 0); // No SSN in pool = no match
    }

    // ============================================================================
    // TEST: Too many candidates handling
    // ============================================================================

    #[tokio::test]
    async fn test_too_many_candidates_flagged() {
        // Create pool with 9 procedures (more than MAX_GROUP_CANDIDATES=8)
        let mut pool = HashMap::new();
        let mut procedures = Vec::new();
        for i in 0..9 {
            procedures.push(create_procedure(
                &format!("proc-{}", i),
                "123456789",
                "2025-05-10",
                Some(50000),
                Some("fund-931"),
            ));
        }
        pool.insert("123456789".to_string(), procedures);

        let mut pass = ReconciliationPass::new(pool);

        let normalized_lines = vec![make_normalized_line(
            0,
            "123456789",
            50000,
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            false,
        )];

        let fund_cache = create_fund_cache();
        let result = pass.run(1, &normalized_lines, &fund_cache).await;
        assert!(result.is_ok());

        let result = pass.into_result();
        // With 9 candidates, should be flagged as too many
        assert_eq!(result.too_many_issues.len(), 1);
        assert!(result.too_many_issues.contains_key(&0));
        assert_eq!(result.too_many_issues[&0].len(), 9); // All 9 candidates listed
    }

    // ============================================================================
    // TEST: Pool cleanup after match
    // ============================================================================

    #[tokio::test]
    async fn test_pool_cleanup_after_match() {
        let mut pool = HashMap::new();
        let proc1 = create_procedure(
            "proc-1",
            "123456789",
            "2025-05-10",
            Some(50000),
            Some("fund-931"),
        );
        let proc2 = create_procedure(
            "proc-2",
            "123456789",
            "2025-05-11",
            Some(50000),
            Some("fund-931"),
        );
        pool.insert("123456789".to_string(), vec![proc1, proc2]);

        let mut pass = ReconciliationPass::new(pool);

        let normalized_lines = vec![make_normalized_line(
            0,
            "123456789",
            50000,
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            false,
        )];

        let fund_cache = create_fund_cache();
        let result = pass.run(1, &normalized_lines, &fund_cache).await;
        assert!(result.is_ok());

        let result = pass.into_result();
        // One procedure should be matched and removed, one remains
        // After removing the matched proc-1, proc-2 should remain
        let remaining = result.pool.get("123456789").map(|v| v.len()).unwrap_or(0);
        assert!(
            remaining <= 2,
            "Expected at most 2 procedures, got {}",
            remaining
        );
    }

    // ============================================================================
    // TEST: State preservation across multiple runs
    // ============================================================================

    #[tokio::test]
    async fn test_matched_indices_preserved_across_runs() {
        let pool = HashMap::new();
        let mut pass = ReconciliationPass::new(pool);
        let fund_cache = create_fund_cache();

        let normalized_lines = vec![make_normalized_line(
            0,
            "123456789",
            50000,
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            false,
        )];

        // First pass - marked as already matched
        pass.matched_indices.insert(0);

        // Run pass 1
        let result1 = pass.run(1, &normalized_lines, &fund_cache).await;
        assert!(result1.is_ok());

        // Index 0 should still be marked as matched
        assert!(pass.matched_indices.contains(&0));

        // Run pass 2
        let result2 = pass.run(2, &normalized_lines, &fund_cache).await;
        assert!(result2.is_ok());

        // Index 0 should still be marked as matched
        assert!(pass.matched_indices.contains(&0));
    }
}

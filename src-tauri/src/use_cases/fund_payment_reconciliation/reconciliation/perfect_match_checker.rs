use crate::context::procedure::Procedure;
/// Check if a match is "perfect" (fully resolved)
use crate::use_cases::fund_payment_reconciliation::api::{DbMatch, NormalizedPdfLine};
use crate::use_cases::fund_payment_reconciliation::core::InternalAmount;
use std::collections::{HashMap, HashSet};

/// Determines if a reconciliation match is "perfect" (no further user action needed)
pub struct PerfectMatchChecker;

impl PerfectMatchChecker {
    /// Check if a set of matches is perfect
    /// A perfect match means:
    /// 1. Sum of matched amounts equals PDF amount exactly
    /// 2. No anomalies detected
    /// 3. ALL available procedures for this SSN/period are covered
    pub fn is_perfect_match(
        normalized: &NormalizedPdfLine,
        db_matches: &[DbMatch],
        pool: &HashMap<String, Vec<Procedure>>,
    ) -> bool {
        // No anomalies allowed
        if db_matches.iter().any(|m| !m.anomalies.is_empty()) {
            return false;
        }

        // Sum must match exactly
        let sum: InternalAmount = db_matches
            .iter()
            .filter_map(|m| m.amount.map(InternalAmount))
            .fold(InternalAmount(0), |acc, amt| InternalAmount(acc.0 + amt.0));

        if sum != InternalAmount(normalized.amount) {
            return false;
        }

        // All available procedures for this SSN on this period must be covered
        let matched_ids: HashSet<String> =
            db_matches.iter().map(|m| m.procedure_id.clone()).collect();

        if let Some(available_procs) = pool.get(&normalized.ssn) {
            let period_procs: Vec<_> = available_procs
                .iter()
                .filter(|p| {
                    p.procedure_date >= normalized.procedure_start_date
                        && p.procedure_date <= normalized.procedure_end_date
                })
                .collect();

            // All procedures in this period must be matched
            if !period_procs.iter().all(|p| matched_ids.contains(&p.id)) {
                return false;
            }
        }

        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::context::procedure::{PaymentMethod, ProcedureStatus};
    use crate::use_cases::fund_payment_reconciliation::api::AnomalyType;
    use chrono::NaiveDate;

    // ============================================================================
    // FIXTURES
    // ============================================================================

    fn create_normalized_pdf_line(
        ssn: &str,
        amount: i64,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> NormalizedPdfLine {
        NormalizedPdfLine {
            line_index: 0,
            payment_date: NaiveDate::from_ymd_opt(2025, 5, 15).unwrap(),
            invoice_number: "INV001".to_string(),
            fund_name: "CPAM n° 931".to_string(),
            patient_name: "Test Patient".to_string(),
            ssn: ssn.to_string(),
            nature: "SF".to_string(),
            procedure_start_date: start_date,
            procedure_end_date: end_date,
            is_period: false,
            amount,
        }
    }

    fn create_procedure(_id: &str, _ssn: &str, procedure_date: &str, amount: i64) -> Procedure {
        Procedure::new(
            "patient-1".to_string(),
            Some("fund-1".to_string()),
            "proc-type-1".to_string(),
            procedure_date.to_string(),
            Some(amount),
            PaymentMethod::None,
            None,
            None,
            ProcedureStatus::None,
        )
        .expect("Procedure creation failed")
    }

    fn create_db_match(
        procedure_id: &str,
        amount: Option<i64>,
        anomalies: Vec<AnomalyType>,
    ) -> DbMatch {
        DbMatch {
            procedure_id: procedure_id.to_string(),
            procedure_date: NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            fund_id: Some("fund-1".to_string()),
            amount,
            anomalies,
        }
    }

    // ============================================================================
    // TEST: Perfect match - all conditions satisfied
    // ============================================================================

    #[test]
    fn test_perfect_match_basic() {
        let normalized = create_normalized_pdf_line(
            "123456789",
            100000,
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
        );

        // Pool with exact matching procedure
        let mut pool = HashMap::new();
        let proc = create_procedure("proc-1", "123456789", "2025-05-10", 100000);
        let proc_id = proc.id.clone();

        // Create db_match with the actual procedure ID
        let db_matches = vec![create_db_match(&proc_id, Some(100000), vec![])];
        pool.insert("123456789".to_string(), vec![proc]);

        assert!(PerfectMatchChecker::is_perfect_match(
            &normalized,
            &db_matches,
            &pool
        ));
    }

    // ============================================================================
    // TEST: Anomalies prevent perfect match
    // ============================================================================

    #[test]
    fn test_fails_with_amount_mismatch_anomaly() {
        let normalized = create_normalized_pdf_line(
            "123456789",
            100000,
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
        );

        // Match has AmountMismatch anomaly
        let db_matches = vec![create_db_match(
            "proc-1",
            Some(100000),
            vec![AnomalyType::AmountMismatch],
        )];

        let mut pool = HashMap::new();
        let proc = create_procedure("proc-1", "123456789", "2025-05-10", 100000);
        pool.insert("123456789".to_string(), vec![proc]);

        assert!(!PerfectMatchChecker::is_perfect_match(
            &normalized,
            &db_matches,
            &pool
        ));
    }

    #[test]
    fn test_fails_with_date_mismatch_anomaly() {
        let normalized = create_normalized_pdf_line(
            "123456789",
            100000,
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
        );

        // Match has DateMismatch anomaly
        let db_matches = vec![create_db_match(
            "proc-1",
            Some(100000),
            vec![AnomalyType::DateMismatch],
        )];

        let mut pool = HashMap::new();
        let proc = create_procedure("proc-1", "123456789", "2025-05-10", 100000);
        pool.insert("123456789".to_string(), vec![proc]);

        assert!(!PerfectMatchChecker::is_perfect_match(
            &normalized,
            &db_matches,
            &pool
        ));
    }

    #[test]
    fn test_fails_with_fund_mismatch_anomaly() {
        let normalized = create_normalized_pdf_line(
            "123456789",
            100000,
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
        );

        // Match has FundMismatch anomaly
        let db_matches = vec![create_db_match(
            "proc-1",
            Some(100000),
            vec![AnomalyType::FundMismatch],
        )];

        let mut pool = HashMap::new();
        let proc = create_procedure("proc-1", "123456789", "2025-05-10", 100000);
        pool.insert("123456789".to_string(), vec![proc]);

        assert!(!PerfectMatchChecker::is_perfect_match(
            &normalized,
            &db_matches,
            &pool
        ));
    }

    #[test]
    fn test_fails_with_multiple_anomalies() {
        let normalized = create_normalized_pdf_line(
            "123456789",
            100000,
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
        );

        // Match has multiple anomalies
        let db_matches = vec![create_db_match(
            "proc-1",
            Some(100000),
            vec![AnomalyType::AmountMismatch, AnomalyType::DateMismatch],
        )];

        let mut pool = HashMap::new();
        let proc = create_procedure("proc-1", "123456789", "2025-05-10", 100000);
        pool.insert("123456789".to_string(), vec![proc]);

        assert!(!PerfectMatchChecker::is_perfect_match(
            &normalized,
            &db_matches,
            &pool
        ));
    }

    // ============================================================================
    // TEST: Amount mismatch
    // ============================================================================

    #[test]
    fn test_fails_with_amount_mismatch_sum() {
        let normalized = create_normalized_pdf_line(
            "123456789",
            100000,
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
        );

        // PDF says 100000 (100€), but match is 50000 (50€)
        let db_matches = vec![create_db_match("proc-1", Some(50000), vec![])];

        let mut pool = HashMap::new();
        let proc = create_procedure("proc-1", "123456789", "2025-05-10", 100000);
        pool.insert("123456789".to_string(), vec![proc]);

        assert!(!PerfectMatchChecker::is_perfect_match(
            &normalized,
            &db_matches,
            &pool
        ));
    }

    #[test]
    fn test_perfect_match_multiple_procedures_sum() {
        let normalized = create_normalized_pdf_line(
            "123456789",
            150000,
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            NaiveDate::from_ymd_opt(2025, 5, 12).unwrap(),
        );

        let mut pool = HashMap::new();
        let proc1 = create_procedure("proc-1", "123456789", "2025-05-10", 50000);
        let proc2 = create_procedure("proc-2", "123456789", "2025-05-11", 100000);
        let id1 = proc1.id.clone();
        let id2 = proc2.id.clone();

        // Two matches summing to 150000 (150€) using actual IDs
        let db_matches = vec![
            create_db_match(&id1, Some(50000), vec![]),
            create_db_match(&id2, Some(100000), vec![]),
        ];

        pool.insert("123456789".to_string(), vec![proc1, proc2]);

        assert!(PerfectMatchChecker::is_perfect_match(
            &normalized,
            &db_matches,
            &pool
        ));
    }

    #[test]
    fn test_fails_with_missing_procedure_coverage() {
        let normalized = create_normalized_pdf_line(
            "123456789",
            100000,
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            NaiveDate::from_ymd_opt(2025, 5, 12).unwrap(),
        );

        // Only match proc-1, but pool has proc-1 and proc-2
        let db_matches = vec![create_db_match("proc-1", Some(100000), vec![])];

        let mut pool = HashMap::new();
        let proc1 = create_procedure("proc-1", "123456789", "2025-05-10", 100000);
        let proc2 = create_procedure("proc-2", "123456789", "2025-05-11", 50000);
        pool.insert("123456789".to_string(), vec![proc1, proc2]);

        // Should fail because proc-2 is not matched
        assert!(!PerfectMatchChecker::is_perfect_match(
            &normalized,
            &db_matches,
            &pool
        ));
    }

    // ============================================================================
    // TEST: Procedure coverage (all available procedures must be matched)
    // ============================================================================

    #[test]
    fn test_fails_with_unmatched_procedure_in_period() {
        let normalized = create_normalized_pdf_line(
            "123456789",
            50000,
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            NaiveDate::from_ymd_opt(2025, 5, 15).unwrap(),
        );

        let db_matches = vec![create_db_match("proc-1", Some(50000), vec![])];

        let mut pool = HashMap::new();
        let proc1 = create_procedure("proc-1", "123456789", "2025-05-10", 50000);
        // proc-2 is in the period but not matched
        let proc2 = create_procedure("proc-2", "123456789", "2025-05-12", 25000);
        pool.insert("123456789".to_string(), vec![proc1, proc2]);

        // Should fail because proc-2 in period is not covered
        assert!(!PerfectMatchChecker::is_perfect_match(
            &normalized,
            &db_matches,
            &pool
        ));
    }

    #[test]
    fn test_ignores_procedures_outside_period() {
        let normalized = create_normalized_pdf_line(
            "123456789",
            50000,
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
        );

        let mut pool = HashMap::new();
        let proc1 = create_procedure("proc-1", "123456789", "2025-05-10", 50000);
        // proc-2 is outside the period (11/05), should be ignored
        let proc2 = create_procedure("proc-2", "123456789", "2025-05-11", 25000);
        let id1 = proc1.id.clone();

        let db_matches = vec![create_db_match(&id1, Some(50000), vec![])];
        pool.insert("123456789".to_string(), vec![proc1, proc2]);

        // Should succeed because proc-2 is outside the period
        assert!(PerfectMatchChecker::is_perfect_match(
            &normalized,
            &db_matches,
            &pool
        ));
    }

    // ============================================================================
    // TEST: Empty and edge cases
    // ============================================================================

    #[test]
    fn test_empty_matches_with_no_procedures_in_pool() {
        let normalized = create_normalized_pdf_line(
            "123456789",
            0,
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
        );

        let db_matches = vec![];
        let pool: HashMap<String, Vec<Procedure>> = HashMap::new();

        // No procedures in pool and no matches - perfect match
        assert!(PerfectMatchChecker::is_perfect_match(
            &normalized,
            &db_matches,
            &pool
        ));
    }

    #[test]
    fn test_empty_matches_with_ssn_not_in_pool() {
        let normalized = create_normalized_pdf_line(
            "999999999",
            100000,
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
        );

        let db_matches = vec![];
        let mut pool = HashMap::new();
        let proc = create_procedure("proc-1", "123456789", "2025-05-10", 100000);
        pool.insert("123456789".to_string(), vec![proc]);

        // SSN 999999999 not in pool, no matches - amount mismatch (0 != 100)
        assert!(!PerfectMatchChecker::is_perfect_match(
            &normalized,
            &db_matches,
            &pool
        ));
    }

    #[test]
    fn test_with_null_amounts() {
        let normalized = create_normalized_pdf_line(
            "123456789",
            0,
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
        );

        let mut pool = HashMap::new();
        let proc = create_procedure("proc-1", "123456789", "2025-05-10", 100000);
        let proc_id = proc.id.clone();

        // Match with no amount (None)
        let db_matches = vec![DbMatch {
            procedure_id: proc_id,
            procedure_date: NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            fund_id: Some("fund-1".to_string()),
            amount: None,
            anomalies: vec![],
        }];

        pool.insert("123456789".to_string(), vec![proc]);

        // Amount None is treated as 0, which matches normalized 0.0
        assert!(PerfectMatchChecker::is_perfect_match(
            &normalized,
            &db_matches,
            &pool
        ));
    }

    #[test]
    fn test_precision_handling() {
        let normalized = create_normalized_pdf_line(
            "123456789",
            99990,
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
        );

        let mut pool = HashMap::new();
        let proc = create_procedure("proc-1", "123456789", "2025-05-10", 99990);
        let proc_id = proc.id.clone();

        let db_matches = vec![create_db_match(&proc_id, Some(99990), vec![])];
        pool.insert("123456789".to_string(), vec![proc]);

        // Precision should be preserved using InternalAmount
        assert!(PerfectMatchChecker::is_perfect_match(
            &normalized,
            &db_matches,
            &pool
        ));
    }
}

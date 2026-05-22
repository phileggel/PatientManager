use super::types::{InternalAmount, MAX_SUBSET_CANDIDATES};
use crate::context::procedure::Procedure;

/// Pure matching processor - no dependencies on repositories
pub struct ReconciliationProcessor;

impl ReconciliationProcessor {
    /// Find exact amount match from a combination of procedures
    pub fn find_exact_combination<'a>(
        candidates: &[&'a Procedure],
        target: InternalAmount,
    ) -> Option<(Vec<&'a Procedure>, InternalAmount)> {
        if candidates.is_empty() {
            return None;
        }

        for size in 1..=candidates.len() {
            if let Some(res) = Self::find_subset_of_size(candidates, target, size, true) {
                return Some(res);
            }
        }
        None
    }

    /// Find best (closest) amount match from a combination of procedures
    pub fn find_best_combination<'a>(
        candidates: &[&'a Procedure],
        target: InternalAmount,
    ) -> Option<(Vec<&'a Procedure>, InternalAmount)> {
        if candidates.is_empty() {
            return None;
        }

        // First try exact match
        if let Some(res) = Self::find_exact_combination(candidates, target) {
            return Some(res);
        }

        // Then try closest match
        if candidates.len() > MAX_SUBSET_CANDIDATES {
            // If too many, return None (no greedy fallback)
            return None;
        }

        let mut best: Option<(Vec<&'a Procedure>, InternalAmount)> = None;
        let mut best_diff = i64::MAX;

        for size in 1..=candidates.len() {
            if let Some((procs, sum)) = Self::find_closest_subset_of_size(candidates, target, size)
            {
                let diff = (sum.0 - target.0).abs();
                if diff < best_diff {
                    best_diff = diff;
                    best = Some((procs, sum));
                }
            }
        }
        best
    }

    /// Find single procedure that matches exactly
    pub fn find_single_exact_match<'a>(
        candidates: &[&'a Procedure],
        amount: InternalAmount,
    ) -> Option<&'a Procedure> {
        candidates
            .iter()
            .find(|p| {
                p.billed_amount
                    .map(|a| InternalAmount(a) == amount)
                    .unwrap_or(false)
            })
            .copied()
    }

    /// Find single procedure that is closest to target amount
    pub fn find_single_closest_match<'a>(
        candidates: &[&'a Procedure],
        amount: InternalAmount,
    ) -> Option<&'a Procedure> {
        candidates
            .iter()
            .filter_map(|p| {
                p.billed_amount
                    .map(|proc_amt| (p, InternalAmount(proc_amt)))
            })
            .min_by_key(|(_, proc_amount)| (proc_amount.0 - amount.0).abs())
            .map(|(p, _)| *p)
    }

    fn find_subset_of_size<'a>(
        candidates: &[&'a Procedure],
        target: InternalAmount,
        size: usize,
        exact: bool,
    ) -> Option<(Vec<&'a Procedure>, InternalAmount)> {
        let mut indices: Vec<usize> = (0..size).collect();
        loop {
            let sum = Self::sum_procedures_from_indices(candidates, &indices);
            if !exact || sum == target {
                return Some((
                    indices
                        .iter()
                        .filter_map(|&i| candidates.get(i).copied())
                        .collect(),
                    sum,
                ));
            }
            if !next_combination(&mut indices, candidates.len()) {
                break;
            }
        }
        None
    }

    fn find_closest_subset_of_size<'a>(
        candidates: &[&'a Procedure],
        target: InternalAmount,
        size: usize,
    ) -> Option<(Vec<&'a Procedure>, InternalAmount)> {
        let mut best: Option<(Vec<&'a Procedure>, InternalAmount)> = None;
        let mut best_diff = i64::MAX;
        let mut indices: Vec<usize> = (0..size).collect();

        loop {
            let sum = Self::sum_procedures_from_indices(candidates, &indices);
            let diff = (sum.0 - target.0).abs();
            if diff < best_diff {
                best_diff = diff;
                best = Some((
                    indices
                        .iter()
                        .filter_map(|&i| candidates.get(i).copied())
                        .collect(),
                    sum,
                ));
            }
            if !next_combination(&mut indices, candidates.len()) {
                break;
            }
        }
        best
    }

    fn sum_procedures_from_indices(candidates: &[&Procedure], indices: &[usize]) -> InternalAmount {
        let sum: i64 = indices
            .iter()
            .filter_map(|&i| {
                candidates
                    .get(i)
                    .and_then(|proc| proc.billed_amount.map(InternalAmount))
            })
            .map(|a| a.0)
            .sum();
        InternalAmount(sum)
    }
}

fn next_combination(indices: &mut [usize], n: usize) -> bool {
    let k = indices.len();

    for i in (0..k).rev() {
        match indices.get_mut(i) {
            Some(idx_i) => {
                if *idx_i < n - k + i {
                    *idx_i += 1;

                    for j in i + 1..k {
                        let prev_val = indices.get(j.saturating_sub(1)).copied().unwrap_or(0);
                        if let Some(v) = indices.get_mut(j) {
                            *v = prev_val + 1;
                        }
                    }

                    return true;
                }
            }
            None => continue,
        }
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::context::procedure::{PaymentMethod, ProcedureStatus};
    use chrono::NaiveDate;

    fn make_proc(billed_amount: Option<i64>) -> crate::context::procedure::Procedure {
        crate::context::procedure::Procedure::restore(
            uuid::Uuid::new_v4().to_string(),
            "patient-1".to_string(),
            None,
            "type-1".to_string(),
            NaiveDate::from_ymd_opt(2026, 1, 1).unwrap(),
            billed_amount,
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::Created,
        )
    }

    // --- InternalAmount ---

    #[test]
    fn internal_amount_from_f64_converts_correctly() {
        assert_eq!(InternalAmount::from_f64(10.50).0, 10500);
        assert_eq!(InternalAmount::from_f64(0.01).0, 10);
        assert_eq!(InternalAmount::from_f64(100.00).0, 100000);
    }

    #[test]
    fn internal_amount_to_f64_converts_correctly() {
        assert_eq!(InternalAmount(10500).to_f64(), 10.5);
        assert_eq!(InternalAmount(10).to_f64(), 0.01);
        assert_eq!(InternalAmount(100000).to_f64(), 100.0);
    }

    // --- find_exact_combination ---

    #[test]
    fn exact_combination_empty_candidates_returns_none() {
        assert!(
            ReconciliationProcessor::find_exact_combination(&[], InternalAmount(100_000)).is_none()
        );
    }

    #[test]
    fn exact_combination_single_procedure_matches_target() {
        let p = make_proc(Some(100_000));
        let (procs, sum) =
            ReconciliationProcessor::find_exact_combination(&[&p], InternalAmount(100_000))
                .unwrap();
        assert_eq!(procs.len(), 1);
        assert_eq!(sum, InternalAmount(100_000));
    }

    #[test]
    fn exact_combination_two_procedures_sum_to_target() {
        let p1 = make_proc(Some(30_000));
        let p2 = make_proc(Some(70_000));
        let (procs, sum) =
            ReconciliationProcessor::find_exact_combination(&[&p1, &p2], InternalAmount(100_000))
                .unwrap();
        assert_eq!(procs.len(), 2);
        assert_eq!(sum, InternalAmount(100_000));
    }

    #[test]
    fn exact_combination_no_subset_sums_to_target_returns_none() {
        let p1 = make_proc(Some(50_000));
        let p2 = make_proc(Some(60_000));
        assert!(ReconciliationProcessor::find_exact_combination(
            &[&p1, &p2],
            InternalAmount(100_000)
        )
        .is_none());
    }

    #[test]
    fn exact_combination_skips_none_billed_amount_in_sum() {
        let p_none = make_proc(None);
        let p_match = make_proc(Some(100_000));
        // None contributes 0; p_match alone satisfies target
        assert!(ReconciliationProcessor::find_exact_combination(
            &[&p_none, &p_match],
            InternalAmount(100_000)
        )
        .is_some());
    }

    // --- find_best_combination ---

    #[test]
    fn best_combination_empty_candidates_returns_none() {
        assert!(
            ReconciliationProcessor::find_best_combination(&[], InternalAmount(100_000)).is_none()
        );
    }

    #[test]
    fn best_combination_prefers_exact_over_closest() {
        let p_exact = make_proc(Some(100_000));
        let p_close = make_proc(Some(99_000));
        let (_, sum) = ReconciliationProcessor::find_best_combination(
            &[&p_close, &p_exact],
            InternalAmount(100_000),
        )
        .unwrap();
        assert_eq!(sum, InternalAmount(100_000));
    }

    #[test]
    fn best_combination_returns_closest_when_no_exact_match() {
        let p_far = make_proc(Some(50_000));
        let p_close = make_proc(Some(95_000));
        let (_, sum) = ReconciliationProcessor::find_best_combination(
            &[&p_far, &p_close],
            InternalAmount(100_000),
        )
        .unwrap();
        // |95-100|=5 < |50-100|=50
        assert_eq!(sum, InternalAmount(95_000));
    }

    #[test]
    fn best_combination_with_more_than_max_candidates_no_exact_returns_none() {
        // MAX_SUBSET_CANDIDATES = 15; 16 candidates, no subset sums to 100_000
        // All are 7_000: 7 does not divide 100, so no k*7_000 == 100_000
        let procs: Vec<_> = (0..16).map(|_| make_proc(Some(7_000))).collect();
        let refs: Vec<&_> = procs.iter().collect();
        assert!(
            ReconciliationProcessor::find_best_combination(&refs, InternalAmount(100_000))
                .is_none()
        );
    }

    // --- find_single_exact_match ---

    #[test]
    fn single_exact_match_finds_matching_procedure() {
        let p1 = make_proc(Some(50_000));
        let p2 = make_proc(Some(100_000));
        let found =
            ReconciliationProcessor::find_single_exact_match(&[&p1, &p2], InternalAmount(100_000))
                .unwrap();
        assert_eq!(found.billed_amount, Some(100_000));
    }

    #[test]
    fn single_exact_match_returns_none_when_absent() {
        let p1 = make_proc(Some(50_000));
        let p2 = make_proc(Some(75_000));
        assert!(ReconciliationProcessor::find_single_exact_match(
            &[&p1, &p2],
            InternalAmount(100_000)
        )
        .is_none());
    }

    #[test]
    fn single_exact_match_skips_procedure_with_none_billed_amount() {
        let p = make_proc(None);
        // None.map(...).unwrap_or(false) → never matches any amount
        assert!(
            ReconciliationProcessor::find_single_exact_match(&[&p], InternalAmount(0)).is_none()
        );
    }

    // --- find_single_closest_match ---

    #[test]
    fn single_closest_match_returns_nearest_by_absolute_difference() {
        let p_far = make_proc(Some(50_000));
        let p_close = make_proc(Some(95_000));
        let p_over = make_proc(Some(200_000));
        let found = ReconciliationProcessor::find_single_closest_match(
            &[&p_far, &p_close, &p_over],
            InternalAmount(100_000),
        )
        .unwrap();
        // |50-100|=50, |95-100|=5, |200-100|=100 → 95_000 wins
        assert_eq!(found.billed_amount, Some(95_000));
    }

    #[test]
    fn single_closest_match_empty_candidates_returns_none() {
        assert!(
            ReconciliationProcessor::find_single_closest_match(&[], InternalAmount(100_000))
                .is_none()
        );
    }

    #[test]
    fn single_closest_match_skips_procedure_with_none_billed_amount() {
        let p_none = make_proc(None);
        let p_valid = make_proc(Some(100_000));
        let found = ReconciliationProcessor::find_single_closest_match(
            &[&p_none, &p_valid],
            InternalAmount(100_000),
        )
        .unwrap();
        assert_eq!(found.billed_amount, Some(100_000));
    }

    // --- next_combination ---

    #[test]
    fn next_combination_advances_last_index() {
        let mut indices = vec![0, 1];
        assert!(next_combination(&mut indices, 4));
        assert_eq!(indices, vec![0, 2]);
    }

    #[test]
    fn next_combination_carries_to_previous_index_when_last_exhausted() {
        // [0, 3] with n=4: indices[1]=3 == n-k+1=3, carry; indices[0]=0 < n-k+0=2 → increment
        let mut indices = vec![0, 3];
        assert!(next_combination(&mut indices, 4));
        assert_eq!(indices, vec![1, 2]);
    }

    #[test]
    fn next_combination_returns_false_when_all_combinations_exhausted() {
        let mut indices = vec![2, 3]; // last combination for n=4, k=2
        assert!(!next_combination(&mut indices, 4));
    }
}

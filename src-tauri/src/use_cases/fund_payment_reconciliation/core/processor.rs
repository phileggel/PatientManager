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
                p.procedure_amount
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
                p.procedure_amount
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
                    .and_then(|proc| proc.procedure_amount.map(InternalAmount))
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

    #[test]
    fn test_internal_amount_from_f64() {
        assert_eq!(InternalAmount::from_f64(10.50).0, 10500);
        assert_eq!(InternalAmount::from_f64(0.01).0, 10);
        assert_eq!(InternalAmount::from_f64(100.00).0, 100000);
    }

    #[test]
    fn test_internal_amount_to_f64() {
        assert_eq!(InternalAmount(10500).to_f64(), 10.5);
        assert_eq!(InternalAmount(10).to_f64(), 0.01);
        assert_eq!(InternalAmount(100000).to_f64(), 100.0);
    }
}

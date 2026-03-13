/// Group reconciliation results into fund payment candidates
use crate::use_cases::fund_payment_reconciliation::api::{
    FundPaymentCandidateFromPdf, PdfProcedureGroup, ReconciliationMatch, ReconciliationResult,
};
use std::collections::HashMap;

/// Groups reconciliation results into fund payment candidates ready for user action
pub struct CandidateGrouper;

impl CandidateGrouper {
    pub fn group(
        reconciliation: &ReconciliationResult,
        pdf_groups: &[PdfProcedureGroup],
    ) -> anyhow::Result<Vec<FundPaymentCandidateFromPdf>> {
        let mut pdf_group_totals = HashMap::new();
        for group in pdf_groups {
            pdf_group_totals.insert(
                (group.fund_label.clone(), group.payment_date.clone()),
                group.total_amount,
            );
        }

        let mut procedure_groups: HashMap<(String, String), Vec<String>> = HashMap::new();
        let mut group_amounts: HashMap<(String, String), i64> = HashMap::new();

        // Iterate through unified matches array and extract procedures to include
        for match_result in &reconciliation.matches {
            match match_result {
                // Include perfect matches (auto-resolved)
                ReconciliationMatch::PerfectSingleMatch { pdf_line, db_match } => {
                    let key = (pdf_line.fund_name.clone(), pdf_line.payment_date.clone());
                    procedure_groups
                        .entry(key.clone())
                        .or_default()
                        .push(db_match.procedure_id.clone());
                    *group_amounts.entry(key).or_insert(0) += db_match.amount.unwrap_or(0);
                }
                ReconciliationMatch::PerfectGroupMatch {
                    pdf_line,
                    db_matches,
                } => {
                    let key = (pdf_line.fund_name.clone(), pdf_line.payment_date.clone());
                    for m in db_matches {
                        procedure_groups
                            .entry(key.clone())
                            .or_default()
                            .push(m.procedure_id.clone());
                        *group_amounts.entry(key.clone()).or_insert(0) += m.amount.unwrap_or(0);
                    }
                }
                // Include issue matches (to be resolved by auto-correction)
                ReconciliationMatch::SingleMatchIssue { pdf_line, db_match } => {
                    let key = (pdf_line.fund_name.clone(), pdf_line.payment_date.clone());
                    procedure_groups
                        .entry(key.clone())
                        .or_default()
                        .push(db_match.procedure_id.clone());
                    *group_amounts.entry(key).or_insert(0) += db_match.amount.unwrap_or(0);
                }
                ReconciliationMatch::GroupMatchIssue {
                    pdf_line,
                    db_matches,
                } => {
                    let key = (pdf_line.fund_name.clone(), pdf_line.payment_date.clone());
                    for m in db_matches {
                        procedure_groups
                            .entry(key.clone())
                            .or_default()
                            .push(m.procedure_id.clone());
                        *group_amounts.entry(key.clone()).or_insert(0) += m.amount.unwrap_or(0);
                    }
                }
                // Include NotFound issues as candidates with empty procedure lists
                // This ensures monoline groups without any DB matches still get a candidate
                ReconciliationMatch::NotFoundIssue { pdf_line, .. } => {
                    let key = (pdf_line.fund_name.clone(), pdf_line.payment_date.clone());
                    // Initialize empty procedure list if not already present
                    procedure_groups.entry(key.clone()).or_default();
                    // matched_amount stays at 0 for NotFound
                    group_amounts.entry(key).or_insert(0);
                }
                // Include TooMany issues as candidates for future resolution
                ReconciliationMatch::TooManyMatchIssue { pdf_line, .. } => {
                    let key = (pdf_line.fund_name.clone(), pdf_line.payment_date.clone());
                    // Initialize empty procedure list if not already present
                    procedure_groups.entry(key.clone()).or_default();
                    // matched_amount stays at 0 for TooMany
                    group_amounts.entry(key).or_insert(0);
                }
            }
        }

        let mut candidates = Vec::new();
        for ((fund_label, payment_date), procedure_ids) in procedure_groups {
            let total_amount = pdf_group_totals
                .get(&(fund_label.clone(), payment_date.clone()))
                .copied()
                .unwrap_or(0);
            let matched_amount = group_amounts
                .get(&(fund_label.clone(), payment_date.clone()))
                .copied()
                .unwrap_or(0);
            candidates.push(FundPaymentCandidateFromPdf {
                fund_label,
                payment_date,
                total_amount,
                procedure_ids,
                matched_amount,
                is_fully_covered: total_amount == matched_amount,
            });
        }

        Ok(candidates)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_result() {
        let result = ReconciliationResult { matches: vec![] };
        let pdf_groups = vec![];

        let candidates = CandidateGrouper::group(&result, &pdf_groups);
        assert!(candidates.is_ok());
        assert_eq!(candidates.unwrap().len(), 0);
    }
}

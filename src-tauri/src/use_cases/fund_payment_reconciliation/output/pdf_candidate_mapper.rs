/// Group reconciliation results into fund payment candidates.
use crate::use_cases::fund_payment_reconciliation::api::{
    FundPaymentCandidateFromPdf, PdfProcedureGroup, ReconciliationMatch, ReconciliationResult,
};
use std::collections::HashMap;

pub struct PdfCandidateMapper;

impl PdfCandidateMapper {
    /// Map reconciliation results and PDF groups into fund payment candidates.
    pub fn map(
        reconciliation: &ReconciliationResult,
        groups: &[PdfProcedureGroup],
    ) -> anyhow::Result<Vec<FundPaymentCandidateFromPdf>> {
        // Build group totals keyed by (fund_label, payment_date)
        let mut pdf_group_totals: HashMap<(String, chrono::NaiveDate), i64> = HashMap::new();
        for group in groups {
            pdf_group_totals.insert(
                (group.fund_label.clone(), group.payment_date),
                group.total_amount,
            );
        }

        let mut procedure_groups: HashMap<(String, chrono::NaiveDate), Vec<String>> =
            HashMap::new();
        let mut group_amounts: HashMap<(String, chrono::NaiveDate), i64> = HashMap::new();

        for match_result in &reconciliation.matches {
            match match_result {
                ReconciliationMatch::PerfectSingleMatch { pdf_line, db_match } => {
                    let key = (pdf_line.fund_name.clone(), pdf_line.payment_date);
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
                    let key = (pdf_line.fund_name.clone(), pdf_line.payment_date);
                    for m in db_matches {
                        procedure_groups
                            .entry(key.clone())
                            .or_default()
                            .push(m.procedure_id.clone());
                        *group_amounts.entry(key.clone()).or_insert(0) += m.amount.unwrap_or(0);
                    }
                }
                ReconciliationMatch::SingleMatchIssue { pdf_line, db_match } => {
                    let key = (pdf_line.fund_name.clone(), pdf_line.payment_date);
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
                    let key = (pdf_line.fund_name.clone(), pdf_line.payment_date);
                    for m in db_matches {
                        procedure_groups
                            .entry(key.clone())
                            .or_default()
                            .push(m.procedure_id.clone());
                        *group_amounts.entry(key.clone()).or_insert(0) += m.amount.unwrap_or(0);
                    }
                }
                ReconciliationMatch::NotFoundIssue { pdf_line, .. } => {
                    let key = (pdf_line.fund_name.clone(), pdf_line.payment_date);
                    procedure_groups.entry(key.clone()).or_default();
                    group_amounts.entry(key).or_insert(0);
                }
                ReconciliationMatch::TooManyMatchIssue { pdf_line, .. } => {
                    let key = (pdf_line.fund_name.clone(), pdf_line.payment_date);
                    procedure_groups.entry(key.clone()).or_default();
                    group_amounts.entry(key).or_insert(0);
                }
            }
        }

        let mut candidates = Vec::new();
        for ((fund_label, payment_date), procedure_ids) in procedure_groups {
            let total_amount = pdf_group_totals
                .get(&(fund_label.clone(), payment_date))
                .copied()
                .unwrap_or(0);
            let matched_amount = group_amounts
                .get(&(fund_label.clone(), payment_date))
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
        let groups = vec![];
        let candidates = PdfCandidateMapper::map(&result, &groups);
        assert!(candidates.is_ok());
        assert_eq!(candidates.unwrap().len(), 0);
    }
}

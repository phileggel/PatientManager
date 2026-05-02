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
    use crate::use_cases::fund_payment_reconciliation::api::{
        AnomalyType, DbMatch, NormalizedPdfLine,
    };
    use chrono::NaiveDate;

    fn make_line(fund: &str, amount: i64) -> NormalizedPdfLine {
        NormalizedPdfLine {
            line_index: 0,
            payment_date: NaiveDate::from_ymd_opt(2025, 5, 15).unwrap(),
            invoice_number: "001".to_string(),
            fund_name: fund.to_string(),
            patient_name: "Test".to_string(),
            ssn: "1234".to_string(),
            nature: "SF".to_string(),
            procedure_start_date: NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            procedure_end_date: NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            is_period: false,
            amount,
        }
    }

    fn make_db_match(id: &str, amount: i64) -> DbMatch {
        DbMatch {
            procedure_id: id.to_string(),
            procedure_date: NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            fund_id: None,
            amount: Some(amount),
            anomalies: vec![],
        }
    }

    fn make_group(
        fund_label: &str,
        payment_date: NaiveDate,
        total_amount: i64,
    ) -> PdfProcedureGroup {
        PdfProcedureGroup {
            fund_label: fund_label.to_string(),
            fund_full_name: fund_label.to_string(),
            payment_date,
            total_amount,
            is_total_valid: true,
            lines: vec![],
        }
    }

    #[test]
    fn test_empty_result() {
        let result = ReconciliationResult { matches: vec![] };
        let candidates = PdfCandidateMapper::map(&result, &[]).unwrap();
        assert_eq!(candidates.len(), 0);
    }

    #[test]
    fn test_perfect_single_match_creates_candidate() {
        let pdf_line = make_line("CPAM 93", 50000);
        let db_match = make_db_match("proc-1", 50000);
        let payment_date = pdf_line.payment_date;
        let groups = vec![make_group("CPAM 93", payment_date, 50000)];
        let result = ReconciliationResult {
            matches: vec![ReconciliationMatch::PerfectSingleMatch { pdf_line, db_match }],
        };
        let candidates = PdfCandidateMapper::map(&result, &groups).unwrap();
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].procedure_ids, vec!["proc-1"]);
        assert_eq!(candidates[0].matched_amount, 50000);
        assert!(candidates[0].is_fully_covered);
    }

    #[test]
    fn test_perfect_group_match_includes_all_procedures() {
        let pdf_line = make_line("CPAM 93", 80000);
        let payment_date = pdf_line.payment_date;
        let db_matches = vec![
            make_db_match("proc-a", 50000),
            make_db_match("proc-b", 30000),
        ];
        let groups = vec![make_group("CPAM 93", payment_date, 80000)];
        let result = ReconciliationResult {
            matches: vec![ReconciliationMatch::PerfectGroupMatch {
                pdf_line,
                db_matches,
            }],
        };
        let candidates = PdfCandidateMapper::map(&result, &groups).unwrap();
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].procedure_ids.len(), 2);
        assert_eq!(candidates[0].matched_amount, 80000);
        assert!(candidates[0].is_fully_covered);
    }

    #[test]
    fn test_single_match_issue_creates_candidate() {
        let pdf_line = make_line("CPAM 93", 50000);
        let db_match = DbMatch {
            procedure_id: "proc-1".to_string(),
            procedure_date: NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            fund_id: None,
            amount: Some(48000),
            anomalies: vec![AnomalyType::AmountMismatch],
        };
        let payment_date = pdf_line.payment_date;
        let groups = vec![make_group("CPAM 93", payment_date, 50000)];
        let result = ReconciliationResult {
            matches: vec![ReconciliationMatch::SingleMatchIssue { pdf_line, db_match }],
        };
        let candidates = PdfCandidateMapper::map(&result, &groups).unwrap();
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].matched_amount, 48000);
        assert!(!candidates[0].is_fully_covered);
    }

    #[test]
    fn test_group_match_issue_includes_all_procedures() {
        let pdf_line = make_line("CPAM 93", 80000);
        let payment_date = pdf_line.payment_date;
        let db_matches = vec![
            make_db_match("proc-x", 40000),
            make_db_match("proc-y", 40000),
        ];
        let groups = vec![make_group("CPAM 93", payment_date, 80000)];
        let result = ReconciliationResult {
            matches: vec![ReconciliationMatch::GroupMatchIssue {
                pdf_line,
                db_matches,
            }],
        };
        let candidates = PdfCandidateMapper::map(&result, &groups).unwrap();
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].procedure_ids.len(), 2);
    }

    #[test]
    fn test_not_found_issue_creates_empty_candidate() {
        let pdf_line = make_line("CPAM 93", 50000);
        let payment_date = pdf_line.payment_date;
        let groups = vec![make_group("CPAM 93", payment_date, 50000)];
        let result = ReconciliationResult {
            matches: vec![ReconciliationMatch::NotFoundIssue {
                pdf_line,
                nearby_candidates: vec![],
            }],
        };
        let candidates = PdfCandidateMapper::map(&result, &groups).unwrap();
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].procedure_ids.len(), 0);
        assert_eq!(candidates[0].total_amount, 50000);
    }

    #[test]
    fn test_too_many_match_issue_creates_empty_candidate() {
        let pdf_line = make_line("CPAM 93", 50000);
        let payment_date = pdf_line.payment_date;
        let groups = vec![make_group("CPAM 93", payment_date, 50000)];
        let result = ReconciliationResult {
            matches: vec![ReconciliationMatch::TooManyMatchIssue {
                pdf_line,
                candidate_ids: vec!["a".into(), "b".into()],
            }],
        };
        let candidates = PdfCandidateMapper::map(&result, &groups).unwrap();
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].procedure_ids.len(), 0);
    }
}

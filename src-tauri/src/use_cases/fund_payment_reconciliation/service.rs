use crate::context::fund::FundRepository;
use crate::context::procedure::ProcedureRepository;
use crate::core::logger::BACKEND;
/// Main reconciliation service - orchestration layer
use std::collections::HashSet;
use std::sync::Arc;

use super::api::{
    NormalizedPdfLine, PdfParseResult, PdfProcedureGroup, ReconcileAndCandidatesResponse,
    ReconciliationMatch, ReconciliationResult,
};
use super::core::InternalAmount;
use super::data::{FundCache, ProcedurePoolBuilder};
use super::output::PdfCandidateMapper;
use super::reconciliation::ReconciliationPass;

pub struct ReconciliationService {
    procedure_repository: Arc<dyn ProcedureRepository>,
    fund_repository: Arc<dyn FundRepository>,
}

impl ReconciliationService {
    pub fn new(
        procedure_repository: Arc<dyn ProcedureRepository>,
        fund_repository: Arc<dyn FundRepository>,
    ) -> Self {
        Self {
            procedure_repository,
            fund_repository,
        }
    }

    /// Full reconciliation workflow: match normalized lines → group into candidates.
    ///
    /// `parse_result` is already normalized (French dates parsed by the parser).
    pub async fn reconcile(
        &self,
        parse_result: PdfParseResult,
    ) -> anyhow::Result<ReconcileAndCandidatesResponse> {
        tracing::info!(
            name: BACKEND,
            groups = parse_result.groups.len(),
            lines = parse_result.groups.iter().map(|g| g.lines.len()).sum::<usize>(),
            "Starting full reconciliation workflow"
        );

        // Run matching algorithm
        let reconciliation = self.reconcile_groups(&parse_result.groups).await?;

        // Group into fund payment candidates
        let candidates = PdfCandidateMapper::map(&reconciliation, &parse_result.groups)?;

        Ok(ReconcileAndCandidatesResponse {
            candidates,
            reconciliation,
        })
    }

    /// Internal: run the reconciliation matching algorithm on normalized groups.
    async fn reconcile_groups(
        &self,
        groups: &[PdfProcedureGroup],
    ) -> anyhow::Result<ReconciliationResult> {
        let all_lines: Vec<&NormalizedPdfLine> =
            groups.iter().flat_map(|g| g.lines.iter()).collect();

        tracing::info!(name: BACKEND, "Starting reconciliation for {} PDF lines", all_lines.len());

        if all_lines.is_empty() {
            return Ok(ReconciliationResult {
                matches: Vec::new(),
            });
        }

        let pdf_lines_count = all_lines.len();

        // Load data
        let fund_cache = FundCache::build(self.fund_repository.clone()).await?;

        let pool = ProcedurePoolBuilder::new(self.procedure_repository.clone())
            .build(all_lines.as_slice())
            .await?;

        let pool_size: usize = pool.values().map(|v| v.len()).sum();
        tracing::info!(name: BACKEND, pool_ssn_groups = pool.len(), total_procedures = pool_size, "Procedure pool loaded");

        // Owned lines for the pass (clone is cheap — NormalizedPdfLine contains only primitives + Strings)
        let owned_lines: Vec<NormalizedPdfLine> = groups
            .iter()
            .flat_map(|g| g.lines.iter().cloned())
            .collect();

        // Run 8 reconciliation passes
        let mut pass = ReconciliationPass::new(pool);
        for pass_num in 1..=8u8 {
            tracing::debug!(name: BACKEND, pass = pass_num, "Running reconciliation pass");
            pass.run(pass_num, &owned_lines, &fund_cache).await?;
        }

        // Build result
        let pass_result = pass.into_result();
        let matched_lines = pass_result.raw_matches.len();
        tracing::info!(name: BACKEND, matched_lines = matched_lines, unmatched = pdf_lines_count - matched_lines, "After 8 reconciliation passes");

        let mut matches = Vec::new();
        let mut perfect_single_count = 0;
        let mut perfect_group_count = 0;
        let mut single_issue_count = 0;
        let mut group_issue_count = 0;
        let mut too_many_count = 0;
        let mut not_found_count = 0;

        let already_matched_ids: HashSet<String> = pass_result
            .raw_matches
            .values()
            .flat_map(|matches| matches.iter().map(|m| m.procedure_id.clone()))
            .collect();

        for normalized_line in owned_lines {
            let line_index = normalized_line.line_index;

            if let Some(candidate_ids) = pass_result.too_many_issues.get(&line_index) {
                matches.push(ReconciliationMatch::TooManyMatchIssue {
                    pdf_line: normalized_line,
                    candidate_ids: candidate_ids.clone(),
                });
                too_many_count += 1;
                continue;
            }

            let db_matches = pass_result.raw_matches.get(&line_index);

            match db_matches {
                None => {
                    tracing::warn!(
                        name: BACKEND,
                        line_index = line_index,
                        ssn = %normalized_line.ssn,
                        pdf_fund = %normalized_line.fund_name,
                        pdf_amount = InternalAmount(normalized_line.amount).to_f64(),
                        "Procedure not found in database"
                    );
                    not_found_count += 1;

                    let start = normalized_line.procedure_start_date - chrono::Duration::days(1);
                    let end = normalized_line.procedure_end_date + chrono::Duration::days(1);
                    let candidate_rows = self
                        .procedure_repository
                        .find_unreconciled_by_date_range(
                            &start.format("%Y-%m-%d").to_string(),
                            &end.format("%Y-%m-%d").to_string(),
                        )
                        .await
                        .inspect_err(|e| tracing::warn!(name: BACKEND, error = %e, "Failed to fetch nearby candidates for NotFound line"))
                        .unwrap_or_default();

                    let nearby_candidates: Vec<super::api::NotFoundCandidate> = candidate_rows
                        .into_iter()
                        .filter(|r| !already_matched_ids.contains(&r.procedure_id))
                        .map(|r| super::api::NotFoundCandidate {
                            procedure_id: r.procedure_id,
                            patient_name: r.patient_name.unwrap_or_default(),
                            ssn: r.patient_ssn.unwrap_or_default(),
                            procedure_date: r.procedure_date,
                            amount: r.amount.unwrap_or(0),
                        })
                        .collect();

                    matches.push(ReconciliationMatch::NotFoundIssue {
                        pdf_line: normalized_line,
                        nearby_candidates,
                    });
                }
                Some(db_matches_vec) => {
                    let is_perfect = super::reconciliation::PerfectMatchChecker::is_perfect_match(
                        &normalized_line,
                        db_matches_vec,
                        &pass_result.pool,
                    );

                    if is_perfect {
                        if db_matches_vec.len() == 1 {
                            perfect_single_count += 1;
                            if let Some(db_match) = db_matches_vec.first() {
                                matches.push(ReconciliationMatch::PerfectSingleMatch {
                                    pdf_line: normalized_line,
                                    db_match: db_match.clone(),
                                });
                            }
                        } else {
                            perfect_group_count += 1;
                            matches.push(ReconciliationMatch::PerfectGroupMatch {
                                pdf_line: normalized_line,
                                db_matches: db_matches_vec.clone(),
                            });
                        }
                    } else if db_matches_vec.len() == 1 {
                        single_issue_count += 1;
                        if let Some(db_match) = db_matches_vec.first() {
                            matches.push(ReconciliationMatch::SingleMatchIssue {
                                pdf_line: normalized_line,
                                db_match: db_match.clone(),
                            });
                        }
                    } else {
                        group_issue_count += 1;
                        matches.push(ReconciliationMatch::GroupMatchIssue {
                            pdf_line: normalized_line,
                            db_matches: db_matches_vec.clone(),
                        });
                    }
                }
            }
        }

        let total_issues =
            single_issue_count + group_issue_count + too_many_count + not_found_count;

        tracing::info!(
            name: BACKEND,
            perfect_single = perfect_single_count,
            perfect_group = perfect_group_count,
            single_issue = single_issue_count,
            group_issue = group_issue_count,
            too_many = too_many_count,
            not_found = not_found_count,
            total_matches = matches.len(),
            total_issues = total_issues,
            "Reconciliation complete: {} perfect matches, {} issues to resolve",
            perfect_single_count + perfect_group_count,
            total_issues
        );

        Ok(ReconciliationResult { matches })
    }

    /// Find all unreconciled procedures in a date range (for post-reconciliation report)
    pub async fn find_unreconciled_in_range(
        &self,
        start_date: &str,
        end_date: &str,
    ) -> anyhow::Result<Vec<super::api::UnreconciledProcedure>> {
        let rows = self
            .procedure_repository
            .find_unreconciled_by_date_range(start_date, end_date)
            .await?;

        Ok(rows
            .into_iter()
            .map(|r| super::api::UnreconciledProcedure {
                procedure_id: r.procedure_id,
                patient_name: r.patient_name.unwrap_or_default(),
                ssn: r.patient_ssn.unwrap_or_default(),
                procedure_date: r.procedure_date,
                amount: r.amount.unwrap_or(0),
            })
            .collect())
    }
}

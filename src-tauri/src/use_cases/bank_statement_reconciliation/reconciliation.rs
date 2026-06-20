//! Reconciliation model and recompute engine for the unified bank reconciliation
//! list (BAS-060–069, BAS-090–094).
//!
//! `compute_reconciliation` is the sole entry point: it is a pure read-only function
//! that derives the full `BankStatementReconciliation` from the parsed statement plus
//! an ordered list of user corrections, without writing anything to the
//! database.

use std::collections::HashSet;

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::context::fund::FundPaymentGroup;
use crate::use_cases::bank_statement_reconciliation::{
    bank_pdf_codec::{BankStatementCreditLine, BankStatementParseResult},
    error::{BankStatementReconciliationError, BankStatementReconciliationTask},
    label_mapping_repo::BankFundLabelMapping,
    orchestrator::MAX_DATE_OFFSET_DAYS,
};

// =============================================================================
// Wire types — contract (BAS-060–102)
// =============================================================================

/// A user correction, replayed in order by `compute_reconciliation` / validate.
/// Reverting = remove from the list and recompute (BAS-065).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type")]
pub enum BankStatementCorrection {
    /// BAS-066 / BAS-030 — link a label to a fund or mark it rejected.
    LinkFund {
        bank_label: String,
        assignment: FundAssignment,
    },
    /// BAS-090 — assign 1..N groups to a line (empty = unassign).
    AssignGroups {
        line_id: String,
        group_ids: Vec<String>,
    },
    /// BAS-092 — acknowledge the uncovered remainder on a partial line.
    AcknowledgeRemainder { line_id: String },
}

/// BAS-030/066 — typed fund assignment; avoids the `"REJECTED"` string
/// sentinel used on the old wire surface (ADR-001 tightening).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type")]
pub enum FundAssignment {
    Fund { fund_id: String },
    Rejected,
}

/// The recomputed reconciliation state: every statement line with its status
/// (BAS-061), candidate proposals, and running coverage totals.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct BankStatementReconciliation {
    /// All lines in document order (BAS-060).
    pub lines: Vec<BankStatementLine>,
    /// BAS-069 — count of lines whose status is Matched or Rejected.
    pub resolved_count: u32,
    /// BAS-069 — count of lines still needing correction.
    pub needs_correction_count: u32,
}

/// One bank credit line within the reconciliation.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct BankStatementLine {
    /// Stable id for this line within the reconciliation session.
    pub line_id: String,
    pub credit_line: BankStatementCreditLine,
    pub status: BankStatementLineStatus,
    /// Resolved fund once linked; absent while needs-link.
    pub fund_id: Option<String>,
    /// 0..N assigned group ids (BAS-090).
    pub assigned_group_ids: Vec<String>,
    /// Σ assigned group amounts (BAS-091).
    pub covered_amount: i64,
    /// BAS-092 — true when the user acknowledged the remainder.
    pub remainder_acknowledged: bool,
    /// BAS-068 — ranked candidate groups for needs-group / partial.
    pub candidate_groups: Vec<BankStatementCandidate>,
    /// BAS-032/066 — heuristic suggestion for the link-fund modal.
    pub suggested_fund_id: Option<String>,
    pub suggested_fund_name: Option<String>,
}

/// BAS-061 — the six per-line statuses.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum BankStatementLineStatus {
    /// Fully covered: auto-matched 1:1, or Σ groups (+ acknowledged remainder) == line amount.
    Matched,
    /// Label not yet linked to a fund.
    NeedsLink,
    /// Fund known, zero groups assigned, at least one eligible candidate.
    NeedsGroup,
    /// 1+ groups assigned but line not fully covered and no remainder acknowledged.
    Partial,
    /// Label marked not-a-fund-payment (BAS-030).
    Rejected,
    /// Fund known, zero groups assigned, no eligible candidate, not acknowledged.
    Unresolved,
}

/// BAS-068 — one ranked candidate group for an unresolved or partial line.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct BankStatementCandidate {
    pub group_id: String,
    pub fund_id: String,
    pub payment_date: String,
    pub total_amount: i64,
    /// True if this group's amount exactly matches the line's outstanding amount.
    pub is_exact_amount: bool,
}

// =============================================================================
// Repositories needed by compute_reconciliation (read-only)
// =============================================================================

/// All repositories needed by `compute_reconciliation` in one struct so the signature
/// stays manageable.
pub struct BankStatementReconciliationRepos<'a> {
    pub mappings: &'a [BankFundLabelMapping],
    pub groups: &'a [FundPaymentGroup],
    /// Ids of every known fund, used to reject a `LinkFund` correction that
    /// references a fund that does not exist (`FundNotFound`).
    pub valid_fund_ids: &'a HashSet<String>,
}

// =============================================================================
// compute_reconciliation
// =============================================================================

/// Internal working state for one line while the corrections are replayed.
struct WorkingLine {
    line_id: String,
    credit_line: BankStatementCreditLine,
    /// Some(fund_id) when linked to a fund, None when not yet linked.
    fund_id: Option<String>,
    /// True when the label was explicitly rejected (BAS-030).
    rejected: bool,
    assigned_group_ids: Vec<String>,
    remainder_acknowledged: bool,
    /// Parsed credit-line date (None when the date string is malformed).
    line_date: Option<NaiveDate>,
    suggested_fund_id: Option<String>,
    suggested_fund_name: Option<String>,
}

/// Compute the full reconciliation as a pure function of the parsed
/// statement plus an ordered list of user corrections (BAS-064).
///
/// Read-only — no DB writes.
pub fn compute_reconciliation(
    parse_result: &BankStatementParseResult,
    repos: &BankStatementReconciliationRepos<'_>,
    corrections: &[BankStatementCorrection],
) -> Result<BankStatementReconciliation, BankStatementReconciliationError> {
    // --- 1. Seed working lines from saved mappings (BAS-061). ---
    let mut lines: Vec<WorkingLine> = parse_result
        .credit_lines
        .iter()
        .enumerate()
        .map(|(idx, cl)| {
            let mapping = repos.mappings.iter().find(|m| m.bank_label == cl.label);
            let (fund_id, rejected) = match mapping {
                Some(m) => match &m.fund_id {
                    Some(fid) => (Some(fid.clone()), false),
                    None => (None, true), // NULL fund_id = rejected (BAS-030).
                },
                None => (None, false),
            };
            WorkingLine {
                line_id: format!("line-{idx}"),
                line_date: NaiveDate::parse_from_str(&cl.date, "%Y-%m-%d").ok(),
                credit_line: cl.clone(),
                fund_id,
                rejected,
                assigned_group_ids: Vec::new(),
                remainder_acknowledged: false,
                suggested_fund_id: None,
                suggested_fund_name: None,
            }
        })
        .collect();

    // `consumed` tracks every group already assigned to a line (BAS-067).
    let mut consumed: HashSet<String> = HashSet::new();

    // --- 2. Initial auto-match (BAS-050–054). ---
    auto_match(&mut lines, repos.groups, &mut consumed);

    // --- 3. Replay corrections in order (BAS-064). ---
    for correction in corrections {
        match correction {
            BankStatementCorrection::LinkFund {
                bank_label,
                assignment,
            } => {
                if let FundAssignment::Fund { fund_id } = assignment {
                    if !repos.valid_fund_ids.contains(fund_id) {
                        return Err(BankStatementReconciliationTask::FundNotFound.into());
                    }
                }
                apply_link_fund(
                    &mut lines,
                    repos.groups,
                    &mut consumed,
                    bank_label,
                    assignment,
                );
            }
            BankStatementCorrection::AssignGroups { line_id, group_ids } => {
                apply_assign_groups(&mut lines, repos.groups, &mut consumed, line_id, group_ids)?;
            }
            BankStatementCorrection::AcknowledgeRemainder { line_id } => {
                apply_acknowledge_remainder(&mut lines, line_id)?;
            }
        }
    }

    // --- 4. Derive per-line status + candidates (BAS-061, BAS-068). ---
    let reconciliation_lines: Vec<BankStatementLine> = lines
        .iter()
        .map(|wl| finalize_line(wl, repos.groups, &consumed))
        .collect();

    let resolved_count = reconciliation_lines
        .iter()
        .filter(|l| {
            matches!(
                l.status,
                BankStatementLineStatus::Matched | BankStatementLineStatus::Rejected
            )
        })
        .count() as u32;
    let needs_correction_count = reconciliation_lines.len() as u32 - resolved_count;

    Ok(BankStatementReconciliation {
        lines: reconciliation_lines,
        resolved_count,
        needs_correction_count,
    })
}

/// BAS-050–054 — auto-match resolved (fund-known, not rejected, unassigned)
/// lines against eligible unsettled groups. Exact fund + exact amount + date
/// tolerance, exclusive (a matched line and group are both locked).
///
/// Lines are processed oldest-first (BAS-052) with the date tolerance
/// tightened from the widest offset down to exact-day to favour broader
/// matches on the oldest lines first.
fn auto_match(
    lines: &mut [WorkingLine],
    groups: &[FundPaymentGroup],
    consumed: &mut HashSet<String>,
) {
    // Candidate line indices: fund known, not rejected, no groups yet.
    let mut order: Vec<usize> = lines
        .iter()
        .enumerate()
        .filter(|(_, l)| l.fund_id.is_some() && !l.rejected && l.assigned_group_ids.is_empty())
        .map(|(i, _)| i)
        .collect();
    // Oldest line first (BAS-052); lines with an unparseable date sort last.
    let dates: Vec<Option<NaiveDate>> = lines.iter().map(|l| l.line_date).collect();
    order.sort_by(|&a, &b| dates.get(a).cmp(&dates.get(b)));

    for offset in (0..=MAX_DATE_OFFSET_DAYS).rev() {
        for &idx in &order {
            let Some(line) = lines.get(idx) else {
                continue;
            };
            if !line.assigned_group_ids.is_empty() {
                continue; // already matched at a wider offset
            }
            let (Some(line_date), Some(fund_id)) = (line.line_date, line.fund_id.clone()) else {
                continue;
            };
            let amount = line.credit_line.amount;

            let matched = groups
                .iter()
                .find(|g| {
                    !g.is_locked
                        && !consumed.contains(&g.id)
                        && g.fund_id == fund_id
                        && g.total_amount == amount
                        && (line_date - g.payment_date).num_days() == offset
                })
                .map(|g| g.id.clone());

            if let (Some(group_id), Some(line)) = (matched, lines.get_mut(idx)) {
                line.assigned_group_ids.push(group_id.clone());
                consumed.insert(group_id);
            }
        }
    }
}

/// BAS-066 — link or reject all lines sharing `bank_label`, then re-run the
/// auto-match so newly-resolved lines that now hit an eligible group resolve to
/// Matched.
fn apply_link_fund(
    lines: &mut [WorkingLine],
    groups: &[FundPaymentGroup],
    consumed: &mut HashSet<String>,
    bank_label: &str,
    assignment: &FundAssignment,
) {
    for line in lines.iter_mut() {
        if line.credit_line.label != bank_label {
            continue;
        }
        match assignment {
            FundAssignment::Fund { fund_id } => {
                line.fund_id = Some(fund_id.clone());
                line.rejected = false;
            }
            FundAssignment::Rejected => {
                // Release any previously assigned groups and reject the line.
                for gid in line.assigned_group_ids.drain(..) {
                    consumed.remove(&gid);
                }
                line.fund_id = None;
                line.rejected = true;
                line.remainder_acknowledged = false;
            }
        }
    }
    // Re-attempt auto-match for the freshly-linked lines (BAS-066).
    auto_match(lines, groups, consumed);
}

/// BAS-067/090/091/094 — assign an explicit set of groups to one line. Empty
/// `group_ids` unassigns (BAS-062). Rejects ineligible, already-consumed, or
/// overflowing assignments with a typed error; the reconciliation is left unchanged on
/// rejection (validation precedes mutation).
fn apply_assign_groups(
    lines: &mut [WorkingLine],
    groups: &[FundPaymentGroup],
    consumed: &mut HashSet<String>,
    line_id: &str,
    group_ids: &[String],
) -> Result<(), BankStatementReconciliationError> {
    let line = lines
        .iter_mut()
        .find(|l| l.line_id == line_id)
        .ok_or(BankStatementReconciliationTask::LineNotFound)?;

    let line_amount = line.credit_line.amount;
    let line_fund = line.fund_id.clone();
    let currently_assigned: HashSet<String> = line.assigned_group_ids.iter().cloned().collect();

    // Validate the whole requested set before mutating anything.
    let mut total: i64 = 0;
    for gid in group_ids {
        let group = groups
            .iter()
            .find(|g| &g.id == gid)
            .ok_or(BankStatementReconciliationTask::GroupNotEligible)?;

        // BAS-090 eligibility: same fund as the line, not locked / settled.
        if group.is_locked || line_fund.as_deref() != Some(group.fund_id.as_str()) {
            return Err(BankStatementReconciliationTask::GroupNotEligible.into());
        }

        // BAS-067: a group consumed by another line cannot be reassigned here.
        if consumed.contains(gid) && !currently_assigned.contains(gid) {
            return Err(BankStatementReconciliationTask::GroupAlreadyConsumed.into());
        }

        total += group.total_amount;
    }

    // BAS-094: the assigned total may never exceed the line amount.
    if total > line_amount {
        return Err(BankStatementReconciliationTask::AssignmentOverflow.into());
    }

    // Commit: release the line's previous groups, then claim the new set.
    for gid in line.assigned_group_ids.drain(..) {
        consumed.remove(&gid);
    }
    for gid in group_ids {
        consumed.insert(gid.clone());
    }
    line.assigned_group_ids = group_ids.to_vec();
    // Re-assigning resets a prior remainder acknowledgment so it cannot dangle.
    line.remainder_acknowledged = false;

    Ok(())
}

/// BAS-092 — acknowledge the uncovered remainder on a line.
fn apply_acknowledge_remainder(
    lines: &mut [WorkingLine],
    line_id: &str,
) -> Result<(), BankStatementReconciliationError> {
    let line = lines
        .iter_mut()
        .find(|l| l.line_id == line_id)
        .ok_or(BankStatementReconciliationTask::LineNotFound)?;
    line.remainder_acknowledged = true;
    Ok(())
}

/// Derive the final `BankStatementLine` (status + candidate proposals) from the
/// working state (BAS-061, BAS-068).
fn finalize_line(
    wl: &WorkingLine,
    groups: &[FundPaymentGroup],
    consumed: &HashSet<String>,
) -> BankStatementLine {
    let line_amount = wl.credit_line.amount;
    let covered_amount: i64 = wl
        .assigned_group_ids
        .iter()
        .filter_map(|gid| groups.iter().find(|g| &g.id == gid))
        .map(|g| g.total_amount)
        .sum();

    let status = if wl.rejected {
        BankStatementLineStatus::Rejected
    } else if wl.fund_id.is_none() {
        BankStatementLineStatus::NeedsLink
    } else if !wl.assigned_group_ids.is_empty() {
        if covered_amount == line_amount || wl.remainder_acknowledged {
            BankStatementLineStatus::Matched
        } else {
            BankStatementLineStatus::Partial
        }
    } else {
        // Fund known, no groups assigned: NeedsGroup if a candidate exists,
        // else Unresolved (BAS-061).
        let outstanding = line_amount - covered_amount;
        let has_candidate = !candidate_groups(wl, groups, consumed, outstanding).is_empty();
        if has_candidate {
            BankStatementLineStatus::NeedsGroup
        } else {
            BankStatementLineStatus::Unresolved
        }
    };

    let outstanding = line_amount - covered_amount;
    let candidate_groups = candidate_groups(wl, groups, consumed, outstanding);

    BankStatementLine {
        line_id: wl.line_id.clone(),
        credit_line: wl.credit_line.clone(),
        status,
        fund_id: wl.fund_id.clone(),
        assigned_group_ids: wl.assigned_group_ids.clone(),
        covered_amount,
        remainder_acknowledged: wl.remainder_acknowledged,
        candidate_groups,
        suggested_fund_id: wl.suggested_fund_id.clone(),
        suggested_fund_name: wl.suggested_fund_name.clone(),
    }
}

/// BAS-068 — rank eligible candidate groups for a line: same fund, not
/// locked/consumed, within date tolerance, amount ≤ outstanding (BAS-090).
/// Ordered exact-amount first, then by date proximity.
fn candidate_groups(
    wl: &WorkingLine,
    groups: &[FundPaymentGroup],
    consumed: &HashSet<String>,
    outstanding: i64,
) -> Vec<BankStatementCandidate> {
    let Some(fund_id) = wl.fund_id.as_deref() else {
        return Vec::new();
    };
    let Some(line_date) = wl.line_date else {
        return Vec::new();
    };

    let mut candidates: Vec<(i64, BankStatementCandidate)> = groups
        .iter()
        .filter(|g| {
            !g.is_locked
                && !consumed.contains(&g.id)
                && g.fund_id == fund_id
                && g.total_amount <= outstanding
        })
        .filter_map(|g| {
            let offset = (line_date - g.payment_date).num_days();
            if !(0..=MAX_DATE_OFFSET_DAYS).contains(&offset) {
                return None;
            }
            Some((
                offset,
                BankStatementCandidate {
                    group_id: g.id.clone(),
                    fund_id: g.fund_id.clone(),
                    payment_date: g.payment_date.format("%Y-%m-%d").to_string(),
                    total_amount: g.total_amount,
                    is_exact_amount: g.total_amount == outstanding,
                },
            ))
        })
        .collect();

    // Exact-amount first, then nearest date (smallest offset).
    candidates.sort_by(|(off_a, ca), (off_b, cb)| {
        cb.is_exact_amount
            .cmp(&ca.is_exact_amount)
            .then(off_a.cmp(off_b))
    });

    candidates.into_iter().map(|(_, c)| c).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    // A `LinkFund` correction referencing a fund id absent from the known funds
    // is rejected with `FundNotFound`, leaving compute_reconciliation to surface the
    // typed error rather than silently linking a phantom fund.
    #[test]
    fn link_fund_to_unknown_fund_returns_fund_not_found() {
        let parse_result = BankStatementParseResult {
            iban: None,
            period: None,
            credit_lines: vec![BankStatementCreditLine {
                date: "2026-01-15".to_string(),
                label: "CPAM93".to_string(),
                amount: 100_000,
            }],
            total_credits: 100_000,
            unparsed_count: 0,
        };
        let valid_fund_ids: HashSet<String> = std::iter::once("fund-1".to_string()).collect();
        let repos = BankStatementReconciliationRepos {
            mappings: &[],
            groups: &[],
            valid_fund_ids: &valid_fund_ids,
        };
        let corrections = vec![BankStatementCorrection::LinkFund {
            bank_label: "CPAM93".to_string(),
            assignment: FundAssignment::Fund {
                fund_id: "fund-unknown".to_string(),
            },
        }];

        let err = compute_reconciliation(&parse_result, &repos, &corrections)
            .expect_err("LinkFund to an unknown fund must be rejected");
        assert!(matches!(
            err,
            BankStatementReconciliationError::Task(BankStatementReconciliationTask::FundNotFound)
        ));
    }
}

//! Reconciliation model and recompute engine for the unified bank reconciliation
//! list (BAS-060–069, BAS-090–094).
//!
//! `compute_reconciliation` is the sole entry point: it is a pure read-only function
//! that derives the full `BankStatementReconciliation` from the parsed statement plus
//! an ordered list of user corrections, without writing anything to the
//! database.

use std::collections::{HashMap, HashSet};

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::context::fund::{Fund, FundPaymentGroup};
use crate::context::procedure::OpenProcedureCandidate;
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
    /// BAS-113 — assign 1..N open procedures to a line (empty = unassign).
    /// Mutually exclusive with `AssignGroups` per line (correction-list cascade).
    AssignProcedures {
        line_id: String,
        procedure_ids: Vec<String>,
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
    /// 0..N assigned open-procedure ids (BAS-113); mutually exclusive with
    /// `assigned_group_ids` per line.
    pub assigned_procedure_ids: Vec<String>,
    /// Σ assigned settlement-item amounts — group totals or procedure billed
    /// amounts (BAS-091/113).
    pub covered_amount: i64,
    /// BAS-092 — true when the user acknowledged the remainder.
    pub remainder_acknowledged: bool,
    /// BAS-068 — ranked candidate groups for needs-group / partial,
    /// filtered to the line's fund (the default view); not date-bounded.
    pub candidate_groups: Vec<BankStatementCandidate>,
    /// BAS-068 — ranked candidate groups across ALL funds (not locked or
    /// consumed, any age); shown when the user broadens the search.
    pub broadened_candidates: Vec<BankStatementCandidate>,
    /// BAS-112 — the linked fund's open procedures, oldest first; empty while
    /// needs-link (the pool is scoped to the linked fund).
    pub candidate_procedures: Vec<BankStatementProcedureCandidate>,
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
    /// Resolved fund name so the candidate row is identifiable, in particular
    /// in the broadened (fund-agnostic) view (BAS-068).
    pub fund_name: String,
    pub payment_date: String,
    pub total_amount: i64,
    /// True if this group's amount exactly matches the line amount (the
    /// recomposition basis — see `finalize_line`).
    pub is_exact_amount: bool,
}

/// BAS-112 — one open-procedure candidate for a linked line's procedure scope.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct BankStatementProcedureCandidate {
    pub procedure_id: String,
    /// Patient display name, resolved for the candidate row; empty when the
    /// patient is anonymous.
    pub patient_name: String,
    pub procedure_date: String,
    /// The billed amount — the only amount this flow knows (BAS-117).
    pub billed_amount: i64,
    /// True if the billed amount exactly matches the line amount.
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
    /// Every known fund. Used to reject a `LinkFund` correction that references a
    /// fund that does not exist (`FundNotFound`) and to drive the heuristic
    /// fund suggestion on unmapped labels (BAS-032).
    pub funds: &'a [Fund],
    /// The open procedures of every known fund keyed by fund id (BAS-112) —
    /// the procedure-scope candidate pool for linked lines.
    pub open_procedures: &'a HashMap<String, Vec<OpenProcedureCandidate>>,
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
    assigned_procedure_ids: Vec<String>,
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
            // BAS-032 — for an unmapped label (no saved mapping), run the
            // heuristic to surface a suggestion for the link-fund modal.
            let (suggested_fund_id, suggested_fund_name) = match mapping {
                None => suggest_fund(&cl.label, repos.funds),
                Some(_) => (None, None),
            };
            WorkingLine {
                line_id: format!("line-{idx}"),
                line_date: NaiveDate::parse_from_str(&cl.date, "%Y-%m-%d").ok(),
                credit_line: cl.clone(),
                fund_id,
                rejected,
                assigned_group_ids: Vec::new(),
                assigned_procedure_ids: Vec::new(),
                remainder_acknowledged: false,
                suggested_fund_id,
                suggested_fund_name,
            }
        })
        .collect();

    // `consumed` tracks every group already assigned to a line (BAS-067);
    // `consumed_procedures` mirrors it for open procedures (BAS-113).
    let mut consumed: HashSet<String> = HashSet::new();
    let mut consumed_procedures: HashSet<String> = HashSet::new();

    // --- 2. Initial auto-match (BAS-050–054). ---
    auto_match(&mut lines, repos.groups, &mut consumed);

    // --- 3. Replay corrections in order (BAS-064), after the BAS-113
    //        correction-list cascade removed superseded entries. ---
    for correction in effective_corrections(corrections) {
        match correction {
            BankStatementCorrection::LinkFund {
                bank_label,
                assignment,
            } => {
                if let FundAssignment::Fund { fund_id } = assignment {
                    if !repos.funds.iter().any(|f| &f.id == fund_id) {
                        return Err(BankStatementReconciliationTask::FundNotFound.into());
                    }
                }
                apply_link_fund(
                    &mut lines,
                    repos.groups,
                    &mut consumed,
                    &mut consumed_procedures,
                    bank_label,
                    assignment,
                );
            }
            BankStatementCorrection::AssignGroups { line_id, group_ids } => {
                apply_assign_groups(&mut lines, repos.groups, &mut consumed, line_id, group_ids)?;
            }
            BankStatementCorrection::AssignProcedures {
                line_id,
                procedure_ids,
            } => {
                apply_assign_procedures(
                    &mut lines,
                    repos.open_procedures,
                    &mut consumed,
                    &mut consumed_procedures,
                    line_id,
                    procedure_ids,
                )?;
            }
            BankStatementCorrection::AcknowledgeRemainder { line_id } => {
                apply_acknowledge_remainder(&mut lines, line_id)?;
            }
        }
    }

    // --- 4. Derive per-line status + candidates (BAS-061, BAS-068, BAS-112). ---
    let reconciliation_lines: Vec<BankStatementLine> = lines
        .iter()
        .map(|wl| {
            finalize_line(
                wl,
                repos.groups,
                repos.funds,
                repos.open_procedures,
                &consumed,
                &consumed_procedures,
            )
        })
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

/// BAS-113 — the correction-list cascade, applied before the replay: an
/// assignment correction supersedes, for its line, any earlier assignment of
/// the OTHER kind (group/procedure mutual exclusion — a cascade, never an
/// error) and any earlier `AcknowledgeRemainder` (its implied size changed).
/// An acknowledgment placed AFTER the line's last assignment sticks — that is
/// the « Rapprocher avec reliquat » composition (BAS-092).
fn effective_corrections(corrections: &[BankStatementCorrection]) -> Vec<&BankStatementCorrection> {
    let superseded_by = |c: &BankStatementCorrection, later: &BankStatementCorrection| -> bool {
        use BankStatementCorrection::{AcknowledgeRemainder, AssignGroups, AssignProcedures};
        match (c, later) {
            (AssignGroups { line_id, .. }, AssignProcedures { line_id: l, .. })
            | (AssignProcedures { line_id, .. }, AssignGroups { line_id: l, .. })
            | (
                AcknowledgeRemainder { line_id },
                AssignGroups { line_id: l, .. } | AssignProcedures { line_id: l, .. },
            ) => l == line_id,
            _ => false,
        }
    };
    corrections
        .iter()
        .enumerate()
        .filter(|(i, c)| {
            !corrections
                .iter()
                .skip(i + 1)
                .any(|later| superseded_by(c, later))
        })
        .map(|(_, c)| c)
        .collect()
}

/// BAS-050–054 — auto-match resolved (fund-known, not rejected, unassigned)
/// lines against eligible unsettled groups. Exact fund + exact amount + date
/// tolerance, exclusive (a matched line and group are both locked).
///
/// Offsets are scanned nearest-first (exact-day outward to the tolerance
/// edge) so a group settles the line closest to its date; within one offset
/// pass, lines are processed oldest-first (BAS-052).
fn auto_match(
    lines: &mut [WorkingLine],
    groups: &[FundPaymentGroup],
    consumed: &mut HashSet<String>,
) {
    // Candidate line indices: fund known, not rejected, no settlement items
    // yet — a procedure-assigned line must not be re-auto-matched on the
    // post-LinkFund re-run (BAS-113 mutual exclusion).
    let mut order: Vec<usize> = lines
        .iter()
        .enumerate()
        .filter(|(_, l)| {
            l.fund_id.is_some()
                && !l.rejected
                && l.assigned_group_ids.is_empty()
                && l.assigned_procedure_ids.is_empty()
        })
        .map(|(i, _)| i)
        .collect();
    // Oldest line first (BAS-052); lines with an unparseable date sort last.
    let dates: Vec<Option<NaiveDate>> = lines.iter().map(|l| l.line_date).collect();
    order.sort_by(|&a, &b| dates.get(a).cmp(&dates.get(b)));

    // Nearest offset first: a group settles the line closest to its date, and
    // within one offset pass the oldest line goes first (BAS-052). Descending
    // offsets would let a farther line steal a group from an older nearer one.
    for offset in 0..=MAX_DATE_OFFSET_DAYS {
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
    consumed_procedures: &mut HashSet<String>,
    bank_label: &str,
    assignment: &FundAssignment,
) {
    for line in lines.iter_mut() {
        if line.credit_line.label != bank_label {
            continue;
        }
        match assignment {
            FundAssignment::Fund { fund_id } => {
                // BAS-066 amendment — re-linking to a DIFFERENT fund drops any
                // procedure assignment made under the old fund (it would be
                // wrong-fund ineligible under the new link); the procedures
                // return to the open pool.
                if line.fund_id.as_ref() != Some(fund_id) {
                    for pid in line.assigned_procedure_ids.drain(..) {
                        consumed_procedures.remove(&pid);
                    }
                }
                line.fund_id = Some(fund_id.clone());
                line.rejected = false;
            }
            FundAssignment::Rejected => {
                // Release any previously assigned settlement items and reject
                // the line.
                for gid in line.assigned_group_ids.drain(..) {
                    consumed.remove(&gid);
                }
                for pid in line.assigned_procedure_ids.drain(..) {
                    consumed_procedures.remove(&pid);
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

    // A label must be linked before groups can be assigned (BAS-066 ordering);
    // an unlinked line would stay NeedsLink with dangling assignments.
    if line.fund_id.is_none() && !group_ids.is_empty() {
        return Err(BankStatementReconciliationTask::GroupNotEligible.into());
    }

    let line_amount = line.credit_line.amount;
    let currently_assigned: HashSet<String> = line.assigned_group_ids.iter().cloned().collect();

    // Validate the whole requested set before mutating anything.
    let mut total: i64 = 0;
    for gid in group_ids {
        let group = groups
            .iter()
            .find(|g| &g.id == gid)
            .ok_or(BankStatementReconciliationTask::GroupNotEligible)?;

        // BAS-090 eligibility: not locked / settled. The fund criterion binds
        // auto-match only — a manual assignment may cross funds (the broadened
        // view is the human override for an imperfect label mapping).
        if group.is_locked {
            return Err(BankStatementReconciliationTask::GroupNotEligible.into());
        }

        // BAS-051/BAS-090 — no date bound on manual assignment: the human
        // making the correction may pick a group of any age (slow funds).

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
    // A prior remainder acknowledgment was already removed by the BAS-113
    // correction-list cascade (`effective_corrections`), never at replay time.
    for gid in line.assigned_group_ids.drain(..) {
        consumed.remove(&gid);
    }
    for gid in group_ids {
        consumed.insert(gid.clone());
    }
    line.assigned_group_ids = group_ids.to_vec();

    Ok(())
}

/// BAS-113/094 — assign an explicit set of open procedures to one line. Empty
/// `procedure_ids` unassigns (BAS-062 override semantics, including precedence
/// over the line's auto-match). Rejects ineligible, already-consumed, or
/// overflowing assignments with a typed error; the reconciliation is left
/// unchanged on rejection (validation precedes mutation).
fn apply_assign_procedures(
    lines: &mut [WorkingLine],
    open_procedures: &HashMap<String, Vec<OpenProcedureCandidate>>,
    consumed_groups: &mut HashSet<String>,
    consumed_procedures: &mut HashSet<String>,
    line_id: &str,
    procedure_ids: &[String],
) -> Result<(), BankStatementReconciliationError> {
    let line = lines
        .iter_mut()
        .find(|l| l.line_id == line_id)
        .ok_or(BankStatementReconciliationTask::LineNotFound)?;

    // Procedures are scoped to the linked fund (BAS-111/112): an unlinked
    // line has no candidate pool at all.
    if line.fund_id.is_none() && !procedure_ids.is_empty() {
        return Err(BankStatementReconciliationTask::ProcedureNotEligible.into());
    }
    let pool: &[OpenProcedureCandidate] = line
        .fund_id
        .as_ref()
        .and_then(|fund_id| open_procedures.get(fund_id))
        .map(Vec::as_slice)
        .unwrap_or(&[]);

    let line_amount = line.credit_line.amount;
    let currently_assigned: HashSet<String> = line.assigned_procedure_ids.iter().cloned().collect();

    // Validate the whole requested set before mutating anything.
    let mut total: i64 = 0;
    for pid in procedure_ids {
        // BAS-113 eligibility: unknown / not-open / wrong-fund all reduce to
        // "not in the line's fund pool" (the pool already applies BAS-112).
        let candidate = pool
            .iter()
            .find(|c| &c.procedure_id == pid)
            .ok_or(BankStatementReconciliationTask::ProcedureNotEligible)?;

        // BAS-113: a procedure consumed by another line cannot be reassigned here.
        if consumed_procedures.contains(pid) && !currently_assigned.contains(pid) {
            return Err(BankStatementReconciliationTask::ProcedureAlreadyConsumed.into());
        }

        total += candidate.billed_amount;
    }

    // BAS-094 (reused verbatim): the assigned total may never exceed the line amount.
    if total > line_amount {
        return Err(BankStatementReconciliationTask::AssignmentOverflow.into());
    }

    // Commit: release the line's previous settlement items of BOTH kinds —
    // the group release covers the auto-match, which the correction-list
    // cascade cannot see — then claim the new set.
    for gid in line.assigned_group_ids.drain(..) {
        consumed_groups.remove(&gid);
    }
    for pid in line.assigned_procedure_ids.drain(..) {
        consumed_procedures.remove(&pid);
    }
    for pid in procedure_ids {
        consumed_procedures.insert(pid.clone());
    }
    line.assigned_procedure_ids = procedure_ids.to_vec();

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
    funds: &[Fund],
    open_procedures: &HashMap<String, Vec<OpenProcedureCandidate>>,
    consumed: &HashSet<String>,
    consumed_procedures: &HashSet<String>,
) -> BankStatementLine {
    let line_amount = wl.credit_line.amount;
    // BAS-091/113 — settlement-item-agnostic balance: group totals when groups
    // are assigned, procedure billed amounts when procedures are. At most one
    // kind is non-empty per line (BAS-113 mutual exclusion).
    let procedure_pool: &[OpenProcedureCandidate] = wl
        .fund_id
        .as_ref()
        .and_then(|fund_id| open_procedures.get(fund_id))
        .map(Vec::as_slice)
        .unwrap_or(&[]);
    let covered_amount: i64 = wl
        .assigned_group_ids
        .iter()
        .filter_map(|gid| groups.iter().find(|g| &g.id == gid))
        .map(|g| g.total_amount)
        .sum::<i64>()
        + wl.assigned_procedure_ids
            .iter()
            .filter_map(|pid| procedure_pool.iter().find(|c| &c.procedure_id == pid))
            .map(|c| c.billed_amount)
            .sum::<i64>();

    // BAS-068 — the candidate lists support RECOMPOSING the assignment: the
    // line's own assigned items reappear (hosts pre-select them) and the
    // amount filter runs against the full line amount, not the yet-uncovered
    // remainder. Assignment corrections replace the set (BAS-062); the
    // overflow guard (BAS-094) bounds the recomposed total.
    let consumed_by_others: HashSet<String> = consumed
        .iter()
        .filter(|id| !wl.assigned_group_ids.contains(id))
        .cloned()
        .collect();
    let candidate_groups = candidate_groups(wl, groups, funds, &consumed_by_others, line_amount);
    // BAS-068 — broadened set: same eligibility as candidate_groups, but across
    // all funds (no fund filter). Superset shown when the user broadens the search.
    let broadened_candidates =
        broadened_candidates(groups, funds, &consumed_by_others, line_amount);
    // BAS-112 — the linked fund's open procedures, repo order preserved
    // (oldest first, id tiebreak); minus those consumed by OTHER lines. Not
    // ceiling-filtered: the billed amount is what it is, and the exact flag +
    // overflow guard carry the amount semantics (BAS-117 accepted dead-end).
    let candidate_procedures: Vec<BankStatementProcedureCandidate> = procedure_pool
        .iter()
        .filter(|c| {
            !consumed_procedures.contains(&c.procedure_id)
                || wl.assigned_procedure_ids.contains(&c.procedure_id)
        })
        .map(|c| BankStatementProcedureCandidate {
            procedure_id: c.procedure_id.clone(),
            patient_name: c.patient_name.clone().unwrap_or_default(),
            procedure_date: c.procedure_date.format("%Y-%m-%d").to_string(),
            billed_amount: c.billed_amount,
            is_exact_amount: c.billed_amount == line_amount,
        })
        .collect();

    let has_assignment = !wl.assigned_group_ids.is_empty() || !wl.assigned_procedure_ids.is_empty();
    let status = if wl.rejected {
        BankStatementLineStatus::Rejected
    } else if wl.fund_id.is_none() {
        BankStatementLineStatus::NeedsLink
    } else if has_assignment {
        if covered_amount == line_amount || wl.remainder_acknowledged {
            BankStatementLineStatus::Matched
        } else {
            BankStatementLineStatus::Partial
        }
    } else {
        // Fund known, nothing assigned: NeedsGroup if a candidate of EITHER
        // kind exists (settlement-item-agnostic, BAS-061/116), else Unresolved.
        if candidate_groups.is_empty() && candidate_procedures.is_empty() {
            BankStatementLineStatus::Unresolved
        } else {
            BankStatementLineStatus::NeedsGroup
        }
    };

    BankStatementLine {
        line_id: wl.line_id.clone(),
        credit_line: wl.credit_line.clone(),
        status,
        fund_id: wl.fund_id.clone(),
        assigned_group_ids: wl.assigned_group_ids.clone(),
        assigned_procedure_ids: wl.assigned_procedure_ids.clone(),
        covered_amount,
        remainder_acknowledged: wl.remainder_acknowledged,
        candidate_groups,
        broadened_candidates,
        candidate_procedures,
        suggested_fund_id: wl.suggested_fund_id.clone(),
        suggested_fund_name: wl.suggested_fund_name.clone(),
    }
}

/// BAS-068 — eligible candidate groups for a line: same fund, not
/// locked/consumed, amount ≤ `amount_ceiling` (the full line amount — the
/// recomposition basis, see `finalize_line`); NOT date-bounded (BAS-051
/// manual path). Ordered most recent payment first.
fn candidate_groups(
    wl: &WorkingLine,
    groups: &[FundPaymentGroup],
    funds: &[Fund],
    consumed: &HashSet<String>,
    amount_ceiling: i64,
) -> Vec<BankStatementCandidate> {
    let Some(fund_id) = wl.fund_id.as_deref() else {
        return Vec::new();
    };
    rank_candidates(groups, funds, consumed, amount_ceiling, |g| {
        g.fund_id == fund_id
    })
}

/// BAS-068 — the broadened set: identical eligibility and ordering to
/// `candidate_groups` but WITHOUT the fund filter (all funds), shown when the
/// user broadens the search beyond the line's fund.
fn broadened_candidates(
    groups: &[FundPaymentGroup],
    funds: &[Fund],
    consumed: &HashSet<String>,
    amount_ceiling: i64,
) -> Vec<BankStatementCandidate> {
    rank_candidates(groups, funds, consumed, amount_ceiling, |_| true)
}

/// Shared eligibility filter + ordering for candidate proposals (BAS-068). A
/// group is eligible when it is not locked, not already consumed, amount ≤
/// `amount_ceiling` (BAS-090), and passes the caller-supplied `fund_filter`.
/// Ordered most recent payment first (2026-07-30 field report).
fn rank_candidates(
    groups: &[FundPaymentGroup],
    funds: &[Fund],
    consumed: &HashSet<String>,
    amount_ceiling: i64,
    fund_filter: impl Fn(&FundPaymentGroup) -> bool,
) -> Vec<BankStatementCandidate> {
    let fund_names: HashMap<&str, &str> = funds
        .iter()
        .map(|f| (f.id.as_str(), f.name.as_str()))
        .collect();

    let mut candidates: Vec<BankStatementCandidate> = groups
        .iter()
        .filter(|g| {
            !g.is_locked
                && !consumed.contains(&g.id)
                && fund_filter(g)
                && g.total_amount <= amount_ceiling
        })
        .map(|g| BankStatementCandidate {
            group_id: g.id.clone(),
            fund_id: g.fund_id.clone(),
            // `repos.funds` is the complete fund list, so every group's
            // fund_id resolves; "" would mean an orphaned reference.
            fund_name: fund_names
                .get(g.fund_id.as_str())
                .map(|n| (*n).to_string())
                .unwrap_or_default(),
            payment_date: g.payment_date.format("%Y-%m-%d").to_string(),
            total_amount: g.total_amount,
            is_exact_amount: g.total_amount == amount_ceiling,
        })
        .collect();

    // BAS-068 — most recent payment first; ISO dates compare chronologically.
    candidates.sort_by(|a, b| b.payment_date.cmp(&a.payment_date));

    candidates
}

/// BAS-032 — heuristic fund suggestion for an unmapped label, in priority order:
/// first prefixed extraction (`CPAM`/`CAISSE` + digits matched against a fund's
/// `fund_identifier`), then a name-match fallback scored with a minimum of 3.
/// Both strategies are whitespace-insensitive (`CPAM 93` ≡ `CPAM93`), and a
/// fallback tie between two funds suppresses the suggestion — a wrong guess is
/// worse than none. Informational only (never pre-selected, BAS-033).
fn suggest_fund(label: &str, funds: &[Fund]) -> (Option<String>, Option<String>) {
    // Strategy 1: prefixed extraction — CPAM/CAISSE + digits → fund_identifier (BAS-032 §1)
    let cpam_re = regex::Regex::new(r"(?i)(?:CPAM|CAISSE)\s*(\d+)").ok();
    if let Some(re) = &cpam_re {
        if let Some(caps) = re.captures(label) {
            if let Some(num) = caps.get(1) {
                let identifier = num.as_str();
                if let Some(fund) = funds.iter().find(|f| f.fund_identifier == identifier) {
                    return (Some(fund.id.clone()), Some(fund.name.clone()));
                }
            }
        }
    }
    // Strategy 2: name-match fallback, min score 3 (BAS-032 §2)
    let label_upper = label.to_uppercase().replace(' ', "");
    let mut best_score = 0usize;
    let mut best_fund: Option<&Fund> = None;
    let mut ambiguous = false;
    for fund in funds {
        let fund_name_upper = fund.name.to_uppercase().replace(' ', "");
        let score = if label_upper.contains(&fund_name_upper) {
            fund_name_upper.len()
        } else if fund_name_upper.contains(&label_upper) {
            label_upper.len()
        } else {
            label_upper
                .chars()
                .zip(fund_name_upper.chars())
                .take_while(|(a, b)| a == b)
                .count()
        };
        if score < 3 {
            continue;
        }
        if score > best_score {
            best_score = score;
            best_fund = Some(fund);
            ambiguous = false;
        } else if score == best_score {
            ambiguous = true;
        }
    }
    match best_fund {
        Some(fund) if !ambiguous => (Some(fund.id.clone()), Some(fund.name.clone())),
        _ => (None, None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::context::fund::{FundPaymentGroup, FundPaymentGroupStatus};

    fn fund(id: &str, identifier: &str, name: &str) -> Fund {
        Fund {
            id: id.to_string(),
            fund_identifier: identifier.to_string(),
            name: name.to_string(),
            temp_id: None,
        }
    }

    fn group(id: &str, fund_id: &str, date: &str, amount: i64) -> FundPaymentGroup {
        FundPaymentGroup {
            id: id.to_string(),
            fund_id: fund_id.to_string(),
            payment_date: NaiveDate::parse_from_str(date, "%Y-%m-%d").unwrap(),
            total_amount: amount,
            lines: Vec::new(),
            status: FundPaymentGroupStatus::Active,
            is_locked: false,
        }
    }

    /// Shared empty pool for tests where open procedures play no role.
    fn no_open_procedures(
    ) -> &'static HashMap<String, Vec<crate::context::procedure::OpenProcedureCandidate>> {
        static EMPTY: std::sync::OnceLock<
            HashMap<String, Vec<crate::context::procedure::OpenProcedureCandidate>>,
        > = std::sync::OnceLock::new();
        EMPTY.get_or_init(HashMap::new)
    }

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
        let funds = vec![fund("fund-1", "1", "CPAM Paris")];
        let repos = BankStatementReconciliationRepos {
            mappings: &[],
            groups: &[],
            funds: &funds,
            open_procedures: no_open_procedures(),
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

    // BAS-032 §1 — an unmapped label "CPAM93" resolves to the fund whose
    // fund_identifier is exactly "93" via prefixed extraction.
    #[test]
    fn suggest_fund_prefixed_extraction_matches_identifier() {
        let funds = vec![
            fund("fund-93", "93", "CPAM Seine-Saint-Denis"),
            fund("fund-75", "75", "CPAM Paris"),
        ];
        let (id, name) = suggest_fund("CPAM93", &funds);
        assert_eq!(id.as_deref(), Some("fund-93"));
        assert_eq!(name.as_deref(), Some("CPAM Seine-Saint-Denis"));
    }

    // BAS-032 §2 — when no prefixed identifier matches, the name-match fallback
    // (score ≥ 3) selects the best-scoring fund.
    #[test]
    fn suggest_fund_name_match_fallback() {
        let funds = vec![fund("fund-mut", "999", "MUTUELLE GENERALE")];
        let (id, _) = suggest_fund("MUTUELLEGENERALEEDUCATION", &funds);
        assert_eq!(id.as_deref(), Some("fund-mut"));
    }

    // BAS-032 — a label that neither carries a matching identifier nor scores ≥3
    // against any fund name yields no suggestion.
    #[test]
    fn suggest_fund_no_match_returns_none() {
        let funds = vec![fund("fund-75", "75", "CPAM Paris")];
        let (id, name) = suggest_fund("XY", &funds);
        assert_eq!(id, None);
        assert_eq!(name, None);
    }

    // BAS-032 §1 — a space between the prefix and the digits ("CPAM 93") still
    // resolves via prefixed extraction.
    #[test]
    fn suggest_fund_prefixed_extraction_tolerates_space() {
        let funds = vec![
            fund("fund-93", "93", "CPAM Seine-Saint-Denis"),
            fund("fund-75", "75", "CPAM Paris"),
        ];
        let (id, _) = suggest_fund("CPAM 93", &funds);
        assert_eq!(id.as_deref(), Some("fund-93"));
    }

    // BAS-032 §2 — the name-match fallback normalizes spaces on the label side
    // too ("HARMONIE MUTUELLE" vs fund "Harmonie Mutuelle").
    #[test]
    fn suggest_fund_name_match_normalizes_label_spaces() {
        let funds = vec![fund("fund-harm", "999", "Harmonie Mutuelle")];
        let (id, _) = suggest_fund("HARMONIE MUTUELLE VIREMENT", &funds);
        assert_eq!(id.as_deref(), Some("fund-harm"));
    }

    // BAS-032 §2 — a fallback tie between two funds suppresses the suggestion
    // instead of guessing the first one.
    #[test]
    fn suggest_fund_tie_suppresses_suggestion() {
        // No identifier matches "930" — both names tie on the "CPAM" prefix.
        let funds = vec![
            fund("fund-75", "75", "CPAM Paris"),
            fund("fund-93", "93", "CPAM Seine-Saint-Denis"),
        ];
        let (id, name) = suggest_fund("CPAM 930", &funds);
        assert_eq!(id, None);
        assert_eq!(name, None);
    }

    // BAS-032 — the heuristic suggestion flows through finalize_line onto the
    // wire for an unmapped (needs-link) line.
    #[test]
    fn unmapped_line_carries_heuristic_suggestion() {
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
        let funds = vec![fund("fund-93", "93", "CPAM Seine-Saint-Denis")];
        let repos = BankStatementReconciliationRepos {
            mappings: &[],
            groups: &[],
            funds: &funds,
            open_procedures: no_open_procedures(),
        };

        let recon = compute_reconciliation(&parse_result, &repos, &[]).unwrap();
        let line = &recon.lines[0];
        assert_eq!(line.status, BankStatementLineStatus::NeedsLink);
        assert_eq!(line.suggested_fund_id.as_deref(), Some("fund-93"));
        assert_eq!(
            line.suggested_fund_name.as_deref(),
            Some("CPAM Seine-Saint-Denis")
        );
    }

    // BAS-051 — the auto-match tolerance boundary: a group at D+15 (bank date
    // 15 days after the group's date) auto-matches; at D+16 it does not.
    #[test]
    fn auto_match_accepts_d15_and_rejects_d16() {
        let mappings = vec![BankFundLabelMapping {
            id: "map-1".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some("fund-93".to_string()),
        }];
        let funds = vec![fund("fund-93", "93", "CPAM Seine-Saint-Denis")];
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

        // D+15 (2025-12-31) — inside the window: auto-matched.
        let groups_d15 = vec![group("grp-d15", "fund-93", "2025-12-31", 100_000)];
        let repos_d15 = BankStatementReconciliationRepos {
            mappings: &mappings,
            groups: &groups_d15,
            funds: &funds,
            open_procedures: no_open_procedures(),
        };
        let recon = compute_reconciliation(&parse_result, &repos_d15, &[]).unwrap();
        assert_eq!(recon.lines[0].status, BankStatementLineStatus::Matched);

        // D+16 (2025-12-30) — beyond the auto window: no auto-match, but the
        // group IS offered as a manual candidate (BAS-051 manual path is not
        // date-bounded) → NeedsGroup, not Unresolved.
        let groups_d16 = vec![group("grp-d16", "fund-93", "2025-12-30", 100_000)];
        let repos_d16 = BankStatementReconciliationRepos {
            mappings: &mappings,
            groups: &groups_d16,
            funds: &funds,
            open_procedures: no_open_procedures(),
        };
        let recon = compute_reconciliation(&parse_result, &repos_d16, &[]).unwrap();
        assert_eq!(recon.lines[0].status, BankStatementLineStatus::NeedsGroup);
        assert!(recon.lines[0].assigned_group_ids.is_empty());
    }

    // BAS-051/068/090 — an old payment (far beyond the auto window) is offered
    // as a manual candidate and assignable; the human is the judge.
    #[test]
    fn old_payment_is_offered_and_assignable() {
        let mappings = vec![BankFundLabelMapping {
            id: "map-1".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some("fund-93".to_string()),
        }];
        let funds = vec![fund("fund-93", "93", "CPAM Seine-Saint-Denis")];
        let parse_result = BankStatementParseResult {
            iban: None,
            period: None,
            credit_lines: vec![BankStatementCreditLine {
                date: "2026-02-20".to_string(),
                label: "CPAM93".to_string(),
                amount: 100_000,
            }],
            total_credits: 100_000,
            unparsed_count: 0,
        };
        // Paid 40 days before the bank credit.
        let groups = vec![group("grp-old", "fund-93", "2026-01-11", 100_000)];
        let repos = BankStatementReconciliationRepos {
            mappings: &mappings,
            groups: &groups,
            funds: &funds,
            open_procedures: no_open_procedures(),
        };

        let recon = compute_reconciliation(&parse_result, &repos, &[]).unwrap();
        assert_eq!(recon.lines[0].status, BankStatementLineStatus::NeedsGroup);
        assert_eq!(recon.lines[0].candidate_groups[0].group_id, "grp-old");

        let corrections = vec![BankStatementCorrection::AssignGroups {
            line_id: "line-0".to_string(),
            group_ids: vec!["grp-old".to_string()],
        }];
        let recon = compute_reconciliation(&parse_result, &repos, &corrections)
            .expect("an old payment must be manually assignable (amended BAS-051)");
        assert_eq!(recon.lines[0].status, BankStatementLineStatus::Matched);
    }

    // BAS-052 — when two lines compete for the same group, the OLDEST line
    // (by bank date, not document order) wins the auto-match.
    #[test]
    fn auto_match_gives_conflicting_group_to_oldest_line() {
        let mappings = vec![BankFundLabelMapping {
            id: "map-1".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some("fund-93".to_string()),
        }];
        let funds = vec![fund("fund-93", "93", "CPAM Seine-Saint-Denis")];
        // Document order puts the NEWER line first — sorting must still give
        // the group to the older 2026-01-16 line.
        let parse_result = BankStatementParseResult {
            iban: None,
            period: None,
            credit_lines: vec![
                BankStatementCreditLine {
                    date: "2026-01-20".to_string(),
                    label: "CPAM93".to_string(),
                    amount: 100_000,
                },
                BankStatementCreditLine {
                    date: "2026-01-16".to_string(),
                    label: "CPAM93".to_string(),
                    amount: 100_000,
                },
            ],
            total_credits: 200_000,
            unparsed_count: 0,
        };
        // In-window for both lines (D+2 and D+6).
        let groups = vec![group("grp-1", "fund-93", "2026-01-14", 100_000)];
        let repos = BankStatementReconciliationRepos {
            mappings: &mappings,
            groups: &groups,
            funds: &funds,
            open_procedures: no_open_procedures(),
        };

        let recon = compute_reconciliation(&parse_result, &repos, &[]).unwrap();
        // lines stay in document order: index 0 = 2026-01-20, index 1 = 2026-01-16.
        assert_eq!(
            recon.lines[1].assigned_group_ids,
            vec!["grp-1".to_string()],
            "the oldest line wins the conflicting group (BAS-052)"
        );
        assert_eq!(recon.lines[1].status, BankStatementLineStatus::Matched);
        assert!(recon.lines[0].assigned_group_ids.is_empty());
    }

    // BAS-090 — a broadened (cross-fund) candidate is assignable: the fund
    // criterion binds auto-match only, so the manual override must succeed and
    // fully cover the line.
    #[test]
    fn cross_fund_manual_assignment_is_accepted() {
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
        // Line linked to fund-93; the only matching group belongs to fund-75.
        let mappings = vec![BankFundLabelMapping {
            id: "map-1".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some("fund-93".to_string()),
        }];
        let groups = vec![group("grp-75", "fund-75", "2026-01-15", 100_000)];
        let funds = vec![
            fund("fund-93", "93", "CPAM Seine-Saint-Denis"),
            fund("fund-75", "75", "CPAM Paris"),
        ];
        let repos = BankStatementReconciliationRepos {
            mappings: &mappings,
            groups: &groups,
            funds: &funds,
            open_procedures: no_open_procedures(),
        };
        let corrections = vec![BankStatementCorrection::AssignGroups {
            line_id: "line-0".to_string(),
            group_ids: vec!["grp-75".to_string()],
        }];

        let recon = compute_reconciliation(&parse_result, &repos, &corrections)
            .expect("cross-fund manual assignment must be accepted (amended BAS-090)");
        assert_eq!(recon.lines[0].status, BankStatementLineStatus::Matched);
        assert_eq!(
            recon.lines[0].assigned_group_ids,
            vec!["grp-75".to_string()]
        );
    }

    // BAS-068 — a partially-assigned line's candidate lists include its own
    // assigned group and other groups filtered against the FULL line amount,
    // so the hosts can recompose the assignment (seeded selection).
    #[test]
    fn partial_line_candidates_support_recomposition() {
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
        let mappings = vec![BankFundLabelMapping {
            id: "map-1".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some("fund-93".to_string()),
        }];
        let groups = vec![
            group("grp-60", "fund-93", "2026-01-12", 60_000),
            group("grp-40", "fund-93", "2026-01-13", 40_000),
        ];
        let funds = vec![fund("fund-93", "93", "CPAM Seine-Saint-Denis")];
        let repos = BankStatementReconciliationRepos {
            mappings: &mappings,
            groups: &groups,
            funds: &funds,
            open_procedures: no_open_procedures(),
        };
        let corrections = vec![BankStatementCorrection::AssignGroups {
            line_id: "line-0".to_string(),
            group_ids: vec!["grp-60".to_string()],
        }];

        let recon = compute_reconciliation(&parse_result, &repos, &corrections).unwrap();
        let line = &recon.lines[0];
        assert_eq!(line.status, BankStatementLineStatus::Partial);
        let ids: Vec<&str> = line
            .candidate_groups
            .iter()
            .map(|c| c.group_id.as_str())
            .collect();
        assert!(ids.contains(&"grp-60"), "own assigned group is a candidate");
        assert!(
            ids.contains(&"grp-40"),
            "other group qualifies against the full line amount"
        );
        // BAS-068 — most recent payment first (grp-40 is 01-13, grp-60 is 01-12).
        assert_eq!(ids, vec!["grp-40", "grp-60"]);
    }

    // BAS-068 — broadened_candidates surfaces an eligible group from a DIFFERENT
    // fund that the fund-filtered candidate_groups set excludes.
    #[test]
    fn broadened_candidates_include_other_fund_group() {
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
        // Line is linked to fund-93 via a saved mapping, but the only eligible
        // group belongs to fund-75.
        let mappings = vec![BankFundLabelMapping {
            id: "map-1".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some("fund-93".to_string()),
        }];
        let groups = vec![group("grp-75", "fund-75", "2026-01-15", 100_000)];
        let funds = vec![
            fund("fund-93", "93", "CPAM Seine-Saint-Denis"),
            fund("fund-75", "75", "CPAM Paris"),
        ];
        let repos = BankStatementReconciliationRepos {
            mappings: &mappings,
            groups: &groups,
            funds: &funds,
            open_procedures: no_open_procedures(),
        };

        let recon = compute_reconciliation(&parse_result, &repos, &[]).unwrap();
        let line = &recon.lines[0];
        // Fund-filtered view excludes the fund-75 group.
        assert!(line.candidate_groups.is_empty());
        // Broadened view surfaces it, identified by its fund name (BAS-068).
        assert_eq!(line.broadened_candidates.len(), 1);
        assert_eq!(line.broadened_candidates[0].group_id, "grp-75");
        assert_eq!(line.broadened_candidates[0].fund_id, "fund-75");
        assert_eq!(line.broadened_candidates[0].fund_name, "CPAM Paris");
    }

    // =========================================================================
    // Bank-born groups (BAS-110–117) — AssignProcedures correction, D1/D2 open
    // procedure candidates, group/procedure mutual exclusion, BAS-066 drop.
    //
    // `BankStatementReconciliationRepos.open_procedures` is a
    // `HashMap<fund_id, Vec<OpenProcedureCandidate>>` — the orchestrator reads
    // one page per known fund via `ProcedureRepository::find_open_by_fund_with_patient`
    // (D2) and passes the aggregate in, mirroring how `funds`/`groups` are
    // supplied in full and filtered inside the engine. `OpenProcedureCandidate`
    // (procedure id, date, billed amount, patient name) is the sibling read
    // model of `UnreconciledProcedure` pinned by plan decision D2.
    // =========================================================================

    fn open_procedure(
        id: &str,
        date: &str,
        billed: i64,
        patient_name: &str,
    ) -> crate::context::procedure::OpenProcedureCandidate {
        crate::context::procedure::OpenProcedureCandidate {
            procedure_id: id.to_string(),
            procedure_date: NaiveDate::parse_from_str(date, "%Y-%m-%d").unwrap(),
            billed_amount: billed,
            patient_name: Some(patient_name.to_string()),
        }
    }

    fn one_fund_open_procedures(
        fund_id: &str,
        procs: Vec<crate::context::procedure::OpenProcedureCandidate>,
    ) -> HashMap<String, Vec<crate::context::procedure::OpenProcedureCandidate>> {
        HashMap::from([(fund_id.to_string(), procs)])
    }

    // BAS-112 — an unlinked (NeedsLink) line must not surface procedure
    // candidates: they are scoped to the linked fund, which is not yet known.
    #[test]
    fn candidate_procedures_is_empty_while_needs_link() {
        let parse_result = BankStatementParseResult {
            iban: None,
            period: None,
            credit_lines: vec![BankStatementCreditLine {
                date: "2026-01-15".to_string(),
                label: "UNKNOWN".to_string(),
                amount: 100_000,
            }],
            total_credits: 100_000,
            unparsed_count: 0,
        };
        let funds = vec![fund("fund-1", "1", "CPAM Paris")];
        let open_procedures = one_fund_open_procedures(
            "fund-1",
            vec![open_procedure(
                "proc-1",
                "2026-01-01",
                100_000,
                "Jean Dupont",
            )],
        );
        let repos = BankStatementReconciliationRepos {
            mappings: &[],
            groups: &[],
            funds: &funds,
            open_procedures: &open_procedures,
        };

        let recon = compute_reconciliation(&parse_result, &repos, &[]).unwrap();
        let line = &recon.lines[0];
        assert_eq!(line.status, BankStatementLineStatus::NeedsLink);
        assert!(
            line.candidate_procedures.is_empty(),
            "an unlinked line must not surface procedure candidates (BAS-112)"
        );
    }

    // BAS-113 — assigning an open procedure whose billed amount exactly covers
    // the line resolves it to Matched, mirroring the group-assignment path.
    #[test]
    fn assign_procedures_exact_amount_gives_matched() {
        let mappings = vec![BankFundLabelMapping {
            id: "m1".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some("fund-1".to_string()),
        }];
        let funds = vec![fund("fund-1", "93", "CPAM Seine-Saint-Denis")];
        let open_procedures = one_fund_open_procedures(
            "fund-1",
            vec![open_procedure(
                "proc-1",
                "2026-01-01",
                100_000,
                "Jean Dupont",
            )],
        );
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
        let repos = BankStatementReconciliationRepos {
            mappings: &mappings,
            groups: &[],
            funds: &funds,
            open_procedures: &open_procedures,
        };
        let corrections = vec![BankStatementCorrection::AssignProcedures {
            line_id: "line-0".to_string(),
            procedure_ids: vec!["proc-1".to_string()],
        }];

        let recon = compute_reconciliation(&parse_result, &repos, &corrections).unwrap();
        let line = &recon.lines[0];
        assert_eq!(line.status, BankStatementLineStatus::Matched);
        assert_eq!(line.assigned_procedure_ids, vec!["proc-1".to_string()]);
        assert_eq!(line.covered_amount, 100_000);
    }

    // BAS-094/113 — the sum of assigned procedures' billed amounts may never
    // exceed the line amount, exactly like group assignment.
    #[test]
    fn assign_procedures_overflow_returns_assignment_overflow() {
        let mappings = vec![BankFundLabelMapping {
            id: "m1".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some("fund-1".to_string()),
        }];
        let funds = vec![fund("fund-1", "93", "CPAM 93")];
        let open_procedures = one_fund_open_procedures(
            "fund-1",
            vec![open_procedure(
                "proc-1",
                "2026-01-01",
                150_000,
                "Jean Dupont",
            )],
        );
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
        let repos = BankStatementReconciliationRepos {
            mappings: &mappings,
            groups: &[],
            funds: &funds,
            open_procedures: &open_procedures,
        };
        let corrections = vec![BankStatementCorrection::AssignProcedures {
            line_id: "line-0".to_string(),
            procedure_ids: vec!["proc-1".to_string()],
        }];

        let result = compute_reconciliation(&parse_result, &repos, &corrections);
        assert!(
            matches!(
                result,
                Err(BankStatementReconciliationError::Task(
                    BankStatementReconciliationTask::AssignmentOverflow
                ))
            ),
            "billed amount exceeding the line amount must be rejected (BAS-094)"
        );
    }

    // BAS-113 — a procedure id that does not belong to the line's linked fund
    // (or does not exist as an open candidate at all) is rejected with
    // ProcedureNotEligible (subsumes unknown/not-open/wrong-fund).
    #[test]
    fn assign_procedures_wrong_fund_returns_procedure_not_eligible() {
        let mappings = vec![BankFundLabelMapping {
            id: "m1".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some("fund-1".to_string()),
        }];
        let funds = vec![
            fund("fund-1", "93", "CPAM 93"),
            fund("fund-2", "75", "CPAM Paris"),
        ];
        // proc-2 is an open procedure of fund-2, not the line's linked fund-1.
        let open_procedures = one_fund_open_procedures(
            "fund-2",
            vec![open_procedure(
                "proc-2",
                "2026-01-01",
                100_000,
                "Jean Dupont",
            )],
        );
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
        let repos = BankStatementReconciliationRepos {
            mappings: &mappings,
            groups: &[],
            funds: &funds,
            open_procedures: &open_procedures,
        };
        let corrections = vec![BankStatementCorrection::AssignProcedures {
            line_id: "line-0".to_string(),
            procedure_ids: vec!["proc-2".to_string()],
        }];

        let result = compute_reconciliation(&parse_result, &repos, &corrections);
        assert!(
            matches!(
                result,
                Err(BankStatementReconciliationError::Task(
                    BankStatementReconciliationTask::ProcedureNotEligible
                ))
            ),
            "a procedure of a different fund (or unknown) must be rejected (BAS-113)"
        );
    }

    // BAS-113 — a procedure already consumed by another line cannot be
    // reassigned, mirroring BAS-067 for groups.
    #[test]
    fn assign_procedures_already_consumed_returns_procedure_already_consumed() {
        let mappings = vec![BankFundLabelMapping {
            id: "m1".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some("fund-1".to_string()),
        }];
        let funds = vec![fund("fund-1", "93", "CPAM 93")];
        let open_procedures = one_fund_open_procedures(
            "fund-1",
            vec![open_procedure(
                "proc-shared",
                "2026-01-01",
                80_000,
                "Jean Dupont",
            )],
        );
        let parse_result = BankStatementParseResult {
            iban: None,
            period: None,
            credit_lines: vec![
                BankStatementCreditLine {
                    date: "2026-01-15".to_string(),
                    label: "CPAM93".to_string(),
                    amount: 80_000,
                },
                BankStatementCreditLine {
                    date: "2026-01-16".to_string(),
                    label: "CPAM93".to_string(),
                    amount: 80_000,
                },
            ],
            total_credits: 160_000,
            unparsed_count: 0,
        };
        let repos = BankStatementReconciliationRepos {
            mappings: &mappings,
            groups: &[],
            funds: &funds,
            open_procedures: &open_procedures,
        };
        let corrections = vec![
            BankStatementCorrection::AssignProcedures {
                line_id: "line-0".to_string(),
                procedure_ids: vec!["proc-shared".to_string()],
            },
            BankStatementCorrection::AssignProcedures {
                line_id: "line-1".to_string(),
                procedure_ids: vec!["proc-shared".to_string()],
            },
        ];

        let result = compute_reconciliation(&parse_result, &repos, &corrections);
        assert!(
            matches!(
                result,
                Err(BankStatementReconciliationError::Task(
                    BankStatementReconciliationTask::ProcedureAlreadyConsumed
                ))
            ),
            "double-assigning the same procedure must yield ProcedureAlreadyConsumed (BAS-113)"
        );
    }

    // BAS-113 — group/procedure mutual exclusion, direction 1: assigning
    // procedures after groups drops the group assignment (cascade, never an
    // error) and releases the group back to the candidate pool.
    #[test]
    fn assign_procedures_after_groups_drops_the_group_assignment() {
        let mappings = vec![BankFundLabelMapping {
            id: "m1".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some("fund-1".to_string()),
        }];
        let funds = vec![fund("fund-1", "93", "CPAM 93")];
        let groups = vec![group("group-a", "fund-1", "2026-01-10", 100_000)];
        let open_procedures = one_fund_open_procedures(
            "fund-1",
            vec![open_procedure(
                "proc-1",
                "2026-01-01",
                100_000,
                "Jean Dupont",
            )],
        );
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
        let repos = BankStatementReconciliationRepos {
            mappings: &mappings,
            groups: &groups,
            funds: &funds,
            open_procedures: &open_procedures,
        };
        let corrections = vec![
            BankStatementCorrection::AssignGroups {
                line_id: "line-0".to_string(),
                group_ids: vec!["group-a".to_string()],
            },
            BankStatementCorrection::AssignProcedures {
                line_id: "line-0".to_string(),
                procedure_ids: vec!["proc-1".to_string()],
            },
        ];

        let recon = compute_reconciliation(&parse_result, &repos, &corrections).unwrap();
        let line = &recon.lines[0];
        assert!(
            line.assigned_group_ids.is_empty(),
            "AssignProcedures must supersede a prior AssignGroups on the same line (BAS-113)"
        );
        assert_eq!(line.assigned_procedure_ids, vec!["proc-1".to_string()]);
        assert!(
            line.candidate_groups.iter().any(|c| c.group_id == "group-a"),
            "the superseded group must be released back to the candidate pool, not stranded as consumed"
        );
    }

    // BAS-113 — group/procedure mutual exclusion, direction 2: assigning
    // groups after procedures drops the procedure assignment.
    #[test]
    fn assign_groups_after_procedures_drops_the_procedure_assignment() {
        let mappings = vec![BankFundLabelMapping {
            id: "m1".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some("fund-1".to_string()),
        }];
        let funds = vec![fund("fund-1", "93", "CPAM 93")];
        let groups = vec![group("group-a", "fund-1", "2026-01-10", 100_000)];
        let open_procedures = one_fund_open_procedures(
            "fund-1",
            vec![open_procedure(
                "proc-1",
                "2026-01-01",
                100_000,
                "Jean Dupont",
            )],
        );
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
        let repos = BankStatementReconciliationRepos {
            mappings: &mappings,
            groups: &groups,
            funds: &funds,
            open_procedures: &open_procedures,
        };
        let corrections = vec![
            BankStatementCorrection::AssignProcedures {
                line_id: "line-0".to_string(),
                procedure_ids: vec!["proc-1".to_string()],
            },
            BankStatementCorrection::AssignGroups {
                line_id: "line-0".to_string(),
                group_ids: vec!["group-a".to_string()],
            },
        ];

        let recon = compute_reconciliation(&parse_result, &repos, &corrections).unwrap();
        let line = &recon.lines[0];
        assert!(
            line.assigned_procedure_ids.is_empty(),
            "AssignGroups must supersede a prior AssignProcedures on the same line (BAS-113)"
        );
        assert_eq!(line.assigned_group_ids, vec!["group-a".to_string()]);
        assert!(
            line.candidate_procedures
                .iter()
                .any(|c| c.procedure_id == "proc-1"),
            "the superseded procedure must be released back to the candidate pool, not stranded as consumed"
        );
    }

    // BAS-065/113 — reverting the correction that caused an exclusion cascade
    // (dropping it from the correction list and recomputing) must restore the
    // pre-exclusion state (here: the original auto-match), never resurrect the
    // correction that the cascade removed.
    #[test]
    fn exclusion_revert_restores_pre_exclusion_auto_match_state() {
        let mappings = vec![BankFundLabelMapping {
            id: "m1".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some("fund-1".to_string()),
        }];
        let funds = vec![fund("fund-1", "93", "CPAM 93")];
        // Exact fund + exact amount + same date as the credit line → auto-matches.
        let groups = vec![group("group-auto", "fund-1", "2026-01-15", 100_000)];
        let open_procedures = one_fund_open_procedures(
            "fund-1",
            vec![open_procedure(
                "proc-1",
                "2026-01-01",
                100_000,
                "Jean Dupont",
            )],
        );
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
        let repos = BankStatementReconciliationRepos {
            mappings: &mappings,
            groups: &groups,
            funds: &funds,
            open_procedures: &open_procedures,
        };

        let before = compute_reconciliation(&parse_result, &repos, &[]).unwrap();
        assert_eq!(before.lines[0].status, BankStatementLineStatus::Matched);
        assert_eq!(
            before.lines[0].assigned_group_ids,
            vec!["group-auto".to_string()]
        );

        let corrections = vec![BankStatementCorrection::AssignProcedures {
            line_id: "line-0".to_string(),
            procedure_ids: vec!["proc-1".to_string()],
        }];
        let with_procedure = compute_reconciliation(&parse_result, &repos, &corrections).unwrap();
        assert!(with_procedure.lines[0].assigned_group_ids.is_empty());

        // Revert: drop the correction and recompute.
        let reverted = compute_reconciliation(&parse_result, &repos, &[]).unwrap();
        assert_eq!(
            reverted.lines[0].assigned_group_ids, before.lines[0].assigned_group_ids,
            "revert must restore the auto-match, never the removed correction (BAS-065/113)"
        );
        assert_eq!(reverted.lines[0].status, BankStatementLineStatus::Matched);
    }

    // BAS-066 amendment — re-linking a label to a different fund drops any
    // procedure assignment made under the old fund (it would otherwise become
    // wrong-fund ineligible under the new link).
    #[test]
    fn relink_label_to_different_fund_drops_assigned_procedures() {
        let funds = vec![
            fund("fund-a", "93", "CPAM 93"),
            fund("fund-b", "75", "CPAM Paris"),
        ];
        let open_procedures = one_fund_open_procedures(
            "fund-a",
            vec![open_procedure(
                "proc-1",
                "2026-01-01",
                100_000,
                "Jean Dupont",
            )],
        );
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
        let repos = BankStatementReconciliationRepos {
            mappings: &[],
            groups: &[],
            funds: &funds,
            open_procedures: &open_procedures,
        };
        let corrections = vec![
            BankStatementCorrection::LinkFund {
                bank_label: "CPAM93".to_string(),
                assignment: FundAssignment::Fund {
                    fund_id: "fund-a".to_string(),
                },
            },
            BankStatementCorrection::AssignProcedures {
                line_id: "line-0".to_string(),
                procedure_ids: vec!["proc-1".to_string()],
            },
            BankStatementCorrection::LinkFund {
                bank_label: "CPAM93".to_string(),
                assignment: FundAssignment::Fund {
                    fund_id: "fund-b".to_string(),
                },
            },
        ];

        let recon = compute_reconciliation(&parse_result, &repos, &corrections).unwrap();
        let line = &recon.lines[0];
        assert_eq!(line.fund_id.as_deref(), Some("fund-b"));
        assert!(
            line.assigned_procedure_ids.is_empty(),
            "re-linking to a different fund must drop stale procedure assignments (BAS-066 amendment)"
        );
    }

    // BAS-117 — a credit smaller than every open procedure of the linked fund
    // is an accepted dead-end: no combination can ever settle it without
    // overflowing, and BAS-114 (auto-select) was not retained.
    #[test]
    fn credit_smaller_than_every_open_procedure_stays_needs_correction() {
        let mappings = vec![BankFundLabelMapping {
            id: "m1".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some("fund-1".to_string()),
        }];
        let funds = vec![fund("fund-1", "93", "CPAM 93")];
        let open_procedures = one_fund_open_procedures(
            "fund-1",
            vec![
                open_procedure("proc-1", "2026-01-01", 60_000, "Jean Dupont"),
                open_procedure("proc-2", "2026-01-02", 80_000, "Marie Curie"),
            ],
        );
        let parse_result = BankStatementParseResult {
            iban: None,
            period: None,
            credit_lines: vec![BankStatementCreditLine {
                date: "2026-01-15".to_string(),
                label: "CPAM93".to_string(),
                amount: 50_000,
            }],
            total_credits: 50_000,
            unparsed_count: 0,
        };
        let repos = BankStatementReconciliationRepos {
            mappings: &mappings,
            groups: &[],
            funds: &funds,
            open_procedures: &open_procedures,
        };

        let recon = compute_reconciliation(&parse_result, &repos, &[]).unwrap();
        assert_ne!(
            recon.lines[0].status,
            BankStatementLineStatus::Matched,
            "no auto-select of procedures (BAS-114 not retained)"
        );

        // Even the cheapest open procedure exceeds the line amount.
        let corrections = vec![BankStatementCorrection::AssignProcedures {
            line_id: "line-0".to_string(),
            procedure_ids: vec!["proc-1".to_string()],
        }];
        let result = compute_reconciliation(&parse_result, &repos, &corrections);
        assert!(
            matches!(
                result,
                Err(BankStatementReconciliationError::Task(
                    BankStatementReconciliationTask::AssignmentOverflow
                ))
            ),
            "a credit smaller than every open procedure is an accepted dead-end (BAS-117)"
        );
    }

    // BAS-113 — applying a new assignment (either kind) resets a previously
    // acknowledged remainder, since its implied uncovered size changed.
    #[test]
    fn assign_procedures_resets_previously_acknowledged_remainder() {
        let mappings = vec![BankFundLabelMapping {
            id: "m1".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some("fund-1".to_string()),
        }];
        let funds = vec![fund("fund-1", "93", "CPAM 93")];
        let groups = vec![group("group-a", "fund-1", "2026-01-10", 60_000)];
        let open_procedures = one_fund_open_procedures(
            "fund-1",
            vec![open_procedure(
                "proc-1",
                "2026-01-01",
                40_000,
                "Jean Dupont",
            )],
        );
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
        let repos = BankStatementReconciliationRepos {
            mappings: &mappings,
            groups: &groups,
            funds: &funds,
            open_procedures: &open_procedures,
        };
        let corrections = vec![
            BankStatementCorrection::AssignGroups {
                line_id: "line-0".to_string(),
                group_ids: vec!["group-a".to_string()],
            },
            BankStatementCorrection::AcknowledgeRemainder {
                line_id: "line-0".to_string(),
            },
            BankStatementCorrection::AssignProcedures {
                line_id: "line-0".to_string(),
                procedure_ids: vec!["proc-1".to_string()],
            },
        ];

        let recon = compute_reconciliation(&parse_result, &repos, &corrections).unwrap();
        let line = &recon.lines[0];
        assert!(
            !line.remainder_acknowledged,
            "a new assignment of either kind resets a previously acknowledged remainder (BAS-113)"
        );
        assert_eq!(line.status, BankStatementLineStatus::Partial);
    }

    // BAS-092/113 — the « Rapprocher avec reliquat » composition posts the
    // assignment immediately followed by the acknowledgment: an
    // AcknowledgeRemainder placed AFTER the line's last assignment survives
    // the BAS-113 cascade and resolves the line. (The cascade only removes an
    // acknowledgment that PRECEDES a later assignment — see
    // assign_procedures_resets_previously_acknowledged_remainder; revert
    // safety comes from the stored correction list being compacted at apply
    // time, a frontend concern pinned by the P4/P5 tests.)
    #[test]
    fn acknowledge_after_procedure_assignment_survives_and_resolves_the_line() {
        let mappings = vec![BankFundLabelMapping {
            id: "m1".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some("fund-1".to_string()),
        }];
        let funds = vec![fund("fund-1", "93", "CPAM 93")];
        let groups = vec![group("group-a", "fund-1", "2026-01-10", 60_000)];
        let open_procedures = one_fund_open_procedures(
            "fund-1",
            vec![open_procedure(
                "proc-1",
                "2026-01-01",
                40_000,
                "Jean Dupont",
            )],
        );
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
        let repos = BankStatementReconciliationRepos {
            mappings: &mappings,
            groups: &groups,
            funds: &funds,
            open_procedures: &open_procedures,
        };

        let corrections = vec![
            BankStatementCorrection::AssignProcedures {
                line_id: "line-0".to_string(),
                procedure_ids: vec!["proc-1".to_string()],
            },
            BankStatementCorrection::AcknowledgeRemainder {
                line_id: "line-0".to_string(),
            },
        ];
        let recon = compute_reconciliation(&parse_result, &repos, &corrections).unwrap();
        let line = &recon.lines[0];
        assert!(
            line.remainder_acknowledged,
            "an acknowledgment after the line's last assignment must stick (BAS-092)"
        );
        assert_eq!(
            line.status,
            BankStatementLineStatus::Matched,
            "assignment + acknowledged remainder resolves the line (BAS-092/113)"
        );
        assert_eq!(line.covered_amount, 40_000);
    }
}

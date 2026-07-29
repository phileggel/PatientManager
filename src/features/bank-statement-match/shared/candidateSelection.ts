import type { BankStatementCandidate, BankStatementLine } from "@/bindings";

/** Exact-amount candidates first, preserving relative order otherwise (BAS-068). */
export function rankCandidates(candidates: BankStatementCandidate[]): BankStatementCandidate[] {
  return candidates.toSorted((a, b) => Number(b.is_exact_amount) - Number(a.is_exact_amount));
}

/** Union of the fund-filtered and broadened candidate views, deduplicated by group id. */
function allCandidates(line: BankStatementLine): BankStatementCandidate[] {
  const seen = new Set<string>();
  return [...line.candidate_groups, ...line.broadened_candidates].filter((c) => {
    if (seen.has(c.group_id)) return false;
    seen.add(c.group_id);
    return true;
  });
}

/**
 * BAS-091 — Σ(selected candidate amounts). Safe to compute over the union of
 * both views because the selection is always pruned to visible ids
 * (CandidateList drops hidden selections when the source narrows).
 */
export function coveredAmount(line: BankStatementLine, selected: string[]): number {
  return allCandidates(line)
    .filter((c) => selected.includes(c.group_id))
    .reduce((sum, c) => sum + c.total_amount, 0);
}

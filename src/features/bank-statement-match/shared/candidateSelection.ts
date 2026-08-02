import type { BankStatementCandidate, BankStatementLine } from "@/bindings";

/** Union of the fund-filtered and broadened candidate views, deduplicated by group id. */
function allCandidates(line: BankStatementLine): BankStatementCandidate[] {
  const seen = new Set<string>();
  return [...line.candidate_groups, ...line.broadened_candidates].filter((c) => {
    if (seen.has(c.group_id)) return false;
    seen.add(c.group_id);
    return true;
  });
}

/** The two settlement-item kinds a selection can carry (BAS-113 — never mixed). */
export type SelectionKind = "groups" | "procedures";

/**
 * BAS-091/113 — Σ(selected settlement-item amounts): group totals for the
 * group scopes, procedure billed amounts for the procedure scope. Safe to
 * compute over the union of both group views because the selection is always
 * pruned to visible ids (CandidateList drops hidden selections when the
 * source narrows).
 */
export function coveredAmount(
  line: BankStatementLine,
  selected: string[],
  kind: SelectionKind = "groups",
): number {
  if (kind === "procedures") {
    return line.candidate_procedures
      .filter((c) => selected.includes(c.procedure_id))
      .reduce((sum, c) => sum + c.billed_amount, 0);
  }
  return allCandidates(line)
    .filter((c) => selected.includes(c.group_id))
    .reduce((sum, c) => sum + c.total_amount, 0);
}

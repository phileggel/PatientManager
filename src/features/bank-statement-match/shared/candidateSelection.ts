import type { BankStatementLine } from "@/bindings";

/** The two settlement-item kinds a selection can carry (BAS-113 — never mixed). */
export type SelectionKind = "groups" | "procedures";

/**
 * BAS-091/113 — Σ(selected settlement-item amounts): group totals for the
 * group scope, procedure billed amounts for the procedure scope.
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
  return line.candidate_groups
    .filter((c) => selected.includes(c.group_id))
    .reduce((sum, c) => sum + c.total_amount, 0);
}

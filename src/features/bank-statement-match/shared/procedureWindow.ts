import type { BankStatementProcedureCandidate } from "@/bindings";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * BAS-118 — display-window filter over the (not date-bounded, BAS-112) open
 * procedure pool: keeps candidates whose `procedure_date` is within
 * `windowDays` before `now` (boundary inclusive). A procedure already
 * assigned to the line always passes (mirror of BAS-068's recomposition rule
 * — hiding it would silently drop it on the next submit). Wire order is
 * preserved. `now` is injected for determinism.
 */
export function filterProceduresByWindow(
  candidates: BankStatementProcedureCandidate[],
  windowDays: number,
  now: Date,
  assignedProcedureIds: string[],
): BankStatementProcedureCandidate[] {
  const cutoff = new Date(now.getTime() - windowDays * DAY_MS);
  return candidates.filter(
    (candidate) =>
      assignedProcedureIds.includes(candidate.procedure_id) ||
      new Date(`${candidate.procedure_date}T00:00:00.000Z`).getTime() >= cutoff.getTime(),
  );
}

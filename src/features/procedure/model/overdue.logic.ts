import type { ProcedureRow } from "./procedure-row.types";
import { isFundReconciledStatus } from "./procedure-row.types";

/**
 * PRO-310 — Overdue derivation (frontend-only, derived from the full loaded set).
 *
 * A `CREATED` procedure is **overdue** when its date is strictly earlier than the
 * **reconciliation high-water mark** — the most recent `procedureDate` among all
 * fund-reconciled procedures (see `isFundReconciledStatus`). The mark is global
 * (no patient/fund scope) and recomputed live, so a reverted reconciliation that
 * lowers it drops the overdue set automatically. Pure: no persistence, no backend.
 */

/**
 * The reconciliation high-water mark across the full set, or `null` when no
 * fund-reconciled procedure exists (nothing can be overdue). ISO `YYYY-MM-DD`
 * dates order correctly under plain string comparison.
 */
export function computeHighWaterMark(rows: ProcedureRow[]): string | null {
  let mark: string | null = null;
  for (const row of rows) {
    if (isFundReconciledStatus(row.status) && row.procedureDate != null) {
      if (mark == null || row.procedureDate > mark) {
        mark = row.procedureDate;
      }
    }
  }
  return mark;
}

/**
 * Returns the rows with `isOverdue` set per PRO-310 — `true` only for `CREATED`
 * rows strictly older than the high-water mark. Computes the mark once over the
 * passed-in full set, so call this on the complete procedure list before any
 * period filter (PRO-010) is applied.
 */
export function markOverdueRows(rows: ProcedureRow[]): ProcedureRow[] {
  const mark = computeHighWaterMark(rows);
  return rows.map((row) => ({
    ...row,
    isOverdue:
      mark != null &&
      row.status === "CREATED" &&
      row.procedureDate != null &&
      row.procedureDate < mark,
  }));
}

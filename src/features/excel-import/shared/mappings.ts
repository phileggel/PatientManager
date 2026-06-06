import type { ExcelProcedure } from "@/bindings";

/** One amount → procedure-type-tmp-id pairing to map in the mapping step. */
export interface ProcedureMapping {
  tmp_id: string;
  amount: number;
}

/**
 * Pure data transformation: derive the distinct `(procedure_type_tmp_id, amount)`
 * pairs the user must map, restricted to the sheets they selected.
 *
 * The mapping step must only prompt for amounts that will actually be imported.
 * The backend filters procedures by `sheet_month ∈ selected_sheets` (EXI-270),
 * so deriving the prompt list from ALL parsed procedures would over-ask — e.g.
 * forcing a mapping (and possibly an orphan procedure type) for a June amount
 * when only "Mai" was selected. Filtering here keeps the prompt aligned with
 * what the import will create.
 *
 * Dedup is by `procedure_type_tmp_id` (the parser assigns one shared tmp_id per
 * unique amount), so an amount appearing across multiple selected sheets yields
 * a single row.
 */
export function deriveProcedureMappings(
  procedures: ExcelProcedure[],
  selectedSheets: string[],
): ProcedureMapping[] {
  const allowed = new Set(selectedSheets);
  const byTmpId = new Map<string, number>();
  for (const proc of procedures) {
    if (allowed.has(proc.sheet_month)) {
      byTmpId.set(proc.procedure_type_tmp_id, proc.amount);
    }
  }
  return Array.from(byTmpId.entries()).map(([tmp_id, amount]) => ({ tmp_id, amount }));
}

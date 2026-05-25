import type { ParseExcelResponse } from "@/bindings";

/**
 * Canonical sheet name → 1-based month ordinal.
 *
 * Matches the Rust `CANONICAL_SHEET_MONTH` constant in
 * `src-tauri/src/use_cases/excel_import/excel_codec.rs`. Both encode the
 * same 12 entries; keep them aligned manually.
 *
 * Consumed by:
 * - `SheetSelectionStep.tsx` — orders the list of detected sheets.
 * - `ParsingReportModal.tsx` — orders skipped-row sheet groups in the report.
 */
export const SHEET_ORDER: Record<string, number> = {
  Jan: 1,
  Fév: 2,
  Mars: 3,
  Avr: 4,
  Mai: 5,
  Juin: 6,
  Juil: 7,
  Août: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Déc: 12,
};

/**
 * Pure data transformation: extract the distinct canonical sheet names
 * present in the parsed Excel payload, sorted by canonical month order.
 *
 * Reads `proc.sheet_month` directly (EXI-110 / EXI-270 — no more substring
 * trick on `procedure_date`). Unknown sheet names sort to the end via the
 * `?? 99` fallback.
 */
export function extractSheets(parsedData: ParseExcelResponse): string[] {
  const sheets = new Set<string>();
  for (const proc of parsedData.procedures) {
    if (proc.sheet_month) sheets.add(proc.sheet_month);
  }
  return Array.from(sheets).toSorted((a, b) => (SHEET_ORDER[a] ?? 99) - (SHEET_ORDER[b] ?? 99));
}

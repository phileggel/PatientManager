# 2026-10-06 — DEBT-046 — The Excel import: findings of the 0.24.1 spec check not yet recorded

**Found by:** spec-checker, release preparation of 0.24.1 (read in the code, not run); completes DEBT-034 and DEBT-035, which stay open

**Where:** `src-tauri/src/use_cases/excel_import/parser.rs`, `dto.rs`, `src/features/excel-import/presentation/ImportExcelPage.tsx`, `src/features/excel-import/presentation/components/ProcedureTypeMappingStep.tsx`, `docs/spec/excel-import.md`

**Observation:** 22 of 30 rules are fully implemented and 14 have a test of their own; none of it comes from this release. Not yet in the debt file: (2) EXI-070 — Retry after a failed execution parses the file again, with new ids, after the user mapped the types. (3) EXI-120 — Continue is not disabled while the saved mappings load: a click in that short window sends an empty mapping, skips every procedure and overwrites the saved preferences. (4) EXI-050 — a procedure gets no temporary id, though the rule says so. (5) The comment in `dto.rs` still describes the skip reason as a translated text; it is a typed code (EXI-290). Rules with no test at all: EXI-040, 050, 060, 100, 120, 130, 140, 240; the mapping step and the inline type creation have no test file.

**Size:** L

**Waits on the owner:** no

**Refined (2026-10-14, before queuing):** two slices this batch, the rest stays open. Point 1 ships with DEBT-035 (its Done when there). Point 3, a pull request of its own: `ProcedureTypeMappingStep.tsx` disables Continue on `isLoading` only, while `savedAmountMappings` is `null` until the gateway answers. Done when: Continue is disabled while the saved mappings load; a Vitest test clicks it before the gateway resolves and sees nothing sent and no mapping saved; screenshots. Nothing new is seen beyond a button disabled for that moment, so no design. A `fix`. Size S for each slice.

**Shipped 2026-10-14:** point (1), with DEBT-035 — a repeated identifier in the fund sheet and a repeated patient in the patient sheet are one record. Points (2) to (5) and the missing tests stay open.

**Added 2026-10-14** (`reviewer-backend`, on the fix of point 1): the Secu sheet's identifier is compared untrimmed, as EXI-090's "exact identifier" says, while the monthly sheets trim it before their lookup — so `"75 "` stays a fund of its own that no procedure row finds. Whether EXI-090 trims is a spec point. Also no test reads the monthly-sheet side of EXI-030 and EXI-080 (`extract_patients_from_monthly_sheets`) nor the `(code: …)` link of a procedure row: both need an xlsx fixture without a Patiente sheet (`spec-checker`, 2026-10-14).

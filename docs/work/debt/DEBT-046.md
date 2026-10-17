# 2026-10-06 — DEBT-046 — The Excel import: findings of the 0.24.1 spec check not yet recorded

**Found by:** spec-checker, release preparation of 0.24.1 (read in the code, not run); completes DEBT-034 and DEBT-035, which stay open

**Where:** `src-tauri/src/use_cases/excel_import/parser.rs`, `dto.rs`, `src/features/excel-import/presentation/ImportExcelPage.tsx`, `src/features/excel-import/presentation/components/ProcedureTypeMappingStep.tsx`, `docs/spec/excel-import.md`

**Observation:** 22 of 30 rules are fully implemented and 14 have a test of their own; none of it comes from this release. Not yet in the debt file: (2) EXI-070 — Retry after a failed execution parses the file again, with new ids, after the user mapped the types. (4) EXI-050 — a procedure gets no temporary id, though the rule says so. (5) The comment in `dto.rs` still describes the skip reason as a translated text; it is a typed code (EXI-290). Rules with no test at all: EXI-040, 050, 060, 100, 120, 130, 140, 240; the mapping step and the inline type creation have no test file.

**Size:** L

**Waits on the owner:** no

**Refined (2026-10-14, before queuing):** two slices this batch, the rest stays open. Point 1 ships with DEBT-035 (its Done when there). Point 3, a pull request of its own: `ProcedureTypeMappingStep.tsx` disables Continue on `isLoading` only, while `savedAmountMappings` is `null` until the gateway answers. Done when: Continue is disabled while the saved mappings load; a Vitest test clicks it before the gateway resolves and sees nothing sent and no mapping saved; screenshots. Nothing new is seen beyond a button disabled for that moment, so no design. A `fix`. Size S for each slice.

**Shipped 2026-10-14:** point (1), with DEBT-035 — a repeated identifier in the fund sheet and a repeated patient in the patient sheet are one record. Points (2), (4), (5) and the missing tests stay open.

**Added 2026-10-14** (`reviewer-backend`, on the fix of point 1): the Secu sheet's identifier is compared untrimmed, as EXI-090's "exact identifier" says, while the monthly sheets trim it before their lookup — so `"75 "` stays a fund of its own that no procedure row finds. Whether EXI-090 trims is a spec point. Also no test reads the monthly-sheet side of EXI-030 and EXI-080 (`extract_patients_from_monthly_sheets`) nor the `(code: …)` link of a procedure row: both need an xlsx fixture without a Patiente sheet (`spec-checker`, 2026-10-14).

**Shipped 2026-10-14:** point (3) — Continue waits for the saved mappings (Vitest, screenshots). Seen in its screenshots, older: in dark mode the mapping table's header and amount column (`text-neutral-90`) barely show against the surface.

**Added 2026-10-17** (`spec-checker`, release preparation): 27 of 30 rules implemented, 21 tested. Partial: EXI-020 (a row with an empty date is skipped unreported), EXI-070 (point 2), EXI-220 (`Patiente` and `Secu` in the missing-sheet list, shown as raw names). Untested: EXI-050, 060, 130, 140, the gate order of EXI-180, EXI-210's result screen, EXI-120's no-type branch; no gateway test for `parseExcelFile`, `getExcelAmountMappings`, `saveExcelAmountMappings`. Documents: the contract's `SkippedRow.reason` still a text (point 5, and the `dto.rs` comment); two rules numbered (R25); the workflow diagram's separate execute-time report; `excel_codec.rs` names `sheetOrder.ts`, now `sheets.ts`. One risk traced, not run: the month purge hard-deletes every row of a month, soft-deleted ones included, while `fund_payment_line` and `bank_transfer_procedure_link` reference `procedure(id)` — a soft-deleted procedure still linked there could fail the whole import.

**Gate (2026-10-17):** a document drifting from the code rides with the next `feat` or `fix` of its area (FLOW-079; FLOW-032 superseded, owner).

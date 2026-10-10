# 2026-10-06 — DEBT-043 — Fourteen frontend logic files are still to move to Rust (rest of TODO-016)

**Found by:** the owner's cut of TODO-016 for 0.24.1 (2026-10-06): the entry is closed on what shipped, the rest is this debt, for the next release

**Where:** `arch-allowlist.json` (`frontend_logic_files`, rule A8), the files below

**Observation:** TODO-016 shipped the rule (logic lives in Rust, A8 freezes the frontend logic files, the core builds without the desktop shell) and three features: patient, fund, procedure type. Fourteen files stay frozen; A8 keeps the list from growing. Each feature is one pull request with an audit table (moved / kept as display only); a form with several fields answers every refusal at once (`docs/error-model.md`); a user's change from a form is `edit(...)` on the aggregate. Expect a gap in Rust behind each screen check, as the first three had.

- **Form validators** — `fund-payment/shared/validatePayment.ts`, `bank-transfer/shared/validateBankTransfer.ts`: a fund or an account, a date and at least one item are chosen. The backend does not enforce "at least one procedure" on a fund payment today (FPM-200); the check before opening the procedure picker is display state and stays.
- **Dashboard** — `dashboard/utils/aggregation.ts`, `dashboard/api/dashboardService.ts`: the yearly metrics are aggregated on screen from every procedure; a Rust read model replaces them.
- **Procedure list** — `procedure/model/overdue.logic.ts`, `date.logic.ts`, `procedure-row.mapper.ts`: the overdue rule and its high-water mark, day and month helpers, the row mapping with its euro conversion (DEBT-041).
- **Bank statement matching** — `bank-statement-match/shared/candidateSelection.ts`, `labelRows.ts`, `procedureWindow.ts`: the covered amount of a selection, the label rows and whether all are decided, the date window of candidate procedures.
- **Excel import** — `excel-import/shared/mappings.ts`, `sheets.ts`: the procedure type mappings derived from the parse result, the sheet order.
- **Fund payment matching** — `fund-payment-match/shared/utils.ts`, `formatters.ts`: correction keys and builders, the PDF date range, the priority order of issues, the anomaly count; `formatters.ts` is display and may only need reclassifying.

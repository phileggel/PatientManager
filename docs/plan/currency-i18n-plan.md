# Plan — Currency localization audit & fix

> Audit performed 2026-05-12 (planning artifact). Mirror of PR #26 (`fix/date-localization`); same surgical 4-commit shape applied to currency display.

## Context

PR #26 fixed every date-display site that bypassed `useFormatters` or hardcoded `fr-FR`. The same class of issue exists for **currency display**: the canonical helper `useFormatters().formatCurrency` is used in some places, but ~37 sites bypass it via hand-rolled `(amount / 1000).toFixed(2)` + literal `€`, or `new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" })`. Both are locale-blind: the decimal separator stays as a dot, currency symbol position is hardcoded, and an English-locale user would see French formatting (or vice versa).

This plan promotes a pure helper to `src/lib/formatters.ts`, deletes the duplicate/locale-blind helpers, sweeps every call site through the locale-aware helper, and adds an RTL regression test on a representative site.

## Scope (audit results)

| Category | Count | Pattern |
|---|---|---|
| A — `.toFixed(2)` + literal `€` in JSX | 14 | `{(amount / 1000).toFixed(2)} €` or `€{...}` |
| B — `Intl.NumberFormat("fr-FR")` hardcoded | 4 (+1 test) | helpers, module-level consts |
| C1 — Duplicate `formatAmount` / `formatAmountEUR` helpers | 3 | locale-blind output |
| C2 — Callers of those helpers | ~17 | most also append literal `€` |
| **Total** | **~37** | |

## Files to modify

### Foundation (Commit 1)
- `src/lib/formatters.ts` — add pure `formatCurrency(amount, locale)`. Have `useFormatters().formatCurrency` delegate to it. Move the explicit `minimumFractionDigits: 2 / maximumFractionDigits: 2` options in (so output is always `X,XX €`, consistent with the existing `formatCurrency` in fund-payment-match).
- `src/lib/formatters.test.ts` — round-trip tests: fr-FR `100,00 €`, en-GB `€100.00`, en-US `€100.00`, edge cases (0, negative, very large).
- `src/features/fund-payment-match/shared/formatters.ts` — re-export `formatCurrency` from `@/lib/formatters` (back-compat for `reportPresenter.ts` which already calls it correctly).

### Reconciliation cards + delete shared `formatAmount` (Commit 2)
- `src/features/fund-payment-match/shared/utils.ts:180` — **delete** `formatAmount` (returns bare `.toFixed(2)` string with no €).
- `src/features/fund-payment-match/shared/utils.test.ts:351–358` — delete the corresponding tests.
- `src/features/fund-payment-match/reconciliation_results/cards/NotFoundCard.tsx:96` — switch to `formatCurrency` via existing `useFormatters` hook; drop literal `€`.
- `src/features/fund-payment-match/reconciliation_results/cards/SingleMatchCard.tsx:105,111,159,171` — 4 sites.
- `src/features/fund-payment-match/reconciliation_results/cards/CardParts.tsx:37` — 1 site.
- `src/features/fund-payment-match/reconciliation_results/cards/GroupMatchCard.tsx:122,126,129` — 3 sites.
- `src/features/fund-payment-match/pdf_data_table/PdfDataTable.tsx:13` — **delete** local `formatAmount`; switch 4 callers (lines 33, 56, 116, 119) to `useFormatters().formatCurrency` (hook already imported on this file from PR #26).
- Extend `src/features/fund-payment-match/reconciliation_results/cards/SingleMatchCard.test.tsx` — assert localized currency in the AmountMismatch comparison row (paired with the date assertion already in place).

### Other `.toFixed(2) + €` sites (Commit 3)
- `src/features/bank-transfer/bank_transfer_list/BankTransferList.tsx:59,84,95` — 3 sites; hook already imported.
- `src/features/bank-transfer/select_items_panel/SelectProceduresPanel.tsx:63,112` — 2 sites; hook already imported.
- `src/features/bank-transfer/select_items_panel/SelectFundGroupsPanel.tsx:63,110` — 2 sites; hook already imported.
- `src/features/bank-transfer/edit_bank_transfer_modal/EditBankTransferModal.tsx:145` — 1 site; add import.
- `src/features/bank-transfer/add_bank_transfer_form/AddBankTransferForm.tsx:119` — 1 site; add import.
- `src/features/bank-statement-match/ui/MatchResultsStep.tsx:137,162` — 2 sites; hook already imported.
- `src/features/excel-import/presentation/components/ProcedureTypeMappingStep.tsx:157,178` — 2 sites; add import.
- `src/features/fund-payment-match/unreconciled_report/UnreconciledReport.tsx:65` — 1 site; hook already imported.

### Hardcoded `fr-FR` Intl.NumberFormat + helper deletion (Commit 4)
- `src/features/fund-payment/shared/presenter.ts:17–20` — **delete** `formatAmountEUR` (hardcoded fr-FR).
- `src/features/fund-payment/shared/presenter.ts:75–90` — refactor `FundPaymentPresenter.toSelectionSummary` to **drop** `totalFormatted: string` and **expose `totalAmount: number`** instead (decided 2026-05-12: option B, mirrors `toRow` returning raw `paymentDate`). Callers format via hook.
- `src/features/fund-payment/select_procedure_modal/SelectProcedureModal.tsx:174,193` — switch `formatAmountEUR(...)` → `formatCurrency(...)` (hook already imported from PR #26); consume the new `totalAmount` from the summary.
- `src/features/fund-payment/edit_fund_payment_modal/EditFundPaymentModal.tsx:104,184` — same migration; hook already imported.
- `src/features/fund-payment/shared/presenter.test.ts:8–18` — delete the `formatAmountEUR` test block.
- `src/features/procedure-type/procedure_type_list/ProcedureTypeList.tsx:25` — delete the module-level `euroFormatter` const; switch the component to `useFormatters().formatCurrency`.
- `src/features/procedure-type/procedure_type_list/ProcedureTypeList.test.tsx:132` — replace the hardcoded `Intl.NumberFormat("fr-FR", ...)` fixture with the locale-aware output (en-GB at test setup).

### Out of scope (file separately if needed)
- `src/features/patient/edit_patient_modal/EditPatientModal.test.tsx:13` — mock returns `(amount/1000).toFixed(2)`. Test-internal, no production impact.
- `src/lib/` → `src/ui/format/` migration per F28 — pre-existing tech debt; not surfaced by this PR.

## Coverage backfill (rolled into the relevant commits)

PR #26 left 13 lines uncovered (62.85% patch coverage, mostly JSX render expressions). The same files appear in this audit, so 3 reachable backfills ride along with the currency edits:

- **Commit 1** — `src/lib/formatters.test.ts`: add a `renderHook` test for `useFormatters().formatDate("")` empty-string branch (covers the 1 PR#26 partial line in `formatters.ts`). Naturally extends to `formatCurrency(0)` / `formatCurrency` with an unset amount when commit 1 adds the new pure helper.
- **Commit 2** — `src/features/procedure/ui/PeriodSelector.test.tsx` (new): isolated component test asserting the rendered month name uses the resolved locale (covers the 1 PR#26 line + verifies the `getMonthName(month, locale)` signature change wasn't regressed).
- **Commit 4** — `src/features/procedure/ui/procedure_list/ProcedureList.test.tsx` (new — or extend if it exists): render with mock rows asserting both ternary branches of `procedureDate` / `confirmedPaymentDate` render as localized dates OR the "—" fallback (covers 3 PR#26 lines + locks down the currency render).

**Intentionally skipped** (low-ROI render-coverage gaps without existing test scaffolding — adding ~30 LOC of prop/store/i18n setup just to hit 1 line each is scope creep):
- `BankTransferList.tsx`, `SelectFundGroupsPanel.tsx`, `SelectProceduresPanel.tsx`, `EditFundPaymentModal.tsx`, `MatchResultsStep.tsx`, `PdfDataTable.tsx` (8 lines combined). The currency-side render assertions cover the same JSX shape implicitly when ANY future test touches these components.

## Existing helpers / patterns to reuse

- **`useFormatters()` hook** at `src/lib/formatters.ts` — already exports `formatCurrency`. The fix routes everything through it (hook for components, pure `formatCurrency(amount, locale)` for non-hook contexts via locale arg).
- **`formatCurrency(thousandths, locale)` in `src/features/fund-payment-match/shared/formatters.ts`** — already locale-aware. Implementation is the canonical one; this PR promotes it to `src/lib/formatters.ts` and re-exports from the feature-shared location.
- **Test-setup pattern** at `src/lib/test-setup.ts` — sets `i18n.language = "en"`, so RTL assertions use the en-GB output (e.g. `€100.00`).
- **PR #26 layout** — same 4-commit shape, same review flow, ~25 files. Direct precedent.

## Commit split

1. **`refactor(lib): promote formatCurrency to lib/formatters`** (~40 LOC, foundation + tests)
2. **`fix(fund-payment-match): localize reconciliation card amounts`** (~50 LOC, ~17 sites + delete shared/local `formatAmount` + tests)
3. **`fix(currency-i18n): localize remaining .toFixed(2) currency sites`** (~30 LOC, ~14 JSX sites across bank-transfer, bank-statement-match, excel-import, unreconciled-report)
4. **`fix(currency-i18n): replace hardcoded fr-FR Intl.NumberFormat helpers`** (~50 LOC, delete `formatAmountEUR` + `euroFormatter` + `toSelectionSummary` refactor + test updates)

Total estimate: ~170 LOC across ~25 files. Comparable to PR #26 (207/162 = 369 LOC, 26 files).

## Verification

- After each commit: `just check` green; affected `npx vitest run <path>` passes.
- After commit 1: 6+ new unit tests in `src/lib/formatters.test.ts` for `formatCurrency`.
- After commit 2: extended `SingleMatchCard.test.tsx` asserts both date AND currency render localized in the comparison row.
- After commit 4: `presenter.test.ts` no longer imports `formatAmountEUR`; `ProcedureTypeList.test.tsx` asserts the en-GB currency output.
- Final: `just check-full` — all FE tests + Rust lib + build pass.
- Manual sanity (post-merge): toggle UI language between fr/en and confirm currencies flip format throughout the affected screens (auto-correction comparison, reconciliation summary, bank transfer lists, fund-payment list/modal, procedure-type list).

## Reviewer plan

After commit 4, run `reviewer-frontend` + `reviewer-arch` in parallel. Apply graded findings (same discipline as PR #26: amend HEAD, no separate fix commit). Then `/create-pr`.

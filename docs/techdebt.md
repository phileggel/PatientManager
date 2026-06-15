# Tech Debt

Observations of code smells, inconsistencies, and brittle patterns. Not commitments — tech-debt entries describe _what's odd_, not _what to do_. For action items see `docs/todo.md`.

`whats-next` reads from this file; entries surface as work candidates labelled with their date.

---

<!-- entries removed when resolved; this file is otherwise the running observation log -->

## 2026-06-15 — `handleValidate` stores a translated string in `validationError` (F27 layer violation)

**Found by:** reviewer-frontend (FPA-460 supersession branch)

**Where:** `src/features/fund-payment-match/reconciliation_modal/useReconciliationModal.ts` — `handleValidate` coerces `result.error` via `formatReconciliationError` + `t()` and stores a `string` in `validationError` (the PDF-load `error` state does the same).

**Observation:** F27 wants the hook (Layer 2) to store the _typed_ error and let the presenter (Layer 3) map `code → i18n key` and the component (Layer 4) translate. Today the hook translates eagerly, collapsing the typed `FundPaymentReconciliationError` to a display string. Pre-existing — `handleValidate` predates the FPA-460 change (the diff only surfaced it in the hook's return object). Fix when the reconciliation error pipeline is next touched: store the typed error in state, move `formatReconciliationError` into a presenter, translate in the component.

---

## 2026-06-15 — fund-payment-match i18n keys use camelCase segments (i18n-rules §31 snake_case)

**Found by:** reviewer-frontend (FPA-460 supersession branch)

**Where:** `src/i18n/locales/{en,fr}/fund-payment-match.json` — ~46 keys use camelCase segments (`autoCorrect`, `validateSuccess`, `prevAria`, `correctAmount`, …).

**Observation:** `docs/i18n-rules.md` §31 mandates snake_case for every key segment. This namespace predates the rule and is uniformly camelCase. New keys added by the FPA-460 change (`validate`, `undo`, `undoAria`) followed the established in-file convention on purpose — introducing a split would leave the namespace half-migrated, which is worse than either pure state. Resolve as a dedicated `refactor(i18n)` pass (rename JSON keys + their `t()` call sites across the feature), not piecemeal; likely affects other feature namespaces too, so audit scope before scheduling.

---

## 2026-05-27 — `formatBankError` ownership: presenter lives in `bank-account` but two features consume it

**Found by:** reviewer-arch (`refactor/typed-errors-fund-bank` @ `ea606ad`)

**Where:** `src/features/bank-account/shared/presenter.ts` (defines `formatBankError`); consumed by `src/features/bank-transfer/useBankTransferOperations.ts` and `src/features/bank-statement-match/ui/useBankStatementModal.ts` via cross-feature primitive imports.

**Observation:** `BankError` is a BC type — it belongs to neither feature alone. The presenter sits in `bank-account/shared/` only by historical accident (first writer wins). F26 currently permits the cross-feature primitive import. When a third consumer appears, promote `formatBankError` to a location that reflects shared BC ownership — e.g. a `src/features/bank/shared/presenter.ts` feature-level surface, or an explicit re-export shape.

---

## 2026-05-19 — REF-240 enforced at command layer via dual-orchestrator injection

**Found by:** manual (`refactor/fund-payment-manual-management`)

**Where:** `src-tauri/src/use_cases/fund_payment_manual_management/api.rs:28–53` — the `delete_fund_payment_group` Tauri command injects both `FundPaymentManualManagementOrchestrator` and `OverpaymentOrchestrator`. The REF-240 guard (`ensure_not_refund_fund_payment_group`) is enforced at the command boundary rather than inside the manual delete use case. Lifted verbatim from the pre-refactor `context/fund/api.rs`; surfaced more clearly now that the command lives in its dedicated module.

**Observation:** REF-240 is a domain invariant ("a refund-cascade `FundPaymentGroup` cannot be deleted directly — only via the REF-210 cancellation cascade"), so it must hold for any caller of the manual delete path, not only the Tauri command. Today the check requires a cross-context query (`procedure_refund.refund_fund_payment_group_id`) because the `FundPaymentGroup` row itself carries no marker of what created it; that cross-context need is why the rule sits at the command layer with two `State<>` injections. Two consequences: (a) any future caller bypassing the Tauri command (event handler, CLI, integration test) bypasses the rule; (b) the manual orchestrator depends transitively on the overpayment context for what should be a local invariant.

**Surfaced direction:** Add a `source: GroupSource { Manual, Reconciled, Refund }` column on `FundPaymentGroup`, stamped once at creation by whichever flow writes the row (REF-100 = `Refund`; manual orchestrator = `Manual`; reconciliation orchestrator = `Reconciled`). REF-240 then collapses to `if group.source == Refund { reject }` inside `delete_group_with_cleanup`, and the Tauri command shrinks back to one `State<>`. `procedure_refund.refund_fund_payment_group_id` stays as the cascade key for REF-210 — `source` is the guard projection. Prefer enum over boolean (`is_refund: bool`) because: (a) `Manual` vs `Reconciled` is already an implicit workflow distinction we don't model today, (b) the field is creation-time immutable so an enum models it honestly, (c) booleans don't compose if a fourth origin appears. `source` (or `origin`) over `status` — the value is set once and never mutated.

**Migration constraint:** Backfill must be lossless. The Refund half is exact (JOIN against `procedure_refund.refund_fund_payment_group_id`). The Manual vs Reconciled half cannot be reconstructed from a lossy default because future code paths (UI filters, reports, additional invariants) will rely on the distinction. Migration must identify historical Manual vs Reconciled groups precisely — likely by analyzing reconciliation/import provenance signals already present on related rows (e.g. presence of an excel-import or PDF-reconciliation provenance trail). If no signal exists for some legacy rows, the migration design has to surface them for explicit user/operator classification rather than silently bucket them.

**Scope at fix time:** schema migration (add column + lossless backfill), update `FundPaymentGroup` domain factories (`new`/`with_id`/`restore`) to carry `source`, update REF-100, manual create, and reconciliation create paths to stamp the right value, move REF-240 enforcement into `delete_group_with_cleanup`, drop the second `State<>` from `delete_fund_payment_group`, drop the `OverpaymentOrchestrator` dep wiring from the manual delete path. `reviewer-sql` must run on the migration. REF-220 / REF-230 (status-based local guards on procedure deletion) are unaffected — they already are local and need no changes.

---

## 2026-05-19 — Non-atomic bank-reconciliation writes leave a partial-crash window for `is_locked`

**Where:** `src-tauri/src/use_cases/bank_statement_reconciliation/orchestrator.rs:393–402`, `src-tauri/src/use_cases/bank_manual_match/orchestrator.rs:126,528` — multi-step writes update procedure statuses (tx 1) then group status (tx 2) sequentially, with no enclosing transaction.

**Observation:** A process crash between tx 1 and tx 2 leaves linked procedures `FundPaid`/`PartiallyFundPaid` while the group's stored `FundPaymentGroupStatus` is still `Active`. On next read, `is_locked` returns `false` on the FundPaymentList page until the user re-runs the bank match (or manually transitions the group). Until 2026-05-19 a defensive `recompute_is_locked` in `context/fund/api.rs::read_all_fund_payment_groups` papered over this by re-reading procedures cross-context on every list load — but (a) it violated B13, (b) it never wrote the corrected state back to disk so other commands (`delete_fund_payment_group` etc.) still saw the stored stale status, and (c) the inconsistent window can't actually be observed by clients in normal single-user operation (the user triggered the orchestrator and is waiting for it to return; FE reads only fire after the orchestrator publishes `FundPaymentGroupUpdated`, post-tx-2). The defensive recompute was dropped (`refactor/drop-is-locked-recompute`); the underlying non-atomicity is the real issue and should be fixed when UoW infrastructure lands per ADR-003 (`core/uow.rs`).

---

## 2026-05-16 — RTL coverage gap on currency-display components

**Where:** Components with `formatCurrency` calls but no RTL test:
`SelectProceduresPanel`, `SelectFundGroupsPanel`, `BankTransferList`,
`EditBankTransferModal`, `AddBankTransferForm`, `MatchResultsStep`,
`ProcedureTypeMappingStep`, `EditFundPaymentModal`, `PdfDataTable`,
`NotFoundCard`, `UnreconciledReport`, `GroupMatchCard`.

**Observation:** Surfaced by PR #33's codecov flag (~16 of 18 missing lines on
the currency-i18n sweep). None had RTL tests before the PR — the migration to
`formatCurrency` routed existing display through a different helper, exposing
the pre-existing gap. Functional regression risk is low (mechanical display
swap; the formatter is unit-tested in `src/lib/formatters.test.ts` and the
integration is covered by `SingleMatchCard.test.tsx` AmountMismatch and
`FundPaymentList.test.tsx` locale-aware regressions). Add RTL coverage
**bit-by-bit when these components are next touched for behavioral changes**,
not as a sweep.

---

## 2026-06-06 — Bank credit reconciliation can't handle composite credit lines

- Found by: manual (issue #62)
- Where: `src-tauri/src/use_cases/bank_statement_reconciliation/orchestrator.rs` (exact-amount match, ~L302); domain model (no "aid"/bonus payment concept)
- Severity: 🟡
- Observation: Bank-statement reconciliation auto-matches a credit line to a single fund payment group only on exact amount equality (`group.total_amount == line.amount`, ~L302). A real bank credit is often a composite the current 1:1 exact match cannot settle, in two distinct cases:
  - **Multi-group:** one credit equals the sum of _several tracked_ fund groups (e.g. 247 € = 72 € + 175 €, both real groups). Matching is 1:1 only — there is no subset-sum that lets one bank line settle multiple groups whose totals add up to it. The line stays in `unmatched_lines`.
  - **Uncovered amount:** part of the credit corresponds to something the app does not model at all — e.g. 247 € = 72 € fund group + 175 € "aide"/bonus (an assistance transfer with no entity in the domain). Even perfect multi-group matching can't reconcile this: there is no record to match the 175 € against.
- Note: validating a tracked group via manual match is always safe — it mints its own FundWire transfer sized to the group and never touches the bank statement line, so there is NO data-integrity risk and the bank payment is not "broken". The gap is purely reconciliation _coverage_, not correctness. Resolution direction differs per case: multi-group needs subset/multi-group matching (one bank line → N groups); uncovered-amount needs either a modeled "aid payment" entity that becomes a matchable line item, OR a manual "remainder" annotation recording the untracked portion. Until then, composite credit lines remain unmatched and require manual bookkeeping outside the app.

---

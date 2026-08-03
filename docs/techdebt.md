# Tech Debt

Observations of code smells, inconsistencies, and brittle patterns. Not commitments — tech-debt entries describe _what's odd_, not _what to do_. For action items see `docs/todo.md`.

`whats-next` reads from this file; entries surface as work candidates labelled with their date.

---

<!-- entries removed when resolved; this file is otherwise the running observation log -->

## 2026-08-02 — Logging target absent across procedure repository

**Found by:** reviewer-backend (branch `feat/bank-born-groups` @ `ed6f214`, severity 🔵)

**Where:** `src-tauri/src/context/procedure/repository/procedure.rs`

**Observation:** all ~21 pre-existing `tracing::*!` calls in this file omit `target: BACKEND` (B29/B30); only the new BAS-112 debug line carries it, leaving the file internally inconsistent with the backend logging convention. A file-wide sweep is its own story — not per-line patches inside feature PRs.

---

## 2026-07-30 — Prune finding: unused codec constant

**Found by:** /prune (post-v0.20.1 lean check, report `tmp/prune-2026-07-30-01.md`; user routed to techdebt). _(The second prune finding — the redundant FE candidate re-sort — was resolved by the most-recent-first ordering change on branch `next`, 2026-07-30.)_

**Where:** `src-tauri/src/use_cases/bank_statement_reconciliation/bank_pdf_codec.rs:24` — `IBAN_HEADER_MARKER` has zero consumers; `extract_iban` (`parser.rs:38`) builds its regex inline while every sibling codec constant IS consumed.

**Observation:** risk-free, compile-checked, ≤5 LOC. Resolution direction: wire `extract_iban` to the constant (codec symmetry) rather than deleting it. Resolution commit type: `refactor:`. Fold into the next task touching the parser/codec.

---

## 2026-07-30 — Deep bank-statement E2E via ADR-007 (fixture PDF + full flow)

**Found by:** reviewer-e2e (branch `next`, batch 2) — user confirmed techdebt routing.

**Where:** `e2e/bank-statement/entry-point.test.ts` covers entry wiring + one direct-invoke IPC smoke only. ADR-007's `setE2eOverrides({ pickPdfFilePath })` (unused by any spec today) can bypass the native file dialog and drive the REAL flow: card click → fixture PDF → `BankStatementModal` → correction (wizard or modal) → validate → transfer count.

**Observation:** needs a committed fixture bank-statement PDF (synthetic — generate via the dev-fixtures codec, never a real statement; binary-resource rule applies) plus scenario budget. First E2E consumer of `setE2eOverrides` — worth pairing with a fund-payment-report deep flow in the same task to amortize the pattern.

---

## 2026-07-29 — `read_all_funds` has no ORDER BY; every consumer inherits insertion order

**Found by:** manual audit (bank reconciliation UX, branch `next`).

**Where:** `src-tauri/src/context/fund/repository.rs:82-97` — `SELECT … FROM fund` without `ORDER BY`, so the funds cache (`infra/cache/store.ts`) and every dropdown consuming it render funds in DB-insertion order.

**Observation:** the bank-statement fund selects get an FE-local `localeCompare` sort as the surgical fix; a backend `ORDER BY name COLLATE NOCASE` would fix all consumers at once but changes ordering everywhere (dashboard, excel-import mapping) and deserves its own pass. When next touching the fund repository, consider promoting the sort to SQL and dropping the FE-local sorts.

---

## 2026-07-30 — Rejected / mis-linked labels have no re-link route from the list

**Found by:** post-v0.20.0 audit (branch `next`, batch 2).

**Where:** `src/features/bank-statement-match/ui/ReconciliationView.tsx` (Rejected falls through to `AssignGroupsModal` and dead-ends — no path back to `LinkFundModal`); `src-tauri/src/use_cases/bank_statement_reconciliation/reconciliation.rs` `apply_link_fund` Fund branch (does not release groups assigned under the previous fund — latent until a re-link route exists; ship both together).

**Observation:** a wrong rejection or wrong saved mapping cannot be corrected from the list; the fix needs a small routing design (which modal for which status) plus the release fix, so it deserves its own scoped task rather than a bolt-on.

---

## 2026-07-30 — Explicit unassign does not survive a later link-fund cascade

**Found by:** post-v0.20.0 audit (spec-checker, BAS-062).

**Where:** `src-tauri/src/use_cases/bank_statement_reconciliation/reconciliation.rs` — `apply_link_fund` re-runs `auto_match` unconditionally; a deliberately unassigned line (`assigned_group_ids` empty) matches the auto-match eligibility filter and gets silently re-matched, contradicting BAS-062's "takes precedence for the rest of the recompute".

**Observation:** fixing it needs an explicit-override marker on the working line (design call on the engine's state model) for an interaction that requires unassigning then linking a different label in the same session — rare. Defer until the engine is next touched.

---

## 2026-07-30 — Reconciliation polish backlog (grouped)

**Found by:** post-v0.20.0 audit (branch `next`, batch 2) — items deliberately deferred under KISS/YAGNI; none affects correctness of the main flow.

**Where/what:** double-click-only correction entry (no keyboard path, no hint string) — `ReconciliationList.tsx`; revert log shows internal `line-N` ids and shares one aria-label — `reconciliationPresenter.ts`, `ReconciliationView.tsx`; gate state not reset when a second file is opened in the same session — `useBankStatementGate.ts`; `apply_acknowledge_remainder` accepts any line (silent no-op corrections) and duplicate group ids are unguarded at the engine boundary (unreachable via UI) — `reconciliation.rs`; bare unstyled checkboxes — `ReconciliationList.tsx` / `CandidateList.tsx`; `text-m3-on-success-container` used without its container background — `ReconciliationView.tsx`; list has no busy affordance during recompute (BAS-064's busy state is suppress-only); group candidate rows render nothing when the candidate set is empty (no empty-state fallback) — `CandidateList.tsx` / `GroupCandidateRows` (found by reviewer-frontend 2026-08-02; the procedure-scope sibling got its fallback in the bank-born-groups PR).

**Observation:** batch these when the reconciliation UI is next reworked; individually none justifies a PR.

---

## 2026-06-19 — Two i18n key sets intentionally exempt from §31 snake_case

**Found by:** the snake_case migration (PR #91 — resolved the `docs/todo.md` "Migrate i18n keys" entry).

**Where:** `src/i18n/locales/{en,fr}/excel-import.json` → `sheet_selection.sheets.{Jan,Fév,…,Déc}` (French Title-case month tokens); `src/i18n/locales/{en,fr}/fund-payment-match.json` → `print.section2.groups.{ContestAmount,CreateProcedure,LinkProcedure,AmountMismatch,FundMismatch,DateMismatch}` (PascalCase wire enum variants).

**Observation:** these leaf segments are NOT snake_case on purpose. They are looked up via runtime interpolation — ``t(`sheet_selection.sheets.${sheet}`)`` (sheet = SHEET_ORDER token) and ``t(`print.section2.groups.${type}`)`` (`reportPresenter.ts`, type = backend enum variant). The key must match the runtime value verbatim, so snake_casing them silently breaks the lookup. A future §31 audit / lint MUST skip these two subtrees; "fixing" them is a regression, not a cleanup. All other key segments are §31-compliant after PR #91.

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

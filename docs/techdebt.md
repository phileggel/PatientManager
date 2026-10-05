# Tech Debt

Observations of code smells, inconsistencies, and brittle patterns — agent-owned (`docs/workflow.md` § 2). Not commitments: an entry becomes work when the owner queues its `DEBT-NNN` in `docs/todo.md` § Next. Ids are permanent and never reused; newest entries first.

---

<!-- entries removed when resolved; this file is otherwise the running observation log -->

## 2026-10-05 — DEBT-037 — The patient feature has no spec

**Found by:** contract-reviewer (branch `fix/patient-edit-is-validated`)

**Where:** `docs/contracts/patient-contract.md`

**Observation:** the patient contract was derived from the code; no `docs/spec/` document states the patient rules (a name is required unless anonymous, an SSN is 13 ASCII digits, an edit validates only what it changes), so they carry no rule id and no `spec-checker` reads them. Owner's decision: write a patient spec with `/spec-writer`, or keep the contract as the only record.

---

## 2026-10-05 — DEBT-036 — `RESET_DATABASE` deletes the database in release builds too

**Found by:** reviewer-security (a note on branch `refactor/todo-016-core-without-the-shell`; pre-existing)

**Where:** `src-tauri/src/app.rs` (`initialize_app`), `src-tauri/src/shared/infrastructure/db.rs`

**Observation:** when the environment variable `RESET_DATABASE` is `true` or `1`, the application deletes its database file at start-up, in every build. Like DEBT-028 before it, setting it needs control of the user's environment, so the risk is low; but a shipped binary has no use for it and the loss is the user's data. Read it in a debug build only, with the same test shape as `db_path_for`.

---

## 2026-10-05 — DEBT-035 — An SSN that is not 13 digits in the patient sheet may fail the whole import

**Found by:** spec-checker (branch `fix/debt-031-block-month-on-every-blocking-status`; read in the code, not run)

**Where:** `src-tauri/src/use_cases/excel_import/parser.rs` (the patient-sheet path), `src-tauri/src/use_cases/excel_import/orchestrator.rs`, `docs/spec/excel-import.md` (EXI-030)

**Observation:** EXI-030's 13-digit check and its fallback name exist only where a patient is derived from a monthly sheet. A row of the patient sheet keeps its SSN as written; the orchestrator passes it to the patient batch creation, whose validation rejects it, and the error propagates as a failed import. To confirm with a test before fixing. A `fix`.

---

## 2026-10-05 — DEBT-034 — The Excel import spec has gaps its first review found

**Found by:** spec-reviewer (branch `fix/debt-031-block-month-on-every-blocking-status`; the spec had never been reviewed)

**Where:** `docs/spec/excel-import.md`

**Observation:** none comes from the EXI-160 change. Possible behaviour gaps, to check against the code before anything else: (1) blocking and deletion work on a year-month, but EXI-160 and EXI-170 speak of the sheet's nominal month, and EXI-281 checks the month number only — a row dated another year is accepted into a year-month that was neither block-checked nor cleared, so EXI-160's closing "EXI-281 guarantees" sentence holds for the month number alone; (2) no rule says what state is left when an import fails after months were deleted and before their procedures are recreated; (3) no rule covers the tracking fields of a patient whose procedures were deleted and not recreated (PRO-270 covers a single deletion). Form: six rules bundle several behaviours (EXI-010, 020, 080, 110, 220, 260); EXI-230 and EXI-240 are tagged frontend but assert a database save with no backend rule; no `## Entity Definition`, no `## UX Draft`; legacy `(Rn)` labels, with `R25` used twice; discrepant status spellings in EXI-200 and the workflow block. The first spec check (same branch) counts 23 of 29 rules fully implemented and 14 tested: EXI-020, 050, 080, 090 and 220 are partial (skipped rows not reported, no in-file deduplication of patients and funds, `missing_sheets` also naming the two reference sheets), ten rules have no test, and the contract still declares the skip reason as text where the code sends a typed code.

---

## 2026-10-05 — DEBT-033 — Two read models write the definition of an open procedure twice

**Found by:** manual (TODO-004 review)

**Where:** `src-tauri/src/context/procedure/repository/procedure.rs` (`find_unreconciled_by_date_range` and the query behind `OpenProcedureCandidate`), `src-tauri/src/context/procedure/domain/procedure.rs`

**Observation:** `UnreconciledProcedure` (the list at the end of a fund reconciliation) and `OpenProcedureCandidate` (the candidates of a bank reconciliation, BAS-112) both mean a procedure that is `Created` and in no active fund-payment-group line; each query writes that predicate itself, and only the second adds "with a positive billed amount". One definition (B45, B46) removes the copy. Whether the fund reconciliation list should also leave out procedures with no positive amount is a functional question for the owner; until it is answered the two stay different on purpose.

---

## 2026-10-04 — DEBT-030 — The import entry-point E2E test timed out once on Windows

**Found by:** CI (Windows E2E on gh#188, run 37228153025; green on the re-run of the same commit)

**Where:** `e2e/fund-payment-report/entry-point.test.ts`

**Observation:** `#nav-import` did not exist 10 seconds after the app started, right after the diagnostic-report suite; the six suites before it passed, and the pull request changed one comment in `wdio.conf.ts`. One occurrence. If it comes back, look at what the window shows at that moment (the failure screenshot) before raising the timeout: the test waits for the first render of a freshly started app.

---

## 2026-10-03 — DEBT-025 — Four use-case files name sqlx outside a unit of work

**Found by:** reviewer-arch (CI run on PR #166, branch `feat/todo-011-diagnostic-report`)

**Where:** `src-tauri/src/use_cases/db_backup/orchestrator.rs`, `src-tauri/src/use_cases/bank_statement_reconciliation/label_mapping_repo.rs`, `src-tauri/src/use_cases/excel_import/amount_mapping_repo.rs`

**Observation:** B24 forbids sqlx types in a use case outside its `sqlx_uow.rs`. These three predate the check; the two `*_repo.rs` files are whole repositories living in a use case. `just arch-check` tests B24 and freezes them in `arch-allowlist.json` (`sqlx_in_use_cases`, owner's decision of 2026-10-04 on FLOW-003), where the counts may only shrink; `bank_manual_match/orchestrator.rs`, first listed here, names sqlx in its test module only.

---

## 2026-10-03 — DEBT-024 — Support diagnostics: the encrypted bundle and the upload are not built

**Found by:** manual (TODO-011 closure, branch `feat/todo-011-diagnostic-report`)

**Where:** `src-tauri/src/use_cases/diagnostic_report/`, `docs/spec/diagnostic-report.md`

**Observation:** TODO-011 shipped its first tier only: a report with no patient data that the user saves and sends. Its entry also described a second tier, left out of its Done when and removed with it: a support bundle (logs plus a database snapshot) encrypted to the maintainer's public key, so only the maintainer can read it, sent through an upload-only file-drop link rather than an endpoint embedded in the app (which would invite abuse and a storage bill). It needs a consent prompt before the database is included, a retention rule and a privacy note (health data). A one-click upload of the first-tier report to a maintainer-run service was the other option not taken. Both are the owner's to decide and queue.

---

## 2026-10-03 — DEBT-023 — Two use cases import another use case

**Found by:** reviewer-arch (CI run on PR #164, branch `refactor/todo-017-unit-of-work`)

**Where:** `src-tauri/src/use_cases/excel_import/orchestrator.rs` (imports `procedure_orchestration::ProcedureOrchestrationService`), `src-tauri/src/use_cases/fund_payment_manual_management/api.rs` (injects `overpayment::OverpaymentOrchestrator`; see DEBT-003)

**Observation:** B18 forbids a use case importing another use case. These two imports predate the check and were read as a precedent during TODO-017's local review, which let the same violation through until CI caught it. `just arch-check` tests B18 and freezes the two in `arch-allowlist.json` (`use_case_imports`, owner's decision of 2026-10-04 on FLOW-003), where the counts may only shrink.

---

## 2026-08-03 — DEBT-013 — Wire counters orphaned by the two-screen split

**Found by:** spec-reviewer (BAS-120–123 amendment pass, branch `feat/bank-wizard-procedures-and-window`)

**Where:** `BankStatementReconciliation.resolved_count` / `needs_correction_count` (`src-tauri/src/use_cases/bank_statement_reconciliation/reconciliation.rs`, contract § Shared Types)

**Observation:** the settlement screen derives its counts frontend-side over visible lines (BAS-122), leaving the wire's whole-document counters without a consumer. Removing them is a wire change deliberately not folded into the comment-only 2026-08-03 contract refresh; fold into the next PR that reshapes this wire surface.

---

## 2026-08-02 — DEBT-011 — Logging target absent across procedure repository

**Found by:** reviewer-backend (branch `feat/bank-born-groups` @ `ed6f214`, severity 🔵)

**Where:** `src-tauri/src/context/procedure/repository/procedure.rs`

**Observation:** all ~21 pre-existing `tracing::*!` calls in this file omit `target: BACKEND` (B29/B30); only the new BAS-112 debug line carries it, leaving the file internally inconsistent with the backend logging convention. A file-wide sweep is its own story — not per-line patches inside feature PRs.

---

## 2026-07-30 — DEBT-007 — Explicit unassign does not survive a later link-fund cascade

**Found by:** post-v0.20.0 audit (spec-checker, BAS-062).

**Where:** `src-tauri/src/use_cases/bank_statement_reconciliation/reconciliation.rs` — `apply_link_fund` re-runs `auto_match` unconditionally; a deliberately unassigned line (`assigned_group_ids` empty) matches the auto-match eligibility filter and gets silently re-matched, contradicting BAS-062's "takes precedence for the rest of the recompute".

**Observation:** fixing it needs an explicit-override marker on the working line (design call on the engine's state model) for an interaction that requires unassigning then linking a different label in the same session — rare. Defer until the engine is next touched.

---

## 2026-07-30 — DEBT-006 — Reconciliation polish backlog (grouped)

**Found by:** post-v0.20.0 audit (branch `next`, batch 2) — items deliberately deferred under KISS/YAGNI; none affects correctness of the main flow.

**Where/what:** double-click-only correction entry (no keyboard path, no hint string) — `ReconciliationList.tsx`; revert log shows internal `line-N` ids and shares one aria-label — `reconciliationPresenter.ts`, `ReconciliationView.tsx`; gate state not reset when a second file is opened in the same session — `useBankStatementGate.ts`; `apply_acknowledge_remainder` accepts any line (silent no-op corrections) and duplicate group ids are unguarded at the engine boundary (unreachable via UI) — `reconciliation.rs`; bare unstyled checkboxes — `ReconciliationList.tsx` / `CandidateList.tsx`; `text-m3-on-success-container` used without its container background — `ReconciliationView.tsx`; list has no busy affordance during recompute (BAS-064's busy state is suppress-only); group candidate rows render nothing when the candidate set is empty (no empty-state fallback) — `CandidateList.tsx` / `GroupCandidateRows` (found by reviewer-frontend 2026-08-02; the procedure-scope sibling got its fallback in the bank-born-groups PR).

**Observation:** batch these when the reconciliation UI is next reworked; individually none justifies a PR.

---

## 2026-06-19 — DEBT-005 — Two i18n key sets intentionally exempt from §31 snake_case

**Found by:** the snake_case migration (PR #91 — resolved the `docs/todo.md` "Migrate i18n keys" entry).

**Where:** `src/i18n/locales/{en,fr}/excel-import.json` → `sheet_selection.sheets.{Jan,Fév,…,Déc}` (French Title-case month tokens); `src/i18n/locales/{en,fr}/fund-payment-match.json` → `print.section2.groups.{ContestAmount,CreateProcedure,LinkProcedure,AmountMismatch,FundMismatch,DateMismatch}` (PascalCase wire enum variants).

**Observation:** these leaf segments are NOT snake_case on purpose. They are looked up via runtime interpolation — ``t(`sheet_selection.sheets.${sheet}`)`` (sheet = SHEET_ORDER token) and ``t(`print.section2.groups.${type}`)`` (`reportPresenter.ts`, type = backend enum variant). The key must match the runtime value verbatim, so snake_casing them silently breaks the lookup. A future §31 audit / lint MUST skip these two subtrees; "fixing" them is a regression, not a cleanup. All other key segments are §31-compliant after PR #91.

---

## 2026-05-19 — DEBT-003 — REF-240 enforced at command layer via dual-orchestrator injection

**Found by:** manual (`refactor/fund-payment-manual-management`)

**Where:** `src-tauri/src/use_cases/fund_payment_manual_management/api.rs:28–53` — the `delete_fund_payment_group` Tauri command injects both `FundPaymentManualManagementOrchestrator` and `OverpaymentOrchestrator`. The REF-240 guard (`ensure_not_refund_fund_payment_group`) is enforced at the command boundary rather than inside the manual delete use case. Lifted verbatim from the pre-refactor `context/fund/api.rs`; surfaced more clearly now that the command lives in its dedicated module.

**Observation:** REF-240 is a domain invariant ("a refund-cascade `FundPaymentGroup` cannot be deleted directly — only via the REF-210 cancellation cascade"), so it must hold for any caller of the manual delete path, not only the Tauri command. Today the check requires a cross-context query (`procedure_refund.refund_fund_payment_group_id`) because the `FundPaymentGroup` row itself carries no marker of what created it; that cross-context need is why the rule sits at the command layer with two `State<>` injections. Two consequences: (a) any future caller bypassing the Tauri command (event handler, CLI, integration test) bypasses the rule; (b) the manual orchestrator depends transitively on the overpayment context for what should be a local invariant.

**Surfaced direction:** Add a `source: GroupSource { Manual, Reconciled, Refund }` column on `FundPaymentGroup`, stamped once at creation by whichever flow writes the row (REF-100 = `Refund`; manual orchestrator = `Manual`; reconciliation orchestrator = `Reconciled`). REF-240 then collapses to `if group.source == Refund { reject }` inside `delete_group_with_cleanup`, and the Tauri command shrinks back to one `State<>`. `procedure_refund.refund_fund_payment_group_id` stays as the cascade key for REF-210 — `source` is the guard projection. Prefer enum over boolean (`is_refund: bool`) because: (a) `Manual` vs `Reconciled` is already an implicit workflow distinction we don't model today, (b) the field is creation-time immutable so an enum models it honestly, (c) booleans don't compose if a fourth origin appears. `source` (or `origin`) over `status` — the value is set once and never mutated.

**Migration constraint:** Backfill must be lossless. The Refund half is exact (JOIN against `procedure_refund.refund_fund_payment_group_id`). The Manual vs Reconciled half cannot be reconstructed from a lossy default because future code paths (UI filters, reports, additional invariants) will rely on the distinction. Migration must identify historical Manual vs Reconciled groups precisely — likely by analyzing reconciliation/import provenance signals already present on related rows (e.g. presence of an excel-import or PDF-reconciliation provenance trail). If no signal exists for some legacy rows, the migration design has to surface them for explicit user/operator classification rather than silently bucket them.

**Scope at fix time:** schema migration (add column + lossless backfill), update `FundPaymentGroup` domain factories (`new`/`with_id`/`restore`) to carry `source`, update REF-100, manual create, and reconciliation create paths to stamp the right value, move REF-240 enforcement into `delete_group_with_cleanup`, drop the second `State<>` from `delete_fund_payment_group`, drop the `OverpaymentOrchestrator` dep wiring from the manual delete path. `reviewer-sql` must run on the migration. REF-220 / REF-230 (status-based local guards on procedure deletion) are unaffected — they already are local and need no changes.

---

## 2026-05-16 — DEBT-001 — RTL coverage gap on currency-display components

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

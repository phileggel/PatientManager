# Tech Debt

Observations of code smells, inconsistencies, and brittle patterns — agent-owned (`docs/workflow.md` § 2). Not commitments: an entry becomes work when the owner queues its `DEBT-NNN` in `docs/todo.md` § Next. Ids are permanent and never reused; newest entries first.

---

<!-- entries removed when resolved; this file is otherwise the running observation log -->

## 2026-10-04 — DEBT-029 — `just release` leaves the version in `package-lock.json` behind

**Found by:** `/dep-audit` (`npm audit fix`, branch `chore/dep-audit-lockfile`)

**Where:** `scripts/release.py` (`update_version_files`), `package-lock.json`

**Observation:** The release script writes the new version to `package.json`, `Cargo.toml` and `tauri.conf.json`, not to `package-lock.json`: at tag v0.23.0 the lockfile still says 0.22.1. `npm ci` accepts it; any `npm install` rewrites the two lines as an unrelated diff.

---

## 2026-10-04 — DEBT-028 — `PATIENT_MANAGER_E2E_DB` redirects the database in release builds too

**Found by:** reviewer-security (release-sweep on `main` 9c7f767)

**Where:** `src-tauri/src/shared/infrastructure/db.rs` (`Database::new`)

**Observation:** The environment variable the E2E suite uses to point the app at an ephemeral database is read by every build. Setting it needs control of the user's environment, so the risk is low; a `cfg` or feature gate would remove it from the shipped binary. The E2E build is a debug build, so `debug_assertions` would do.

---

## 2026-10-04 — DEBT-027 — The capability grants more than the screen uses

**Found by:** reviewer-security (release-sweep on `main` 9c7f767)

**Where:** `src-tauri/capabilities/default.json`

**Observation:** `process:default` also grants exit, and `dialog:default` also grants message, ask and confirm; the screen only calls `relaunch`, `open` and `save`. Narrowing to `process:allow-restart`, `dialog:allow-open` and `dialog:allow-save` is a three-line change, but neither the relaunch after a restore nor the native dialogs are exercised by a test (the E2E suite overrides the dialogs, ADR-007): it needs a manual check on an installed build, so it was not done on the eve of a release.

---

## 2026-10-03 — DEBT-026 — E2E suites each carry their own "open a management page" helper

**Found by:** reviewer-e2e (local run, branch `feat/todo-002-patient-duplicates`)

**Where:** `e2e/patient-duplicate/patient-duplicate.test.ts`, `e2e/bank-statement-label/bank-statement-label.test.ts`, `e2e/patient/`, `e2e/fund/`, `e2e/bank-account/`

**Observation:** Opening the management dialog and clicking a card is written again in each suite. One helper in `e2e/helpers/` would replace the copies.

---

## 2026-10-03 — DEBT-025 — Four use-case files name sqlx outside a unit of work

**Found by:** reviewer-arch (CI run on PR #166, branch `feat/todo-011-diagnostic-report`)

**Where:** `src-tauri/src/use_cases/db_backup/orchestrator.rs`, `src-tauri/src/use_cases/bank_manual_match/orchestrator.rs`, `src-tauri/src/use_cases/bank_statement_reconciliation/label_mapping_repo.rs`, `src-tauri/src/use_cases/excel_import/amount_mapping_repo.rs`

**Observation:** B24 forbids sqlx types in a use case outside its `sqlx_uow.rs`. These four predate the check; the two `*_repo.rs` files are whole repositories living in a use case. `just arch-check` does not test B24.

---

## 2026-10-03 — DEBT-024 — Support diagnostics: the encrypted bundle and the upload are not built

**Found by:** manual (TODO-011 closure, branch `feat/todo-011-diagnostic-report`)

**Where:** `src-tauri/src/use_cases/diagnostic_report/`, `docs/spec/diagnostic-report.md`

**Observation:** TODO-011 shipped its first tier only: a report with no patient data that the user saves and sends. Its entry also described a second tier, left out of its Done when and removed with it: a support bundle (logs plus a database snapshot) encrypted to the maintainer's public key, so only the maintainer can read it, sent through an upload-only file-drop link rather than an endpoint embedded in the app (which would invite abuse and a storage bill). It needs a consent prompt before the database is included, a retention rule and a privacy note (health data). A one-click upload of the first-tier report to a maintainer-run service was the other option not taken. Both are the owner's to decide and queue.

---

## 2026-10-03 — DEBT-023 — Two use cases import another use case

**Found by:** reviewer-arch (CI run on PR #164, branch `refactor/todo-017-unit-of-work`)

**Where:** `src-tauri/src/use_cases/excel_import/orchestrator.rs` (imports `procedure_orchestration::ProcedureOrchestrationService`), `src-tauri/src/use_cases/fund_payment_manual_management/api.rs` (injects `overpayment::OverpaymentOrchestrator`; see DEBT-003)

**Observation:** B18 forbids a use case importing another use case. These two imports predate the check and were read as a precedent during TODO-017's local review, which let the same violation through until CI caught it. `just arch-check` does not test B18.

---

## 2026-10-03 — DEBT-019 — WebdriverIO pulls three advisories that have no patched release

**Found by:** `/dep-audit` (npm audit, branch `chore/dep-audit-blockers`)

**Where:** `package-lock.json` — `basic-ftp`, `braces`, `extract-zip` under `@wdio/*` 9.32

**Observation:** `npm audit` still reports 19 high advisories, all through these three packages, which the E2E tooling pulls and none of which ships in the app (`npm audit --omit=dev`, the weekly Security Audit gate, is clean). `braces` and `extract-zip` have no patched release; `basic-ftp` is pinned by `get-uri`. The only fix npm offers is a downgrade to WebdriverIO 5. Re-check when WebdriverIO 10 is stable.

---

## 2026-09-28 — DEBT-018 — Specs, contracts and ADRs never checked against the code

**Found by:** manual (TODO-015 closure, branch `docs/todo-015-skills`)

**Where:** `docs/spec/`, `docs/contracts/`, `docs/adr/`

**Observation:** the documentation audit fixed where each kind of document lives, removed duplicated rules and made the agent docs concise; it did not check the 33 specs, contracts and ADRs against the code they describe. `spec-checker` covers one spec at a time when an entry closes; no pass has run across all of them, so a rule or command that drifted since it was written goes unnoticed until someone relies on it.

---

## 2026-09-27 — DEBT-015 — Fork PRs cannot post the reviewer's "no report" comment

**Found by:** reviewer-infra (CI run on PR #121, branch `ci/reviewers-in-ci`)

**Where:** `.github/workflows/review.yml`, step "Post the report and fail on criticals"

**Observation:** a fork PR gets a read-only `GITHUB_TOKEN`, so the `gh` calls that post the sticky comment error out. The job has already failed closed at "Require the subscription token" (forks get no secrets), so nothing passes unreviewed; only the explanatory comment is missing, and the step ends on a raw `gh` error instead of a stated reason.

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

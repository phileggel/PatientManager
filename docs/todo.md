# TODO

---

## (frontend) — Fix OxLint warnings (38 pre-existing)

OxLint exits 0 on warnings so CI passes, but 38 warnings exist across the codebase. Main categories:

- `no-array-sort` / `no-array-reverse`: replace `.sort()` / `.reverse()` with `.toSorted()` / `.toReversed()` (immutable equivalents) — ~25 occurrences across sort hooks, presenters, utils
- `consistent-function-scoping`: move helper functions that don't capture parent scope to module level — ~8 occurrences
- `no-shadow`: rename short variable names (`p`, `t`, `error`, `label`) that shadow outer scope — ~5 occurrences
- `no-console` in `wdio.conf.ts`: intentional driver error logging, add oxlint-disable comments

---

## (backend+frontend/bank-statement) — Align PDF reading pattern with fund reconciliation

Fund reconciliation passes a file path to Rust (`extract_pdf_text(filePath)`) and lets the backend read the file. Bank statement does the opposite: frontend reads bytes via `@tauri-apps/plugin-fs` then sends them to `parse_bank_statement(bytes)`. Both should follow the same path-based pattern.

Fix: add a `parse_bank_statement_from_path(file_path: String)` Rust command (or change the existing one), update `parseBankStatement` in `bank-statement/gateway.ts` to pass the path directly, and remove the `readFile` import.

---

## (frontend) — Audit isMountedRef usage across all hooks

React 19 makes setState after unmount a silent no-op, so `isMountedRef` guards in user-action callbacks (not effects) are dead code. Search for `isMountedRef` and `isMounted` patterns across all hooks and remove guards that are no longer needed. Keep local `let isMounted` guards inside effects (those guard against StrictMode double-invocation, which is a different problem).

---

## (frontend/bank-statement-match) — Translate raw backend error strings in error step

The error step in `BankStatementModal` displays `error` directly, which can be a raw backend string (e.g. from a generic catch in `useBankStatementModal`). Only `NO_VIR_SEPA_LINES` is explicitly translated. Audit all `setError(msg)` call sites and either map known error codes to i18n keys or add a generic fallback translation so users never see raw technical strings.

---

## (frontend/bank-statement-match) — Inline bank account creation when IBAN is not found

When `resolveBankAccountFromIban` returns no account, the modal currently shows a dead-end "no account" screen. Instead, show an inline form with the IBAN pre-filled (read-only) and a name field the user must fill in. On submit, create the account and continue the import flow automatically (proceed to label-mapping step).

---

## (e2e) — Force English locale during E2E tests so aria-labels are invariant

E2E tests rely on aria-labels for element selection. If the app locale is not fixed, labels may vary by system language and cause flaky test failures. Force the app to run in English during E2E runs so aria-labels are always predictable.

Options to explore:

- Pass a `LANG=en` / `LC_ALL=en_US.UTF-8` env var when launching the Tauri app in WebDriver
- Set a `test_locale` config flag in `tauri.conf.json` or a test-only config profile
- Initialize the i18n layer with `en` unconditionally when a `TEST_LOCALE` env var is present

---

## (frontend/bank-account) — Surface CashAccountProtected error and disable actions on cash account row

The backend enforces `CashAccountProtected` on `update_bank_account` and `delete_bank_account`, but the bank account list has no UI guard: the cash account row shows the same edit/delete actions as any other account. Two improvements needed:

- Fetch the cash account ID on mount (via `getCashBankAccountId`) and disable the edit/delete buttons for that row.
- If the error does reach the backend (e.g. via a future API path), surface a specific "Cash account cannot be modified" message instead of a generic error toast.

---

## (frontend) — Add shared test data factories

Tests construct domain objects inline (`{ id: "1", name: "...", ssn: "..." }`) in many places. Add factories with helpers like `makePatient()`, `makeProcedure()`, `makeFund()`, etc. with sensible defaults and optional overrides. Single place to update when the domain model changes.

Note: `src/tests/patient.factory.ts` already exists (used in `useProcedureFormModal.test.ts`). Extend that pattern to the other domains rather than creating a new file.

---

## (backend/procedure) — Review procedure projections and read models

`UnreconciledProcedure` is a domain projection introduced when moving `ProcedureRepository` to the domain layer. It sits alongside `Procedure` (the aggregate root) and other procedure-related structures. Before adding more projections, review whether these are genuinely distinct domain concepts or whether `Procedure` should be enriched to cover these cases. Key question: is `UnreconciledProcedure` a real ubiquitous-language concept, or just a query convenience that should be folded into `Procedure` with a different fetch strategy?

---

## DDD Convergence — Major refactors (structural, plan carefully)

- **Folder restructure**: migrate all bounded contexts to per-aggregate sub-folders per B0/B0d (`context/{domain}/{aggregate}/domain.rs`, `repository.rs`, `service.rs`)
- **Extract aggregate root methods on `Procedure`**: `reconcile()`, `unreconcile()`, `dispute()`, `record_payment()`, `revert_payment()`, `clear_payment()`, `correct_billed_amount()`, `correct_fund()`, `correct_date()` — currently all direct field mutations in orchestrators
- **Extract aggregate root methods on `Patient`**: `correct_ssn()`
- **Extract aggregate root methods on `FundPaymentGroup`**: `confirm_bank_payment()`, `revert_bank_payment()`, `update()`
- **Introduce `FundPayment` aggregate root**: currently missing — `FundPaymentGroup` is incorrectly the top-level object; `FundPayment` is the monthly document wrapping all groups
- **Implement UoW pattern**: `core/uow.rs` per ADR-003 — needed for atomic cross-aggregate writes in reconciliation

---

## (backend/frontend) — Specta: convert domain objects to camelCase at the boundary

Convert domain objects to camelCase when crossing into the frontend.

---

## (backend/fund) — Tech Debt: fund/patient creation in reconciliation feature

- Currently fund/patient records are created automatically during fund-payment reconciliation.
- Is this expected?
- What's the right solution?

---

## (backend/test) — Refactor fund-payment-reconciliation orchestrator tests to use mocks

`use_cases/fund_payment_reconciliation/orchestrator.rs` (line 1263) has a test module that spins up real SQLite. Per the unit-test rule (unit test = mock, no real DB), these should be refactored to use mock repositories. The real-SQLite path belongs in an integration test file under `tests/`.

---

## (backend/procedure) — Migrate Procedure date fields from String to NaiveDate

`parse_iso_date_to_naive_date` in `fund_payment_reconciliation/parsing/dates.rs` is explicitly marked temporary (line 13): it exists only because `Procedure` stores dates as `String` instead of `NaiveDate`. Once the domain model is migrated, this helper and all call sites should be removed.

---

## (backend) — Tech Debt: Audit api.rs files for logic leakage

All `api.rs` files (Tauri command handlers) should be thin adapters only: receive input, call service/orchestrator, return result. No business logic, validation, or branching beyond error mapping.

Files to audit: `context/bank/api.rs`, `context/fund/api.rs`, `context/patient/api.rs`, `context/procedure/api.rs`, `use_cases/bank_manual_match/api.rs`, `use_cases/bank_statement_reconciliation/api.rs`, `use_cases/excel_import/api.rs`, `use_cases/fund_payment_reconciliation/api.rs`, `use_cases/overpayment/api.rs`, `use_cases/procedure_orchestration/api.rs`, `use_cases/db_backup/api.rs`.

---

## (backend/fund) — DECISION: Move cross-context `is_locked` recomputation out of `context/fund/api.rs`

`context/fund/api.rs` imports `context/procedure` directly (`ProcedureService`, `Procedure`, `ProcedureStatus`) to recompute `is_locked` on fund payment groups. This violates B13 (no cross-context imports). The fix requires an architectural decision:

- **Option A**: Move the `recompute_is_locked` logic into a new or existing use-case (e.g. `use_cases/fund_payment_reconciliation/`) and inject the use-case orchestrator as Tauri state instead of the raw procedure service.
- **Option B**: Enrich `FundPaymentGroup` to carry enough state to derive `is_locked` without querying procedures (if the procedure data is already available at write time).

Related: `fund/api.rs` also constructs `FundPaymentReconciliationOrchestrator::new(...)` inline in three command handlers instead of injecting it as Tauri state — fix in the same pass.

---

## (backend) — Tech Debt: Event emission reduction — Steps 3 & 4

- Step 3: Batch patient/fund creation during reconciliation (instead of N individual creations)
- Step 4: Batch group creation events

---

## (backend/frontend) — Structured errors: replace anyhow/String with typed error variants

Tauri commands currently return `Result<T, String>` (via `anyhow` formatted with `{:#}`). Replace with a typed error enum per domain, serialized via Specta, so the frontend can pattern-match on error codes instead of parsing strings. Scope: define error enums in each bounded context, expose via Specta, update gateway.ts to switch on error type.

---

## (frontend/procedure) — Fix "received / pending" always showing 0

`actualPaymentAmount` is computed in SummaryStats; `awaitedAmount` is computed on the frontend (`procedureAmount - actualPaymentAmount`). To verify in prod.

---

## (frontend/fund-payment-match) — Reconciliation page: verify 10 MB file size limit

Verify why the displayed limit is 10 MB.

---

## (frontend/fund-payment-match) — Back-then-forward shortcut

When the user goes back to the previous step, advance directly to the next one (reconciliation flow).

---

## (frontend/fund-payment) — Date range in list

In the list, replace "date" with start date (oldest procedure) and end date (latest procedure).

---

## (frontend/procedure) — Default patient info when procedure type is deleted

When showing default patient info (`latest_procedure_type`), the referenced procedure type may have been deleted. Document this case in the procedure-creation spec and handle it on the frontend (degraded display or fallback).

---

## (frontend/fund-payment-match) — Create multiple procedures during auto-correction

Currently, the auto-correction flow only allows creating a single procedure. It should support creating multiple procedures in the same operation.

---

## F10 — Extract logic to dedicated hooks (procedure feature)

Multiple F10 violations in the procedure feature: business logic (state, memos, callbacks) lives directly in component files instead of colocated hook files. Deferred — large architectural refactors with no functional impact.

---

## (backend/test) — Migrate hand-rolled mock impls to mockall automock

`bank_statement_reconciliation/orchestrator.rs`, `overpayment/orchestrator.rs`, and `procedure_orchestration/service.rs` still contain large hand-rolled full-trait mock structs (`ProcRepoNoop`, `ProcRepoForSuccess`, `BankEntryRepoUnimplemented`, etc.) despite those traits now carrying `#[cfg_attr(test, mockall::automock)]`. Every new method on any of those traits silently requires updating all manual impls. Replace with `MockXxx::new()` + `.expect_*()` per-test configuration throughout.

---

## (backend/test) — Remove dead hand-rolled MockProcedureTypeRepository and MockFundRepository

`procedure/service.rs` has a hand-rolled `MockProcedureTypeRepository` struct (lines ~332–435) that shadows the automock-generated `MockProcedureTypeRepository` from `crate::context::procedure`. The pre-existing tests still use the manual one. `fund/service.rs` has the same problem with `MockFundRepository` (an `as AutoMockFundRepository` alias workaround exists). Migrate both to the generated mocks and remove the hand-rolled structs.

---

## (backend/test) — Remove or strengthen trivial B25-violating tests

Several tests added in the coverage push assert nothing domain-meaningful:

- `fund_new_success`, `fund_with_id_preserves_id`, `fund_payment_line_with_id_preserves_id` (fund/domain.rs) — getter-returns-what-was-passed-in
- `create_batch_groups_empty_returns_empty` (fund/repository.rs) — empty-in empty-out
- `publish_batch_events_does_not_panic` (bank_statement_reconciliation/orchestrator.rs) — does-not-panic
- `procedure_service_read_all_returns_empty`, `procedure_service_read_procedure_not_found` (procedure/service.rs) — mock echo

Delete or replace each with a test that exercises a real domain invariant or error-propagation path.

---

## (backend/arch) — Introduce a DI container for orchestrator wiring

Production orchestrators are currently wired manually in `lib.rs` via explicit `Arc<dyn Trait>` constructor injection. This works but doesn't scale well as the number of dependencies grows: adding a dep means touching `lib.rs`, the orchestrator `new()`, and every integration test `Ctx`. A DI container (e.g. `shaku`) would centralize registration and resolve dependencies automatically, reducing wiring boilerplate and making the `new()` signature irrelevant to callers. Evaluate once the orchestrator count or dep count becomes a maintenance burden.

---

## (backend/fund-payment-reconciliation) — Hardcoded French strings in CSV export

`csv_exporter.rs` hardcodes French strings. The CSV export is French-locale by design today. If bilingual exports are ever needed, route these strings through a backend translation layer or pass localized labels in from the caller.

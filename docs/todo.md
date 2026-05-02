# TODO

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

## (backend) — Tech Debt: Audit api.rs files for logic leakage

All `api.rs` files (Tauri command handlers) should be thin adapters only: receive input, call service/orchestrator, return result. No business logic, validation, or branching beyond error mapping.

Files to audit: `context/bank/api.rs`, `context/fund/api.rs`, `context/patient/api.rs`, `context/procedure/api.rs`, `use_cases/bank_manual_match/api.rs`, `use_cases/bank_statement_reconciliation/api.rs`, `use_cases/excel_import/api.rs`, `use_cases/fund_payment_reconciliation/api.rs`, `use_cases/overpayment/api.rs`, `use_cases/procedure_orchestration/api.rs`, `use_cases/db_backup/api.rs`.

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

## (frontend/fund-payment-match) — Print report: centering and auto-correction list

The printed report is not properly centered — part of the content is cut off. Complementary improvement: list the auto-corrections applied in the report.

---

## F10 — Extract logic to dedicated hooks (procedure feature)

Multiple F10 violations in the procedure feature: business logic (state, memos, callbacks) lives directly in component files instead of colocated hook files. Deferred — large architectural refactors with no functional impact.

---

## (backend/fund-payment-reconciliation) — Hardcoded French strings in CSV export

`csv_exporter.rs` hardcodes French strings. The CSV export is French-locale by design today. If bilingual exports are ever needed, route these strings through a backend translation layer or pass localized labels in from the caller.

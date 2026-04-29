# TODO

---

## (frontend/fund-payment-match) — Remove ReconciliationPage landing screen

`ReconciliationPage` is a full page with only an icon, a title, and a single "Select PDF" button. The entire workflow lives inside `ReconciliationModal`. The landing page adds no value.

Fix: trigger `fileInputRef.current.click()` on mount via `useEffect`. The page becomes just a hidden `<input>` + `ReconciliationModal`. Decide what happens on cancel (file picker dismissed with no selection): navigate back to dashboard, or stay on a blank page.

## (frontend/bank-statement-match) — Remove BankStatementPage landing screen

Same pattern as `ReconciliationPage`: `BankStatementPage` is a full page with icon + title + description + single "Select PDF" button. All workflow is inside `BankStatementModal`.

Fix: same as above — trigger file picker on mount, page becomes hidden `<input>` + modal. Handle cancel consistently with the fund-payment-match fix.

## (frontend/excel-import) — Remove ImportExcelPage file upload landing step

`ImportExcelPage` starts with a `FileUploadSection` landing UI (icon + button) before the multi-step wizard. Unlike the other two, the subsequent steps (month selection, type mapping, progress, result) still render in-page, so the page itself must stay.

Fix: trigger the file picker on mount, remove the `FileUploadSection` landing UI. The page opens directly at the parsing step once a file is selected. Handle cancel (no file selected) by navigating back to dashboard or showing a minimal empty state.

---

## (frontend) — Move toastService mock to test-setup.ts

`toastService` is mocked inline in every test file that triggers a toast. Move the mock to `src/lib/test-setup.ts` so it applies globally — no per-file duplication.

## (frontend) — Add shared test data factories

Tests construct domain objects inline (`{ id: "1", name: "...", ssn: "..." }`) in many places. Add `src/test/factories.ts` with helpers like `makePatient()`, `makeProcedure()`, `makeFund()`, etc. with sensible defaults and optional overrides. Single place to update when the domain model changes.

---

## (backend) — Add mockall for service-layer unit tests

Currently all backend tests hit a real SQLite DB. Add `mockall` as a dev-dependency so service-layer logic can be unit-tested with mock repositories (the existing trait-based `Arc<dyn Repository>` pattern makes this straightforward). Integration tests under `tests/` keep hitting the real DB — mockall only targets service/use-case unit tests where spinning up a DB is unnecessary overhead.

---

## (all domains) — Retroactive domain contracts

Create `docs/contracts/{domain}-contract.md` for all shipped features. Contracts define the frontend/backend surface: Tauri commands, their parameters, return types, and error variants. They are the co-decision point between test coverage and command definitions — useful when extending a feature or running `contract-reviewer` / `test-writer-*` in future workflows.

Domains to cover (one contract per bounded context / use-case surface):

- `bank-account`
- `bank-statement-auto-match`
- `bank-statement-manual-match`
- `db-backup`
- `excel-import`
- `fund-payment-auto-match`
- `fund-payment-manual-match`
- `overpayment`
- `procedure-orchestration`
- `procedure-type`
- `theme`

Run `/contract` for each domain (reads the Tauri commands and bindings.ts, not the spec). No implementation changes required.

---

## DDD Convergence — Quick renames ✅ done

## DDD Convergence — Major refactors (structural, plan carefully)

- **Folder restructure**: migrate all bounded contexts to per-aggregate sub-folders per B0/B0d (`context/{domain}/{aggregate}/domain.rs`, `repository.rs`, `service.rs`)
- **Extract aggregate root methods on `Procedure`**: `reconcile()`, `unreconcile()`, `dispute()`, `record_payment()`, `revert_payment()`, `clear_payment()`, `correct_billed_amount()`, `correct_fund()`, `correct_date()` — currently all direct field mutations in orchestrators
- **Extract aggregate root methods on `Patient`**: `correct_ssn()`
- **Extract aggregate root methods on `FundPaymentGroup`**: `confirm_bank_payment()`, `revert_bank_payment()`, `update()`
- **Introduce `FundPayment` aggregate root**: currently missing — `FundPaymentGroup` is incorrectly the top-level object; `FundPayment` is the monthly document wrapping all groups
- **Implement UoW pattern**: `core/uow.rs` per ADR-003 — needed for atomic cross-aggregate writes in reconciliation

---

## (backend/frontend) — Specta

Convert domain objects to camelCase when crossing into the frontend.

## (backend/fund) — Tech Debt: fund/patient creation in reconciliation feature

- Currently fund/patient records are created automatically during fund-payment reconciliation.
- Is this expected?
- What's the right solution?

## (frontend/procedure) — Procedure page

- fix: "received / pending" always equal to 0 (??) → to verify in prod: `actualPaymentAmount` is computed in SummaryStats, `awaitedAmount` computed on the frontend (procedureAmount - actualPaymentAmount)

## (frontend/fund-payment-match) — Reconciliation page

- Verify the displayed limit (10 MB — why?).

## (frontend/fund-payment) — F7 violation: window.dispatchEvent in AddFundPaymentPanel

`AddFundPaymentPanel.tsx:55` emits `window.dispatchEvent(new Event("fundpaymentgroup_updated"))` after a successful group creation. This violates F7 — components must not emit window events; those are emitted by the backend. The backend already publishes `FundPaymentGroupUpdated` which `useAppInit` listens to. Remove the manual dispatch.

## (backend) — Tech debt: Event emission reduction — Steps 3 & 4

From the previous multi-session work (noted in memory):

- Step 3: Batch patient/fund creation during reconciliation (instead of N individual creations)
- Step 4: Batch group creation events

## (frontend/fund-payment-match) — Back-then-forward shortcut

When the user goes back to the previous step, advance directly to the next one (reconciliation flow).

## (frontend/fund-payment) — Date range in list

In the list, replace "date" with start date (oldest procedure) and end date (latest procedure)

## (frontend/procedure) — Default patient info when procedure type is deleted

When showing default patient info (latest_procedure_type), the referenced procedure type may have been deleted. The `procedure-type.md` spec does not cover this case: document it in the procedure-creation spec and handle it on the frontend (degraded display or fallback).

## F10 — Extract logic to dedicated hooks (procedure feature)

The reviewer flagged multiple F10 violations in the procedure feature: business logic (state, memos, callbacks) lives directly in component files instead of colocated hook files. These are deferred because they are large architectural refactors with no functional impact.

## (frontend/fund-payment-match) — Create multiple procedures during auto-correction

Currently, the auto-correction flow (reconciliation) only allows creating a single procedure. It should support creating multiple procedures in the same operation.

## (frontend/fund-payment-match) — Print report after reconciliation: centering and content

The document printed after reconciliation is not properly centered — part of the content is cut off. To fix. Complementary improvement: list the auto-corrections applied in the report.

## (backend/frontend) — Structured errors: replace anyhow/String with typed error variants

Tauri commands currently return `Result<T, String>` (via `anyhow` formatted with `{:#}`). Replace with a typed error enum per domain, serialized via Specta, so the frontend can pattern-match on error codes instead of parsing strings. Scope: define error enums in each bounded context, expose via Specta, update gateway.ts to switch on error type.

## (frontend/excel-import) — Trigger import directly from the button

The import button should open the file picker directly, without navigating to a dedicated page that contains a single button. Remove the intermediate page or integrate the file picker into the existing navigation.

## (backend/fund-payment-reconciliation) — Hardcoded French strings in CSV export

`use_cases/fund_payment_reconciliation/output/csv_exporter.rs` hardcodes French strings (e.g. `"Procédure non trouvée en base de données"`, `"Caisse différente"`, `"Montant différent"`, `"Date différente"`). The CSV export is French-locale by design today. If bilingual exports are ever needed, route these strings through a backend translation layer or pass localized labels in from the caller.

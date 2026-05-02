# TODO

---

## — Review pending items in domain contracts ✅ done

Bank account gaps fixed (2026-05-02): `read_bank_account` now raises `NotFound`, `CashAccountProtected` enforced on update/delete. Contract renamed to `bank-contract.md`.

---

## (frontend/bank-account) — Surface CashAccountProtected error and disable actions on cash account row

The backend now enforces `CashAccountProtected` on `update_bank_account` and `delete_bank_account`, but the bank account list has no UI guard: the cash account row shows the same edit/delete actions as any other account. Two improvements needed:

- Fetch the cash account ID on mount (via `getCashBankAccountId`) and disable the edit/delete buttons for that row.
- If the error does reach the backend (e.g. via a future API path), surface a specific "Cash account cannot be modified" message instead of a generic error toast.

---

## (frontend) — Add shared test data factories

Tests construct domain objects inline (`{ id: "1", name: "...", ssn: "..." }`) in many places. Add factories with helpers like `makePatient()`, `makeProcedure()`, `makeFund()`, etc. with sensible defaults and optional overrides. Single place to update when the domain model changes.

Note: `src/tests/patient.factory.ts` already exists (used in `useProcedureFormModal.test.ts`). Extend that pattern to the other domains rather than creating a new file.

---

## (backend) — Add mockall for service-layer unit tests

Currently all backend tests hit a real SQLite DB. Add `mockall` as a dev-dependency so service-layer logic can be unit-tested with mock repositories (the existing trait-based `Arc<dyn Repository>` pattern makes this straightforward). Integration tests under `tests/` keep hitting the real DB — mockall only targets service/use-case unit tests where spinning up a DB is unnecessary overhead.

---

## DDD Convergence — Quick renames ✅ done

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

## (backend/fund-payment-reconciliation) — Hardcoded French strings in CSV export

`use_cases/fund_payment_reconciliation/output/csv_exporter.rs` hardcodes French strings (e.g. `"Procédure non trouvée en base de données"`, `"Caisse différente"`, `"Montant différent"`, `"Date différente"`). The CSV export is French-locale by design today. If bilingual exports are ever needed, route these strings through a backend translation layer or pass localized labels in from the caller.

# TODO

## (backend/frontend) — Specta

Convert domain objects to camelCase when crossing into the frontend.

## (frontend/fund-payment) — confirmed_payment_date

Normally the payment confirmation date should not be updated by this operation (it should wait for the bank-transfer).

## (backend/fund) — Tech Debt: fund/patient creation in reconciliation feature

- Currently fund/patient records are created automatically during fund-payment reconciliation.
- Is this expected?
- What's the right solution?

## (backend/fund) — Tech debt: purpose of FundPaymentLine as domain object

## (frontend/procedure) — Procedure page

- fix: "received / pending" always equal to 0 (??) → to verify in prod: `actualPaymentAmount` is computed in SummaryStats, `awaitedAmount` computed on the frontend (procedureAmount - actualPaymentAmount)

## (frontend/fund-payment-match) — Reconciliation page

- Remove the duplicated text under the title.
- Verify the displayed limit (10 MB — why?).

## (frontend) — Tech debt: showSnackbar deprecated

8 components still use the backward-compat showSnackbar shim instead of toastService.show()
directly. Should be migrated at some point.

## (backend) — Tech debt: Event emission reduction — Steps 3 & 4

From the previous multi-session work (noted in memory):

- Step 3: Batch patient/fund creation during reconciliation (instead of N individual creations)
- Step 4: Batch group creation events

## (frontend/fund-payment-match) — Back-then-forward shortcut

When the user goes back to the previous step, advance directly to the next one (reconciliation flow).

## (backend/excel-import) — Reduce excel-import logs

## (frontend/fund-payment) — Date range in list

In the list, replace "date" with start date (oldest procedure) and end date (latest procedure)

## (backend/fund-payment-reconciliation) — Perf: halve DB calls in duplicate candidate check

In `orchestrator.rs`, `is_duplicate_candidate` is called twice per candidate in both `create_multiple_from_candidates` and `create_multiple_with_auto_corrections` (once to count duplicates, once to filter them). Each call hits the DB.

Fix: collect results into a `Vec<bool>` in the first pass and reuse in the filter pass.

## (backend/fund-payment-reconciliation) — Perf: batch procedure reset on group delete

In `delete_fund_payment_group_with_cleanup`, procedures are reset one by one (`read_procedure` + `update_procedure` per ID, N+N DB round-trips).

Fix: use `read_procedures_by_ids` → mutate in-memory → `update_procedures_batch`. Requires verifying `ProcedureService` exposes a batch update at the service layer.

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

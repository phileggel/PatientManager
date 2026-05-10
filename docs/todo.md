# TODO

---

## (frontend/ui) — Split BankStatementModal step components

`BankStatementModal.tsx` contains 7 conditional `step === "..."` blocks (loading, matching, create-account, label-mapping, results, done, error). The create-account step now has form state, validation, error display — non-trivial. Extract step components (e.g. `CreateAccountStep`, `DoneStep`, `ErrorStep`) once another step gains comparable logic, or if the modal grows past ~200 lines. Pure refactor — defer until there's a second non-trivial step or the file becomes unwieldy.

---

## (frontend/db-index) — IBAN uniqueness DB constraint follow-up

`bank-account` R5 (IBAN uniqueness across soft-deleted accounts) is enforced at the service layer (`BankAccountService::create_account` + `update_account` + `find_by_iban_including_deleted`). The existing partial unique index `idx_bank_account_iban_active` covers active rows only. Reconsider whether a DB-level CHECK / trigger / non-partial unique index would be preferable once SQLite version is upgraded — would close the (currently negligible) TOCTOU window between the service-layer guard and the INSERT.

---

## (backend+frontend) — Add fund_reconciliation_date to Procedure

`confirmed_payment_date` is the bank-transfer date (Stage 2). A separate `fund_reconciliation_date` column is needed to record the fund-document payment date set at Stage 1 (fund reconciliation). Scope: SQLite migration, Rust domain + repository, Specta bindings regeneration, frontend display in procedure list and dashboard.

---

## (frontend/dev) — WebKit2GTK iframe-PDF caveat (Linux dev only)

PDFs embedded in iframes do not render under WebKit2GTK on Linux. Developers running the Tauri dev build on Linux will see a blank iframe in `ReportPreviewModal` even when the backend successfully generated valid PDF bytes. Production target is **NSIS / Windows** (verified in `tauri.conf.json` `"targets": "nsis"`), where Edge WebView2 renders the PDF natively. Document this in the dev README on next touch.

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

## (frontend/fund-payment-match) — Reconciliation page: verify 10 MB file size limit

Verify why the displayed limit is 10 MB.

---

## (frontend/fund-payment-match) — Back-then-forward shortcut

When the user goes back to the previous step, advance directly to the next one (reconciliation flow).

---

## (frontend/fund-payment) — Date range in list

In the list, replace "date" with start date (oldest procedure) and end date (latest procedure).

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

## (backend/arch) — Introduce a DI container for orchestrator wiring

Production orchestrators are currently wired manually in `lib.rs` via explicit `Arc<dyn Trait>` constructor injection. This works but doesn't scale well as the number of dependencies grows: adding a dep means touching `lib.rs`, the orchestrator `new()`, and every integration test `Ctx`. A DI container (e.g. `shaku`) would centralize registration and resolve dependencies automatically, reducing wiring boilerplate and making the `new()` signature irrelevant to callers. Evaluate once the orchestrator count or dep count becomes a maintenance burden.

---

## (backend/fund-payment-reconciliation) — Hardcoded French strings in CSV export

`csv_exporter.rs` hardcodes French strings. The CSV export is French-locale by design today. If bilingual exports are ever needed, route these strings through a backend translation layer or pass localized labels in from the caller.

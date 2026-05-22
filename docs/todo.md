# TODO

---

## (ci) — Windows E2E at the release gate

Linux E2E (CI via `.github/workflows/e2e.yml`) covers ~95% of regressions but doesn't validate the Windows binary that ships. A proper Windows E2E job gating `release-windows.yml` is the missing release-time safety net.

Scope:

- Make `wdio.conf.ts` platform-aware (Linux WebKitGTK driver vs Windows WebView2/EdgeDriver).
- Add a job (or pre-step) in `release-windows.yml` that builds the MSVC binary, then runs the WDIO suite against it.
- Sequence: E2E gates the Windows bundle/draft-release step — no half-baked artifact on broken code.
- Watch out for Windows runner flakiness; may need retry logic.

Cost: probably half a day of setup + ongoing maintenance burden. Defer until release cadence makes the gap actively painful.

---

## (frontend+backend/data-quality) — Patient deduplication assistant

The excel-import dedup rule (EXI-080) is intentionally permissive: an empty-SSN row reuses a same-name DB patient (SSN-bearing first, blank-SSN otherwise) to avoid stacking duplicates on re-imports. Two real-world risks remain: (a) two genuinely different patients sharing the same name will be merged the first time, and (b) when SSN is added manually to an existing patient between two imports, a future blank-SSN row still merges instead of staying separate. A UI assistant should surface candidate duplicates (same name, overlapping procedure history, etc.), let the user confirm pair-by-pair, and merge — preserving procedure attachments under the surviving patient. Priority: low.

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

## (backend/procedure) — Review procedure projections and read models

`UnreconciledProcedure` is a domain projection introduced when moving `ProcedureRepository` to the domain layer. It sits alongside `Procedure` (the aggregate root) and other procedure-related structures. Before adding more projections, review whether these are genuinely distinct domain concepts or whether `Procedure` should be enriched to cover these cases. Key question: is `UnreconciledProcedure` a real ubiquitous-language concept, or just a query convenience that should be folded into `Procedure` with a different fetch strategy?

---

## (backend+frontend/naming) — Align `Procedure` amount field names with UL canonical

`docs/ubiquitous-language.md:91-96` declares `billed_amount` and `paid_amount` as the canonical UL terms, and the middle of the stack (BE domain `Procedure`, contract, Specta bindings) already uses them. Both ends still carry the legacy names:

- **SQL columns + repo row structs** — `procedure_amount` / `actual_payment_amount` in `migrations/20260308_init.sql:57,60` and the `ProcedureRow` / `ProcedureWithSSNRow` sqlx structs in `src-tauri/src/context/procedure/repository/procedure.rs`. The boundary rename happens today inside `restore()` (line 103) and on every INSERT/UPDATE (lines 176, 302).
- **FE row view-model** — `procedureAmount` / `actualPaymentAmount` in `src/features/procedure/model/procedure-row.types.ts`. Mapper renames back from the wire at `procedure-row.mapper.ts:49,64`.

Scope: SQLite migration renaming both columns (`ALTER COLUMN … RENAME TO …`) with backfill safety check; regenerate sqlx offline cache; rename the repo row structs and drop the in-`restore()` rename; rename `ProcedureRow` fields + every consumer (mapper, table cell, edit modal, aggregations, factory, RTL tests); update `docs/ubiquitous-language.md:95-96` to remove the discrepancy callout. Ship as one PR — splitting would leave the codebase half-renamed.

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

## (backend/procedure) — Migrate Procedure date fields from String to NaiveDate

`parse_iso_date_to_naive_date` in `fund_payment_reconciliation/parsing/dates.rs` is explicitly marked temporary (line 13): it exists only because `Procedure` stores dates as `String` instead of `NaiveDate`. Once the domain model is migrated, this helper and all call sites should be removed.

---

## (backend) — Tech Debt: Event emission reduction — Steps 3 & 4

- Step 3: Batch patient/fund creation during reconciliation (instead of N individual creations)
- Step 4: Batch group creation events

---

## (backend/frontend) — Structured errors: replace anyhow/String with typed error variants

Tauri commands currently return `Result<T, String>` (via `anyhow` formatted with `{:#}`). Replace with a typed error enum per domain, serialized via Specta, so the frontend can pattern-match on error codes instead of parsing strings. Scope: define error enums in each bounded context, expose via Specta, update gateway.ts to switch on error type.

---

## (frontend/fund-payment-match) — Back-then-forward shortcut

When the user goes back to the previous step, advance directly to the next one (reconciliation flow).

---

## (frontend/fund-payment-match) — Create multiple procedures during auto-correction

Currently, the auto-correction flow only allows creating a single procedure. It should support creating multiple procedures in the same operation.

---

## F10 — Extract logic to dedicated hooks (procedure feature)

Multiple F10 violations in the procedure feature: business logic (state, memos, callbacks) lives directly in component files instead of colocated hook files. Deferred — large architectural refactors with no functional impact.

---

## (backend/arch) — Introduce a DI container for orchestrator wiring

Production orchestrators are currently wired manually in `lib.rs` via explicit `Arc<dyn Trait>` constructor injection. This works but doesn't scale well as the number of dependencies grows: adding a dep means touching `lib.rs`, the orchestrator `new()`, and every integration test `Ctx`. A DI container (e.g. `shaku`) would centralize registration and resolve dependencies automatically, reducing wiring boilerplate and making the `new()` signature irrelevant to callers. Evaluate once the orchestrator count or dep count becomes a maintenance burden.

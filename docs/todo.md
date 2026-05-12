# TODO

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

## (backend/procedure) — Migrate Procedure date fields from String to NaiveDate

`parse_iso_date_to_naive_date` in `fund_payment_reconciliation/parsing/dates.rs` is explicitly marked temporary (line 13): it exists only because `Procedure` stores dates as `String` instead of `NaiveDate`. Once the domain model is migrated, this helper and all call sites should be removed.

---

## (backend) — API boundary cleanup — concrete findings (audit 2026-05-12)

All `api.rs` files should be thin adapters: receive input, call service/orchestrator, return result. No business logic, validation, or branching beyond error mapping. The 2026-05-12 audit categorized all 11 `api.rs` files and surfaced six concrete fixes, plus two cross-file patterns. Ordered smallest impact first:

1. **`use_cases/bank_manual_match/api.rs:117–136`** — `create_direct_transfer` rejects `BankEntryType::FundOutgoingWire` inline with hard-coded `"REF-080: …"` string. Move the guard into `BankManualMatchOrchestrator::create_direct_transfer` (or onto a `BankEntryType::ensure_direct_payment_eligible()` predicate on the domain enum). ~10 LOC.
2. **`use_cases/procedure_orchestration/api.rs:160–171, 184–191`** — `is_blocking_status` enumerates status strings inline and only emits a `tracing::warn!`; a comment institutionalizes the FE↔BE drift risk. Move to `ProcedureStatus::is_blocking(&self) -> bool` on the domain enum; consider enforcing the invariant in `ProcedureOrchestrationService::update_procedure` rather than warning. ~15 LOC.
3. **`use_cases/procedure_orchestration/api.rs:29–67`** — `RawProcedure::into_procedure` hand-rolls string→enum mappings for `PaymentMethod` and `ProcedureStatus`. Extract to `FromStr` impls on the domain enums (or a `Procedure::with_id_from_raw(...)` factory). ~30 LOC, optional.
4. **`use_cases/bank_statement_reconciliation/api.rs:36–75`** — `parse_bank_statement` chains `secure_path::validate_user_path → pdf_extractor::extract_pdf_text → parser::parse_bank_statement` then branches on `result.credit_lines.is_empty()` returning the magic `"NO_VIR_SEPA_LINES"` (R26 business rule decided in api). Fold into `BankStatementOrchestrator::parse_bank_statement(file_path)` mirroring the shape of the use-case's other commands. ~25 LOC.
5. **`use_cases/fund_payment_reconciliation/api.rs:318–326, 356–363`** — `reconcile_pdf_procedures` and `reconcile_and_create_candidates` each filter on `ReconciliationMatch::{SingleMatchIssue, GroupMatchIssue, TooManyMatchIssue, NotFoundIssue}` inside `.inspect(...)` purely for a log line. Extract `impl ReconciliationResult { pub fn issue_count(&self) -> usize }`, or move the log into the service. ~10 LOC, dedup.
6. **`context/patient/api.rs:182–187` + `context/fund/api.rs:185–190`** — both `create_batch_*` commands build a `temp_id_map` by zipping the incoming candidates against the service output **by positional index**. The ordering contract is encoded at the wire layer. Return `(Vec<Entity>, HashMap<String, String>)` from the service `create_batch` methods so the map is constructed where the iteration already lives. ~20 LOC across 2 BCs.

**Cross-file patterns observed:**

- Inline orchestrator construction (`Orchestrator::new(...)` in command bodies, vs `tauri::State<Arc<…>>` injection) — three known sites in `context/fund/api.rs` (tracked separately under § DECISION B13 entry below) plus one in `use_cases/fund_payment_reconciliation/api.rs:470–475` (`get_fund_payment_group_edit_data`). The latter should ride along when the fund/api.rs sites get the State-injection treatment.
- State-dependent rejection strings emitted from api bodies (criterion #6 of the audit): REF-080 in `bank_manual_match/api.rs:125–130` and REF-240 in `context/fund/api.rs:301–304`. Both belong in orchestrator or aggregate-root layers per B37.

**Clean files** (already thin adapters — skip when re-auditing): `context/bank/api.rs`, `context/procedure/api.rs`, `use_cases/excel_import/api.rs`, `use_cases/overpayment/api.rs`, `use_cases/db_backup/api.rs`.

Each numbered fix is a small dedicated PR. The cross-context-import dimension of `context/fund/api.rs read_all_fund_payment_groups + delete_fund_payment_group` is already tracked under the next entry below ("DECISION: Move cross-context `is_locked` recomputation out of `context/fund/api.rs`") and should be picked up there.

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

## (backend/arch) — Introduce a DI container for orchestrator wiring

Production orchestrators are currently wired manually in `lib.rs` via explicit `Arc<dyn Trait>` constructor injection. This works but doesn't scale well as the number of dependencies grows: adding a dep means touching `lib.rs`, the orchestrator `new()`, and every integration test `Ctx`. A DI container (e.g. `shaku`) would centralize registration and resolve dependencies automatically, reducing wiring boilerplate and making the `new()` signature irrelevant to callers. Evaluate once the orchestrator count or dep count becomes a maintenance burden.

---

## (backend/fund-payment-reconciliation) — Hardcoded French strings in CSV export

`csv_exporter.rs` hardcodes French strings. The CSV export is French-locale by design today. If bilingual exports are ever needed, route these strings through a backend translation layer or pass localized labels in from the caller.

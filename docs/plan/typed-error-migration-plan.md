# Typed Error Migration Plan

Migrate the backend off `anyhow::Result` + wire `Result<T, String>` to the gold typed-error pattern documented in [`docs/error-model.md`](../error-model.md): one `{BC}Error` per bounded context, one `{UseCase}Error` composite per use case, untagged wire shape emitting `{ code: "..." }`.

Source pain: `docs/techdebt.md` 2026-05-24 entry (`Result<T, String>` on use-case Tauri commands violates the wire-error contract). Surfaced for the third time by reviewer-backend during `refactor/dates-naive-be`; the original entry undersold the scope by framing it as a 4-command boundary fix when the entire upstream stack (domain / service / repository) is on `anyhow`.

## Scope

- **4 bounded contexts** to type: patient, procedure, fund, bank.
- **9 use cases** to compose typed errors over the BCs: db_backup, fund_payment_report_pdf (audit + rewrite), procedure_orchestration, overpayment, excel_import, fund_payment_reconciliation, fund_payment_manual_management, bank_manual_match, bank_statement_reconciliation.
- **~150 Tauri commands** total across BC + use-case surfaces, all currently returning `Result<T, String>`.
- **One existing typed-error file**: `use_cases/fund_payment_report_pdf/error.rs` — **not gold-conformant** (missing `#[serde(tag = "code")]`, no `Serialize`/`specta::Type`, carries `String` payloads). Rewritten in PR 4.

## Out of scope

- `anyhow` removal from `Cargo.toml` — kept for ad-hoc internal call sites (e.g. tests, fixtures) until the migration is complete.
- Repository trait error type — repos stay on `anyhow::Result` (or `sqlx::Error` directly) with translation at the service boundary per `error-model.md` § Decision tree ("Infra failure → translate to `{BC}Error::DatabaseError` at the call site"). This is the project-wide policy locked in PR 1.
- E2E test changes — typed errors travel transparently through the existing E2E selectors.

## PR ladder

- [x] **PR 1** — `PatientError` + `ProcedureError` BCs (pattern-setter; BE + FE adoption for both BCs' own commands) — merged 2026-05-27 (#51)
- [x] **PR 2** — `FundError` + `BankError` BCs (mirrors PR 1 mechanically once the pattern is locked) — merged 2026-05-29 (#52)
- [ ] **PR 3** — Procedure-side use-case composites. Split after PR-2 analysis revealed the context `ProcedureService` Procedure-aggregate CRUD was still on `anyhow` (PR 1 only typed the ProcedureType half):
  - [x] **PR 3a** — type the 9 orchestrator-facing context `ProcedureService` methods → `ProcedureError` (BE-only prereq; mergeable alone via the `From<ProcedureError> for anyhow::Error` bridge) — merged 2026-05-29 (#53)
  - [x] **PR 3b** — `ProcedureOrchestrationError` composite (`#[serde(untagged)]` wrapping `ProcedureError` via `#[from]` + a `ProcedureOrchestrationTask` `#[serde(tag = "code")]` sub-enum for the cross-context FK guards / delete-blocked / invalid-date / DB) + the 8 `procedure_orchestration/api.rs` commands + FE adoption. Also typed `Procedure::new`/`with_id` → `ProcedureError` and added `ProcedureError::ProcedureNotFound`; the 4 interim `.map_err(Into::into)` bridges were replaced with plain `?`. `excel_import` + `overpayment` deferred to their own PR(s).
- [ ] **PR 4** — Bank/fund-side composites, **sliced one use case per PR**:
  - [ ] **PR 4-recon** — `fund_payment_reconciliation` (BE typed errors + FE F27, 2 PRs) — in progress on `refactor/fund-recon-typed-errors`
  - [ ] **PR 4-final** — `fund_payment_manual_management`, `bank_manual_match`, `bank_statement_reconciliation`, `fund_payment_report_pdf` rewrite, `db_backup` + `git rm` this plan + close the 2026-05-24 techdebt entry

Note: `overpayment` (#56) and `excel_import` (#59) shipped as their own slices ahead of the bank/fund work; see `docs/todo.md`.

## Per-PR detail

### PR 1 — `PatientError` + `ProcedureError` (active, pattern-setter)

**Goal**: establish the canonical first gold-conformant `{BC}Error` in the codebase. The design calls made here (variant naming, repo translation pattern, mock fixture shape, FE adoption shape) become precedent for PR 2-4.

**Backend scope**:

- `src-tauri/src/context/patient/error.rs` (new) — `PatientError` flat enum: `NameEmpty`, `NonAnonymousMissingName`, `SsnInvalidFormat`, `PatientNotFound { id }`, `DatabaseError`. Wire-shape round-trip test next to it.
- `src-tauri/src/context/patient/domain.rs` — `Patient::new` / `with_id` / `new_with_temp_id` / `validate` return `Result<T, PatientError>`; drop `anyhow::bail!`.
- `src-tauri/src/context/patient/service.rs` — all 9 methods return `Result<T, PatientError>`; repository call sites translate via `.map_err(|e| { tracing::error!(...); PatientError::DatabaseError })`. Mock fixtures (`make_repo_ok` / `make_repo_fail`) rewritten to use the new types.
- `src-tauri/src/context/patient/api.rs` — 6 commands return `Result<T, PatientError>`; drop `format!("{:#}", e)`.
- Same for `procedure/`: new `error.rs` with `ProcedureError` flat enum (`PatientIdEmpty`, `ProcedureTypeIdEmpty`, `ProcedureTypeNameEmpty`, `ProcedureTypeNotFound { id }`, `ProcedureTypeNameDuplicate`, `ReservedTypeNotMutable`, `DatabaseError`, plus refund-related variants from `procedure_refund.rs`). 4 commands in `procedure/api.rs` (procedure_type CRUD) typed.
- The Procedure CRUD commands in `use_cases/procedure_orchestration/api.rs` stay on `Result<T, String>` in PR 1 — they belong to PR 3's `ProcedureOrchestrationError` composite. PR 1 leaves them as-is.

**Frontend scope**:

- `src/features/patient*/api/gateway.ts` — typed pass-through per F27 (`Result<T, PatientError>` instead of `Result<T, string>`).
- `src/features/patient*/shared/presenter.ts` — `error.code → i18n key` map for all `PatientError` variants.
- `src/i18n/locales/{en,fr}/patient.json` (or equivalent) — new keys for each variant.
- Same for procedure-type features.
- Update vitest unit tests for the touched gateway + presenter; component RTL tests adjusted only if presenter contract changed.

**Pattern locks (one-time design calls)**:

- Repos stay on `anyhow::Result` — service translates infra errors to `{BC}Error::DatabaseError` at the call site.
- Mock fixtures use `Err(BCError::Variant)` directly, never `Err(anyhow::anyhow!(...))`.
- BC enum is `#[derive(Debug, thiserror::Error, serde::Serialize, specta::Type, Clone)] #[serde(tag = "code")]` with struct variants when a payload is needed.
- Every BC enum gets a `#[test] fn each_variant_emits_a_code()` wire-shape round-trip test.
- PII (SSN value, patient name) NEVER appears as a payload field on the wire — use `{ id }` for lookups, presence booleans for telemetry only.

**Effort**: 10–14h. **LOC**: 1000–1400 (will likely cross the 1000 target — accepted per Option A trade-off).

**Reviewers**: `reviewer-backend`, `reviewer-arch`, `reviewer-frontend` in one batch.

**Dependencies**: none.

**Commit structure**:

- Commit 1 — `refactor(errors): typed PatientError + ProcedureError BCs` (BE + FE implementation)
- Commit 2 — `refactor(errors): apply review fixes + coverage` (review triage outcomes + any coverage regressions)

---

### PR 2 — `FundError` + `BankError`

**Goal**: replicate the locked pattern for the remaining two BCs. Mechanical once PR 1 lands.

**Backend scope**: new `error.rs` for each BC; domain + service + repository-translation + api.rs migration; mock fixtures updated.

**Frontend scope**: gateway + presenter + i18n for fund and bank features.

**Effort**: 12–16h. **LOC**: 1100–1500.

**Reviewers**: same trio.

**Dependencies**: PR 1 merged (pattern locked, no fresh design decisions expected).

**Commit structure**: same 2-commit shape.

---

### PR 3 — Procedure-side use-case composites (TBD, refined post-PR-2)

**Tentative scope**: `procedure_orchestration`, `excel_import`, `overpayment` — the three use cases that primarily orchestrate Patient + Procedure (+ Fund for excel_import / overpayment).

Each gets a `{UseCase}Error` composite + `{UseCase}Task` sub-enum per the gold recipe. Commands type to `Result<T, {UseCase}Error>`. FE adopts per use case.

**Refine after PR 1-2 ships**: confirm slicing (one composite per PR vs. all three together) based on observed per-composite LOC.

**Effort estimate**: 10–14h (placeholder).

**Dependencies**: PR 1 + PR 2 merged.

---

### PR 4 — Bank/fund-side composites (sliced per use case)

The original "all bank/fund use cases in one PR" scope is too big and tells multiple stories. Sliced one use case per PR, starting with `fund_payment_reconciliation`. Remaining slices (`fund_payment_manual_management`, `bank_manual_match`, `bank_statement_reconciliation`, `fund_payment_report_pdf` rewrite, `db_backup`) follow the same recipe and reuse anything this slice locks. The plan-doc/techdebt/todo close-out moves to the **final** slice, not this one.

---

#### PR 4-recon — `fund_payment_reconciliation` (this slice)

**Design (locked with user 2026-06-07)**: Option B — catch-all at the use-case boundary. No repository-trait changes (repos stay `anyhow` per the PR-1 policy, line 17). The 5 still-`anyhow` **service** methods translate to `{BC}Error` at their repo call sites (the locked policy + PR-3a precedent); the reconciliation service's directly-held repo calls and use-case guards map to a `…Task` sub-enum. `parse_pdf_text` drops `Result` (it is infallible) and returns `PdfParseResult` directly.

**New error type** — `src-tauri/src/use_cases/fund_payment_reconciliation/error.rs`:

- `FundPaymentReconciliationTask` (`#[serde(tag = "code")]`): `AllDuplicates { count }`, `NoValidCandidates`, `NoValidCandidatesAfterCorrections`, `InvalidDateRange`, `PdfPathRejected`, `PdfExtractionFailed`, `DatabaseError`.
- `FundPaymentReconciliationError` (`#[serde(untagged)]`): `Fund(#[from] FundError)`, `Patient(#[from] PatientError)`, `Procedure(#[from] ProcedureError)`, `Task(#[from] FundPaymentReconciliationTask)`.
- `#[test] fn each_variant_emits_a_code()` wire-shape round-trip (including the intentional `DatabaseError` collision across arms — document it, mirror `procedure_orchestration/error.rs`).

**Service typing (locked-policy translation, no repo-trait change)**:

- `context/fund/service.rs` — `FundPaymentService::{create_group, exists_group, create_groups_batch}` → `Result<_, FundError>` (repo call sites `.map_err(|e| { tracing::error!(...); FundError::DatabaseError })`). Other callers (`fund_payment_manual_management`) keep compiling via anyhow's blanket `From<E: Error>` on `?`.
- `context/procedure/service.rs` — `ProcedureService::{create_procedures_batch_from_candidates, update_procedures_batch}` → `Result<_, ProcedureError>`. Shared `update_procedures_batch` callers (3 other use cases) keep compiling via the same blanket `?` conversion.

**Use-case typing**:

- `use_cases/fund_payment_reconciliation/orchestrator.rs` — public + private methods return `FundPaymentReconciliationError`; typed BC calls become plain `?` (`#[from]`). The **4** wire-reachable `anyhow::bail!` sites (lines 262, 296, 400, 458) map to 3 Task variants — both "all duplicates" bails (262, 400) → `Task::AllDuplicates { count }`, plus `Task::NoValidCandidates` (296) and `Task::NoValidCandidatesAfterCorrections` (458). The two static `Regex::new(...)?` become a `OnceLock`/`expect` (compile-time-constant pattern, not a runtime error). `verify_group_integrity`'s 2 internal bails (583, 613) stay `anyhow` (never reach the wire — logged only).
- `use_cases/fund_payment_reconciliation/service.rs` — `reconcile`, `reconcile_groups`, `find_unreconciled_in_range` return the composite; directly-held repo calls + `PdfCandidateMapper::map` `.map_err` → `Task::DatabaseError`.
- `use_cases/fund_payment_reconciliation/api.rs` — 7 commands typed to `Result<T, FundPaymentReconciliationError>` (except `parse_pdf_text` → bare `PdfParseResult`); drop every `format!("{:#}", e)`. `_fn` wrappers return the composite. `get_unreconciled_procedures_in_range_fn` date parse → `Task::InvalidDateRange`. `extract_pdf_text` path-validate → `Task::PdfPathRejected`, extractor failure → `Task::PdfExtractionFailed`. Note: these are code-only variants (no string payload — drops the `format!("{e:#}")`-into-wire anti-pattern), so the FE shows a generic localized message instead of the raw validator/extractor text. Deliberate, acceptable UX downgrade.

**Bindings + tsc bridge (BE PR)**: `just generate-types`; `npx tsc --noEmit` will break the gateway throw sites (`result.error` is now an object, and `parse_pdf_text` is no longer a `Result`). Apply the **minimal** mechanical fix only (no F27 work): adjust the throw sites + the `parse_pdf_text` call to compile. The unwrapped `parse_pdf_text` return ripples beyond `gateway.ts` — check the **hook call sites** that consume `parsePdfText` compile too, not just the gateway. Full F27 wiring is the FE PR.

**BE tests**: extend the existing inline `service.rs`/`orchestrator.rs` test modules to assert typed variants (`AllDuplicates`, `NoValidCandidates`, date-parse → `InvalidDateRange`); `error.rs` round-trip test. `test-writer-backend` seeds the red stubs from the contract first.

**FE scope (separate PR, branched off merged BE `main`)** — this is the bulk, because the gateway currently **throws** (`throw new Error(result.error)`), the F27 anti-pattern:

- `src/features/fund-payment-match/gateway.ts` — stop throwing on the **5 consumed** commands; typed pass-through of `Result<T, FundPaymentReconciliationError>` per F27. Adjust `parsePdfText` to the now-unwrapped return. The 2 report functions (`generateReportPdf`, `exportAndOpenReportPdf`) call `fund_payment_report_pdf` commands deferred to PR 4-final — they **stay throwing by design** this slice (partial gateway conversion; note it in the PR description so reviewers don't read it as an incomplete F27 pass).
- **Not consumed by the FE**: `reconcile_pdf_procedures` and `create_fund_payment_from_candidates` exist only in `bindings.ts` (no `.ts/.tsx` call site) — they get BE typing (B31) but **no** presenter/i18n/hook work. FE PR scope is the 5 consumed commands only.
- `src/features/fund-payment-match/shared/errorPresenter.ts` (new — distinct name to avoid colliding with the existing `reportPresenter.ts`) — `error.code → i18n key` map for every reachable code + a generic fallback (no silent drop).
- Hooks under `reconciliation_modal/`, `reconciliation_results/`, `unreconciled_report/`, `ReconciliationPage.tsx` — route gateway errors through the presenter to `t(key)` instead of surfacing `error.message`.
- `src/i18n/locales/{en,fr}/fund-payment-match.json` — keys for each mapped code.
- Vitest: gateway unit (typed pass-through), presenter unit (code→key), affected hook/component RTL.

**Reviewers**: BE — `reviewer-backend` + `reviewer-arch` + `reviewer-security` (7 Tauri commands touched). FE — `reviewer-frontend`.

**PR plan**: 2 PRs — (1) BE typed errors + bindings + tsc bridge; (2) FE F27 pipeline. Each ≤ ~600 LOC churn, one story each.

**Dependencies**: PR 1 + PR 2 + PR 3 merged (all are).

---

#### PR 4-final — remaining use cases + close-out

`fund_payment_manual_management`, `bank_manual_match`, `bank_statement_reconciliation`, `fund_payment_report_pdf` rewrite, `db_backup`. **Closing actions in the final slice's commit**:

- `git rm docs/plan/typed-error-migration-plan.md`
- Close the 2026-05-24 entry in `docs/techdebt.md`
- Update `docs/todo.md` `(backend/frontend) — Structured errors` section: mark resolved

**Dependencies**: PR 4-recon merged.

## Cross-cutting risks

- **LOC ceiling crossed by design** — every PR is expected at 1000+ LOC. The "two stories" check still passes (each PR is one story: "type N BCs" or "type M use cases").
- **Mock repo fixtures** — every BC's `MockXxxRepository` test fixtures need rewriting. Mechanical but counts toward LOC.
- **Wire-shape round-trip tests** — easy to forget per BC. The PR template should include a checklist line for this.
- **PII redaction** — no PII (SSN value, patient name, IBAN) ever lands as an error payload field on the wire. Use IDs or presence booleans. PR 1 sets the precedent; reviewer-security should be added to the batch if any BC's error variants carry user-supplied strings.
- **Repo trait error type policy** — locked in PR 1, not revisited. Repos stay on `anyhow::Result`; services translate.
- **`fund_payment_report_pdf` is currently the WRONG example** — anyone copying that file's pattern will reproduce the anti-pattern. Comment to be added in PR 1 pointing readers to `docs/error-model.md` instead.

## Status tracker

| PR           | Status      | Branch                                          | Merged at        |
| ------------ | ----------- | ----------------------------------------------- | ---------------- |
| 1            | merged      | `refactor/typed-errors-patient-procedure`       | 2026-05-27 (#51) |
| 2            | merged      | `refactor/typed-errors-fund-bank`               | 2026-05-29 (#52) |
| 3a           | merged      | `refactor/typed-errors-procedure-context`       | 2026-05-29 (#53) |
| 3b           | merged      | `refactor/typed-errors-procedure-orchestration` | 2026-05-30 (#54) |
| 4-recon (BE) | in progress | `refactor/fund-recon-typed-errors`              | —                |
| 4-recon (FE) | TBD         | —                                               | —                |
| 4-final      | TBD         | —                                               | —                |

## Pattern reference

Canonical doc: [`docs/error-model.md`](../error-model.md). Key sections:

- § Recipes — BC enum, use-case composite, wire-shape round-trip test
- § Decision tree — where each error path goes
- § Tauri command boundary — the composite IS the wire type, no mapper
- § Anti-patterns — the `Database`/`Unknown` + `String hint` shape forbidden; `format!("{e:#}")` into wire payload forbidden

Spec rules to honor per layer:

- `B31` (backend-rules.md) — typed errors at wire-visible signatures
- `F27` (frontend-rules.md) — typed errors flow through the 4-layer FE pipeline; no silent drops

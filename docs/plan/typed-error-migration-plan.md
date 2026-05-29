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
  - [ ] **PR 3a** — type the 9 orchestrator-facing context `ProcedureService` methods → `ProcedureError` (BE-only prereq; mergeable alone via the `From<ProcedureError> for anyhow::Error` bridge)
  - [ ] **PR 3b** — `ProcedureOrchestrationError` composite (`#[serde(untagged)]` wrapping `ProcedureError` via `#[from]` + a `ProcedureOrchestrationTask` `#[serde(tag = "code")]` sub-enum for the cross-context FK guards / delete-blocked / invalid-date / DB) + the 8 `procedure_orchestration/api.rs` commands + FE adoption. `excel_import` + `overpayment` deferred to their own PR(s). First clean-up target: replace the 4 interim `.map_err(Into::into)` bridges in `procedure_orchestration/service.rs` (read_procedure / read_procedures_by_ids / read_all_procedures / get_unpaid_by_fund) with plain `?` once the composite's `#[from]` carries the type through.
- [ ] **PR 4** — Bank/fund-side composites + `git rm` this plan + close the 2026-05-24 techdebt entry

PR 3b / PR 4 scopes stay tentative until the preceding slices ship and the actual pattern friction is measured.

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

### PR 4 — Bank/fund-side composites + plan/techdebt close-out (TBD, refined post-PR-2)

**Tentative scope**: `fund_payment_reconciliation`, `fund_payment_manual_management`, `bank_manual_match`, `bank_statement_reconciliation`. Plus audit + rewrite of `fund_payment_report_pdf/error.rs` (currently non-gold). Plus `db_backup` composite.

**Closing actions in commit 2**:

- `git rm docs/plan/typed-error-migration-plan.md`
- Close the 2026-05-24 entry in `docs/techdebt.md`
- Update `docs/todo.md` `(backend/frontend) — Structured errors` section: mark resolved

**Effort estimate**: 12–16h (placeholder).

**Dependencies**: PR 1 + PR 2 + PR 3 merged.

## Cross-cutting risks

- **LOC ceiling crossed by design** — every PR is expected at 1000+ LOC. The "two stories" check still passes (each PR is one story: "type N BCs" or "type M use cases").
- **Mock repo fixtures** — every BC's `MockXxxRepository` test fixtures need rewriting. Mechanical but counts toward LOC.
- **Wire-shape round-trip tests** — easy to forget per BC. The PR template should include a checklist line for this.
- **PII redaction** — no PII (SSN value, patient name, IBAN) ever lands as an error payload field on the wire. Use IDs or presence booleans. PR 1 sets the precedent; reviewer-security should be added to the batch if any BC's error variants carry user-supplied strings.
- **Repo trait error type policy** — locked in PR 1, not revisited. Repos stay on `anyhow::Result`; services translate.
- **`fund_payment_report_pdf` is currently the WRONG example** — anyone copying that file's pattern will reproduce the anti-pattern. Comment to be added in PR 1 pointing readers to `docs/error-model.md` instead.

## Status tracker

| PR  | Status      | Branch                                    | Merged at        |
| --- | ----------- | ----------------------------------------- | ---------------- |
| 1   | merged      | `refactor/typed-errors-patient-procedure` | 2026-05-27 (#51) |
| 2   | merged      | `refactor/typed-errors-fund-bank`         | 2026-05-29 (#52) |
| 3a  | in progress | `refactor/typed-errors-procedure-context` | —                |
| 3b  | TBD         | —                                         | —                |
| 4   | TBD         | —                                         | —                |

## Pattern reference

Canonical doc: [`docs/error-model.md`](../error-model.md). Key sections:

- § Recipes — BC enum, use-case composite, wire-shape round-trip test
- § Decision tree — where each error path goes
- § Tauri command boundary — the composite IS the wire type, no mapper
- § Anti-patterns — the `Database`/`Unknown` + `String hint` shape forbidden; `format!("{e:#}")` into wire payload forbidden

Spec rules to honor per layer:

- `B31` (backend-rules.md) — typed errors at wire-visible signatures
- `F27` (frontend-rules.md) — typed errors flow through the 4-layer FE pipeline; no silent drops

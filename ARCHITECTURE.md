# ARCHITECTURE.md

> Project-specific architecture overview for **PatientManager**. Complements the kit-generic rule docs (`docs/backend-rules.md`, `docs/frontend-rules.md`, `docs/ddd-reference.md`, `docs/error-model.md`, `docs/test_convention.md`, `docs/i18n-rules.md`, `docs/e2e-rules.md`) and the tool inventory in `.claude/kit-tools.md`. This doc is the **conceptual map**; the rule docs cover the **conventions**.

> **Read this when** you need to understand WHAT PatientManager does and HOW its pieces fit together.
> **Read the rule docs when** you need to know HOW we structure code.

> Domain vocabulary is authoritative in [`docs/ubiquitous-language.md`](docs/ubiquitous-language.md) — read before naming or reviewing any domain concept.

---

## What PatientManager is

A **single-user desktop app for a French medical practice**. It tracks patients, procedures (medical acts), and three reconciliation flows that close the loop between what was billed, what was paid by health funds, and what landed in the practitioner's bank account.

The three reconciliation flows in plain terms:

- **Excel import** — monthly procedure data ingested from the practitioner's accounting spreadsheet.
- **Fund payment reconciliation** — match PDF statements from French health funds (Sécurité sociale, mutuelles) against procedures in the database.
- **Bank statement reconciliation** — match bank credit lines from the practitioner's bank statement against confirmed fund payments.

Primary locale **fr-FR**; secondary **en-GB**. PDF parsing is French-format-specific (DD/MM/YYYY dates, comma decimals, accented patient names).

---

## Stack

- **Tauri 2** desktop app — Rust backend + React 19 + TypeScript frontend, single executable.
- **SQLite** via `sqlx` (compile-time query verification). No other database.
- **IPC via Specta** — `src/bindings.ts` is **auto-generated**, never edit. Run `just generate-types` after Tauri-command changes.
- **FE state**: Zustand (`src/lib/appStore.ts`).
- **i18n**: `react-i18next`, locales under `src/i18n/locales/{fr,en}/`.

---

## The three core business flows

### 1. Excel import

Source: practitioner's monthly accounting spreadsheet (`.xlsx`). Spec: [`docs/spec/excel-import.md`](docs/spec/excel-import.md).

**Two-phase**: `parse_excel_file` → `execute_excel_import`. Parsing generates session-only `procedure_type_tmp_id` UUIDs; re-parsing would regenerate them and break the user's type-mapping choices, so the FE keeps the `ParseExcelResponse` in memory and `execute_excel_import` consumes it verbatim (EXI-070).

**Patient dedup priority**: SSN if valid, else case-insensitive Unicode-aware name match (EXI-080).

### 2. Fund payment reconciliation

Source: PDF payment statement from a health fund. Specs: [`docs/spec/fund-payment-manual-match.md`](docs/spec/fund-payment-manual-match.md), [`docs/spec/fund-payment-auto-match.md`](docs/spec/fund-payment-auto-match.md).

Parses the PDF into `NormalizedPdfLine`s grouped by `(fund, payment_date)`, matches against unreconciled procedures via exact-amount + closest-amount heuristics (the matching algorithm skips procedures with `billed_amount = None`), and creates a `FundPaymentGroup` per matched batch. Anomalies (`FundMismatch` / `AmountMismatch` / `DateMismatch`) surface to the user for resolution via correction actions. A post-reconciliation summary PDF is rendered backend-side from a FE-pre-resolved payload (ADR-006).

### 3. Bank statement reconciliation

Source: PDF bank statement from the practitioner's bank. Specs: [`docs/spec/bank-statement-auto-match.md`](docs/spec/bank-statement-auto-match.md), [`docs/spec/bank-statement-manual-match.md`](docs/spec/bank-statement-manual-match.md).

Parses bank credit lines, resolves fund labels via `BankFundLabelMapping` (user-trained per bank account; ADR-001), matches each line to a `FundPaymentGroup`. Confirmed matches create `BankTransfer`s and **lock** the fund payment group (`is_locked = true`). Direct payments (cash/check/card) follow a separate manual-match flow that links bank transfers directly to procedures.

---

## Bounded contexts

Each context owns a piece of the domain. **No cross-context imports**; cross-context coordination lives in `use_cases/`.

- **Patient** — `src-tauri/src/context/patient/`
  Patient records. Entity: `Patient`.
- **Fund** — `src-tauri/src/context/fund/`
  Health funds and their payment groups. Entities: `AffiliatedFund`, `FundPaymentGroup`, `FundPaymentLine`.
- **Procedure** — `src-tauri/src/context/procedure/`
  Medical acts, type catalog, refund records. Entities: `Procedure`, `ProcedureType`, `ProcedureRefund`.
- **Bank** — `src-tauri/src/context/bank/`
  Bank accounts and transfers. Entities: `BankAccount`, `BankTransfer`.

Each context exposes its public surface via `api.rs` (B0). External callers (other BCs, use cases, Tauri commands) go through `api.rs` — never reach into `domain/` or `infrastructure/`.

---

## Use cases (cross-context orchestrators)

Use cases may import from contexts; never from another use case. No domain events.

- **`procedure_orchestration`** — Procedure CRUD + patient tracking + FK validation. ([spec](docs/spec/procedure-orchestration.md))
- **`excel_import`** — Procedure + Patient + Fund + ProcedureType from `.xlsx`. ([spec](docs/spec/excel-import.md))
- **`fund_payment_reconciliation`** — PDF-driven auto-reconciliation: parse PDF → match procedures → create groups. ([spec](docs/spec/fund-payment-auto-match.md))
- **`fund_payment_manual_management`** — Manual CRUD on fund payment groups from the FundPaymentManager page (list delete, Add panel create, Edit modal update). Coordinates group lifecycle + linked procedure statuses. ([spec](docs/spec/fund-payment-manual-match.md))
- **`fund_payment_report_pdf`** — Post-reconciliation summary PDF; FE pre-resolves all strings (ADR-006). ([spec](docs/spec/fund-payment-report.md))
- **`bank_statement_reconciliation`** — BankTransfer ← bank PDF ↔ FundPaymentGroup. ([spec](docs/spec/bank-statement-auto-match.md))
- **`bank_manual_match`** — BankTransfer ↔ FundPaymentGroup (Fund flow) / Procedure (Direct flow). ([spec](docs/spec/bank-statement-manual-match.md))
- **`overpayment`** — Refund cascade across Procedure + Fund + Bank. ([spec](docs/spec/overpayment.md))
- **`db_backup`** — SQLite `VACUUM INTO` + gzip; pending-import for Windows file-locking. ([spec](docs/spec/db-backup.md))

---

## Key invariants

The non-obvious facts that constrain future work — things you'd never guess from code alone.

### Backend

- **`src/bindings.ts` is auto-generated** from Rust types via Specta. Never edit by hand. Regenerate with `just generate-types`.
- **`src-tauri/src/shared/infrastructure/specta_builder.rs` is the ONLY Tauri command registry.** A `#[tauri::command]` not collected here is invisible to the FE.
- **`context/{bc}/api.rs` is the gateway for each BC** (B0). External callers go through `api.rs`; nothing reaches into `domain/` or `infrastructure/` from outside the BC.
- **Procedure lifecycle**:
  `None → Created → {Reconciled, PartiallyReconciled, DirectlyPaid} → {FundPaid, PartiallyFundPaid}`,
  plus refund branches `Overpaid` / `OverpaymentRefund` (REF-160 / REF-090) and import variants `ImportDirectlyPaid` / `ImportFundPaid`.
  A procedure with a "blocking status" (reconciled or paid) **cannot be deleted** without first un-reconciling (R5, REF-220, REF-230).
- **`Procedure.billed_amount: Option<i64>`** is optional. When `None`, the procedure conceptually inherits its `ProcedureType.default_amount`. The auto-match algorithm filters `None`-billed procedures out, so this rarely surfaces — but two inline TODOs at `use_cases/fund_payment_reconciliation/orchestrator.rs:328,498` flag that `paid_amount` may be left `None` on edge-path reconciliation.
- **Patient name dedup is Unicode-aware** (since 2026-05-18 fix `1a4a4d6`): comparison happens in Rust via `str::to_lowercase()`, not SQLite `LOWER()` which is ASCII-only. EXI-080 symmetry holds across accented characters.
- **Reserved sentinel `procedure_type.id = "import-pdf"`** (displayed as "Import" in the UI). Hidden from the type-management UI, protected against add/update/delete. Used when the fund-PDF reconciliation flow has to create a procedure for an unmatched line.
- **Default cash bank account**: `get_cash_bank_account_id()` returns a fixed sentinel id used as the default for cash/check direct payments (R13).
- **Typed error model is the wire shape.** One flat `{BC}Error` per bounded context + one `{UseCase}Error` composite per use case with `#[serde(untagged)]` + `#[from]`. Per-BC `*ApplicationError` / `*DomainError` splits are an explicit anti-pattern. See [`docs/error-model.md`](docs/error-model.md).
- **`sqlx-mysql` is compiled in** via `sqlx-macros` even though we use SQLite only. The dead-code `rsa` dep has a Marvin timing CVE (RUSTSEC-2023-0071) — tracked as techdebt; not invoked at runtime.
- **No PII values in `tracing!` calls** — field NAMES (`"Fetching patient by SSN"`) are fine; field VALUE interpolation of SSN / IBAN / patient name is forbidden (logging hygiene rule in CLAUDE.md).

### Frontend

- **Locale**: fr-primary, en-secondary. Every visible string flows through `t()` (F24 covers `aria-label`, `placeholder`, `title`, etc. too).
- **Currency / date rendering**: canonical helpers in `src/lib/formatters.ts` (`useFormatters().formatCurrency` / `formatDate`). Hand-rolled `Intl.NumberFormat("fr-FR", …)` is forbidden.
- **One `gateway.ts` per feature** is the ONLY place `commands.*` is called (F26). Sub-features import from it; never create their own.
- **Three feature layout generations coexist** (Flat → Layer-first → Feature-first/gold). New features follow gold; existing features migrate bit-by-bit per CLAUDE.md § Gold Standards. See [Feature layout](#feature-layout) below.
- **Event-driven state sync**: backend publishes `{Domain}Updated` events on every mutation; the FE listens via `useEffect` + the window event bus and updates `useCacheStore` (Zustand singleton at `src/infra/cache/store.ts`, bootstrapped by `useCacheSync()` in `src/infra/cache/sync.ts`). Grep `EventBus` (backend) or `useEffect.*addEventListener` (frontend) to find specific event names.

### Data & infra

- **Migrations are sqlx-managed**: no `BEGIN`/`COMMIT` in `migrations/*.sql` (sqlx wraps each in a transaction). Apply with `just migrate`; regen the offline query cache with `just prepare-sqlx`; nuke + re-apply locally with `just clean-db`.
- **Dev binaries live under `src-tauri/dev/`** and never ship in production. They are NOT placed in `src-tauri/src/bin/` — Tauri's NSIS bundler walks that directory on disk and fails on phantom `.exe` candidates (CI guards this; see gh#41).
  - `generate_bindings` — regenerates `src/bindings.ts` from Specta types. Run via `just generate-types`.
  - `generate_fixtures` (feature `dev-fixtures`) — inverse of import parsers; writes fixture `.xlsx` / `.pdf` artifacts under `src-tauri/tests/fixtures/{surface}/`.
- **Import codec pattern**: each import surface (Excel, fund-PDF, bank-PDF) has a single typed contract with two peer consumers — the production parser and the dev generator — wired for round-trip equality (`parse(generate(scenario)) == scenario`). See [`docs/spec/import-codec-fixtures.md`](docs/spec/import-codec-fixtures.md). The round-trip integration tests live under `src-tauri/tests/codec_round_trip*.rs` and only compile under `--features dev-fixtures` (CI workflow: `.github/workflows/codec-gate.yml`).

---

## Architecture decisions

Recorded in [`docs/adr/`](docs/adr/). Each ADR ratifies a non-obvious design choice that future sessions must respect (or supersede explicitly).

- [ADR-001](docs/adr/001-bank-fund-label-mapping-persistence.md) — Bank-fund-label mapping persistence (per-account learned mapping vs. global).
- [ADR-002](docs/adr/002-overpayment-cascade-no-transaction.md) — Overpayment cascade — no DB transaction (split-step rollback design).
- [ADR-003](docs/adr/003-unit-of-work.md) — Unit of Work — explicit pattern across multi-context writes.
- [ADR-004](docs/adr/004-e2e-rtl-test-boundary-combobox.md) — E2E / RTL test boundary for HeadlessUI `ComboboxField`.
- [ADR-005](docs/adr/005-combobox-feasibility-investigation.md) — Combobox feasibility — investigation result.
- [ADR-006](docs/adr/006-frontend-resolves-pdf-translations.md) — Frontend resolves PDF translations (backend places strings, never i18n).
- [ADR-007](docs/adr/007-e2e-native-dialog-override.md) — E2E native-dialog override (Tauri WebDriver friction workaround).

---

## Data flow

```
Component
  └─ Hook (state, useMemo, callbacks)
       └─ Gateway (commands.* — positional args, matches bindings.ts exactly)
            └─ Tauri IPC
                 └─ Rust api.rs handler  → Result<T, {BC}Error | {UseCase}Error>
                      └─ Service / Orchestrator
                           └─ Repository (sqlx, Arc<dyn Trait>)
                                └─ SQLite

Backend publishes {Domain}Updated event
  └─ Frontend useEffect listener
       └─ Store updated → UI re-renders
```

---

## Feature layout

Three generations coexist. The **bit-by-bit rule** applies (CLAUDE.md § Gold Standards): new features follow gold; existing features stay in their current generation unless a touched-file edit naturally folds the migration in under the 50-LOC / locality / mechanical gates.

- **Flat (old)** — everything at root (`gateway.ts`, component, hook, `shared/`).
  Examples: `fund`, `patient`, `bank-account`, `fund-payment`, `bank-statement-match`, `fund-payment-match`, `procedure-type`.
- **Layer-first (middle, do not replicate)** — `api/` + `presentation/` split.
  Examples: `excel-import`, `procedure`.
- **Feature-first (gold)** — `gateway.ts` at root + sub-feature directories with colocated component + hook + test.
  Examples: `bank-transfer`, `db-backup`.

Gold layout reference (`bank-transfer`):

```
features/{domain}/
├── gateway.ts                     # ONLY file that calls commands.* for this domain
├── store.ts                       # Feature-scoped Zustand store (if needed)
├── {sub_feature}/
│   ├── {SubFeature}.tsx           # Component
│   ├── use{SubFeature}.ts         # Colocated hook
│   └── use{SubFeature}.test.ts    # Colocated test
├── shared/
│   ├── presenter.ts               # Domain → UI transformations
│   └── validate{Domain}.ts        # Pure validation logic
└── index.ts                       # Public re-exports
```

---

## Where to find things

| Need | Look at |
|---|---|
| Domain vocabulary | `docs/ubiquitous-language.md` |
| Backend rules (DDD, layout) | `docs/backend-rules.md` |
| DDD concepts + error categories | `docs/ddd-reference.md` |
| Typed-error model how-to | `docs/error-model.md` |
| Frontend rules (layout, F24–F28) | `docs/frontend-rules.md` |
| i18n conventions | `docs/i18n-rules.md` |
| Frontend visual proof | `docs/frontend-visual-proof.md` |
| Test conventions (unit, RTL) | `docs/test_convention.md` |
| E2E conventions | `docs/e2e-rules.md` |
| Per-feature business rules | `docs/spec/*.md` |
| Per-domain contracts | `docs/contracts/*.md` |
| Architecture decisions | `docs/adr/*.md` |
| Recorded code smells | `docs/techdebt.md` |
| Backlog | `docs/todo.md` |
| Kit tools / agents / skills | `.claude/kit-tools.md` |
| Kit version | `.claude/kit-version.md` |
| Kit sync manifest | `.claude/kit-manifest.txt` |

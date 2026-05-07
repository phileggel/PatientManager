# Implementation Plan — Fund PDF Preview Modal (FPR)

> Spec: [docs/spec/fund-payment-report.md](../spec/fund-payment-report.md)
> Contract: [docs/contracts/fund-payment-reconciliation-contract.md](../contracts/fund-payment-reconciliation-contract.md) — `generate_fund_reconciliation_report_pdf`, `ReportGenerationRequest`, `UnreconciledSection`, `UnreconciledColumns`, `UnreconciledRow`, `CorrectionGroup` are in scope
> Trigram: **FPR** (registered in `docs/spec-index.md`)
> Architecture: see [ARCHITECTURE.md](../../ARCHITECTURE.md)
> Related ADRs: ADR-001 (currency as `i64` cents — applies to billed/paid amounts in the PDF), ADR-002 (soft-delete — not directly relevant: this feature is read-only over already-validated data), ADR-006 (frontend pre-resolves all translations and formatting — applies to PR 3 request assembly)

> **PR 2 i18n pivot (2026-05-07)**: After PR 2 was implemented with a Rust-side `Label` enum + JSON-shared locale files + hand-rolled formatters (option 2 below), the backend code was refactored to remove all i18n responsibility before merge. The frontend now resolves every translation, currency string, and date string through i18next + `Intl.*` and sends pre-resolved strings in `ReportGenerationRequest`. See ADR-006. PR 3 below has been updated to reflect the new request shape; the PR 2 section retains its original structure but the implementation diverges (no `i18n.rs`, no `fmt_currency`, no `Label` enum).

---

## Pre-locked Decisions (do not re-explore)

| Topic               | Decision                                                                                                                                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PDF library         | `printpdf = "0.9"` (verified by spike against real fund-reconciliation report shape; clean output, French accents, multi-page tables)                                                                             |
| Fonts               | Bundle Roboto (Regular, Bold) — Apache 2.0, the canonical M3 typeface — as TTFs in `src-tauri/resources/fonts/`, loaded via `include_bytes!` (NOT from OS path). Italic is not needed for the report.             |
| Backend module      | NEW `src-tauri/src/use_cases/fund_payment_report_pdf/` (sibling of `fund_payment_reconciliation/`). Register the command in `core/specta_builder.rs`                                                              |
| Frontend gateway    | EXTEND `src/features/fund-payment-match/gateway.ts` with two functions: `generateReportPdf` and `saveReportPdf`. No print gateway — in-app printing is out of scope. Do NOT create a new gateway file             |
| Frontend component  | NEW `src/features/fund-payment-match/reconciliation_modal/ReportPreviewModal.tsx`. Embeds the PDF via a blob URL in an iframe                                                                                     |
| Hook rework         | `src/features/fund-payment-match/reconciliation_modal/usePrintReport.ts` is rewritten to call the new gateway and drive modal open/close + error state. The current `window.open`-based implementation is dropped |
| Dead code to delete | `src/features/fund-payment-match/shared/printReport.ts`, `printReport.test.ts`, `printReportPresenter.ts`, `printReportPresenter.test.ts`                                                                         |
| Test rework         | `usePrintReport.test.ts` and `ReconciliationModal.test.tsx` currently mock `window.open`; both need to be updated to mock the new gateway functions                                                               |

### Locked-vacant rules

**FPR-012 is intentionally vacant** — the previous browser-print-window-close rule was removed when `window.open` was dropped.

**FPR-017 is intentionally vacant** — the previous in-app Print action was dropped from scope; users print externally from the saved PDF if needed.

Both numbers are reserved and **must never be reused**. Reviewers and future authors: if you see no FPR-012 or FPR-017 in code or tests, that is correct.

### Known constraints from the spike

- **Build cost**: clean rebuild adds ~30 s due to `azul-*` transitive crates pulled in by `printpdf 0.9`. Incremental builds are unaffected.
- **Binary size**: bundled TTFs add ~700 KB to the installer/binary. Acceptable for an NSIS Windows bundle.
- **Linux WebKit2GTK does not render PDF in iframes**. This is acceptable because the bundle target is **NSIS / Windows** (verified in `tauri.conf.json` — `"targets": "nsis"`). Developers running on Linux during dev will see a blank iframe; this must be flagged in the dev README touch-up (PR 4).

---

## Workflow Phasing — One PR per phase

The user has explicitly committed to four PRs. Do not collapse phases.

| PR       | Branch                         | Scope                            | Touches code?                              |
| -------- | ------------------------------ | -------------------------------- | ------------------------------------------ |
| **PR 1** | `feat/fund-pdf-spec` (current) | Docs only — spec, contract, plan | No                                         |
| **PR 2** | new branch off `main`          | Backend implementation           | Rust + assets + config                     |
| **PR 3** | new branch off `main`          | Frontend implementation          | TS/TSX + i18n + dead-code purge            |
| **PR 4** | new branch off `main`          | E2E + closure                    | E2E test files + ARCHITECTURE.md + todo.md |

> **Rule reminder**: per `CLAUDE.md` Core Rule 1, Claude Code never commits, branches, pushes, or opens PRs without explicit user authorization. Each phase boundary is a stop-and-ask checkpoint.

---

## PR 1 — Docs (current branch `feat/fund-pdf-spec`)

### Workflow TaskList

- [x] 📝 Spec drafted via `/spec-writer` and approved by `spec-reviewer` — `docs/spec/fund-payment-report.md`
- [x] 🔗 Contract derived via `/contract` — `generate_fund_reconciliation_report_pdf` + `ReportGenerationRequest` added to `docs/contracts/fund-payment-reconciliation-contract.md`
- [x] 🗂️ Trigram registered in `docs/spec-index.md` (FPR — Fund Payment Report)
- [x] 📋 Implementation plan written to `docs/plan/fund-pdf-preview-modal-plan.md` (this file)
- [ ] 💾 Commit: `docs(fund-pdf): add spec, contract entry, and implementation plan`
- [ ] 🚀 Open PR 1 (docs only) and merge before starting PR 2

### Review touchpoints

- `spec-reviewer` (already passed)
- `contract-reviewer` (already passed)

### Out of scope for PR 1

No code, no asset additions, no Cargo dependency changes, no `bindings.ts` regeneration. Anything else means PR 1 is rotten and must be split.

---

## PR 2 — Backend implementation (new branch off `main`)

### Goal

Land the `generate_fund_reconciliation_report_pdf` Tauri command end-to-end on the Rust side: dependency, font assets, module, command registration, regenerated bindings, bundle config, unit tests. The frontend is **not** wired to it yet — the new command will simply exist and be callable.

### Workflow TaskList

- [ ] 📖 Re-read [`ARCHITECTURE.md`](../../ARCHITECTURE.md) §Backend, [`docs/backend-rules.md`](../backend-rules.md), and the contract
- [ ] 🧱 Add `printpdf = "0.9"` to `src-tauri/Cargo.toml` (no other deps — spike confirmed `printpdf` is sufficient)
- [ ] 🎨 Create `src-tauri/resources/fonts/` and add Roboto (Regular, Bold) TTFs + Apache-2.0 LICENSE.txt. Italic dropped — not needed for tabular reports. _(Implementation pivot: switched from Liberation Sans to Roboto for M3 alignment.)_
- [ ] _(Skipped — `tauri.conf.json` `bundle.resources` not needed because fonts are embedded at compile time via `include_bytes!`. No runtime asset path is referenced.)_
- [ ] ✍️ `test-writer-backend` writes failing Rust tests for the new module from the contract entry — all stubs red, confirmed via `cargo test`. Scope is the new `use_cases/fund_payment_report_pdf` module **only**; no test for the pre-existing reconciliation commands
- [ ] 🏗️ Backend implementation (minimal — make failing tests pass, green confirmed). Implement only what the failing tests demand. No defensive code, no anticipation
- [ ] 🧹 `just format` (rustfmt + clippy --fix)
- [ ] 🔍 `reviewer-backend` → fix issues
- [ ] 🔍 `reviewer-security` → run because we are adding a new Tauri command and embedding bundled assets; verify input validation on `ReportGenerationRequest` (locale string sanity, ISO date parsing, no path-traversal vector)
- [ ] 🔗 `just generate-types` to regenerate `src/bindings.ts`
- [ ] 🔧 TypeScript compile fixup (only the new bindings types — no UI work in this PR). The new command and `ReportGenerationRequest` type will appear in `bindings.ts` but be unused. That is acceptable for this PR — `oxlint` / `biome` should not flag unused exports from a generated file
- [ ] ✅ `just check` — TypeScript clean
- [ ] 🔍 `reviewer-arch` → cross-cutting verification: new module sits at the right layer (`use_cases/`), no cross-context import violations, command registered only in `specta_builder.rs`
- [ ] 🔍 `reviewer-infra` → run because `tauri.conf.json` was modified (bundle resources)
- [ ] 💾 Commit (suggested title): `feat(fund-pdf): add backend PDF generation command`
- [ ] 🚀 Open PR 2, merge before starting PR 3

### Detailed Implementation Plan — PR 2

#### Cargo / assets / config

| Path                                                   | Action                                                                              |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `src-tauri/Cargo.toml`                                 | Add `printpdf = "0.9"` under `[dependencies]`                                       |
| `src-tauri/resources/fonts/LiberationSans-Regular.ttf` | NEW (binary asset)                                                                  |
| `src-tauri/resources/fonts/LiberationSans-Bold.ttf`    | NEW (binary asset)                                                                  |
| `src-tauri/resources/fonts/LiberationSans-Italic.ttf`  | NEW (binary asset)                                                                  |
| `src-tauri/resources/fonts/LICENSE`                    | NEW (Liberation fonts license text — required for redistribution)                   |
| `src-tauri/tauri.conf.json`                            | Add `"resources": ["resources/fonts/*.ttf", "resources/fonts/LICENSE"]` to `bundle` |

#### Backend module — NEW `src-tauri/src/use_cases/fund_payment_report_pdf/`

| Path                               | Role                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mod.rs`                           | Module root; declares `api`, `service`, `request`, `i18n`, `renderer`; re-exports `ReportGenerationRequest` and the API function for `specta_builder.rs`                                                                                                                                                                                           |
| `request.rs`                       | `ReportGenerationRequest` struct (matches contract field-for-field) + `validate()` returning `Result<(), ReportError>`. Validates: non-empty `locale`, ISO date parse for `period_start` / `period_end`, ISO 8601 datetime parse for `generation_date`, non-empty `source_pdf_filename`                                                            |
| `service.rs`                       | `ReportPdfService` exposing `generate(request) -> Result<Vec<u8>>`. Calls validation, then renderer. No DB access (FPR-013)                                                                                                                                                                                                                        |
| `i18n.rs`                          | Static label tables for `fr` and `en`, keyed by symbol (`title`, `period`, `section_unreconciled`, `column_patient`, ... + correction-type group titles). FPR-021 — locale captured from request, fixed for the lifetime of the document                                                                                                           |
| `renderer/mod.rs`                  | Orchestration of page composition; declares `header`, `section_unreconciled`, `section_corrections`, `footer`, `fonts` submodules                                                                                                                                                                                                                  |
| `renderer/fonts.rs`                | `include_bytes!("../../../../resources/fonts/LiberationSans-Regular.ttf")` (and Bold, Italic). Loads them into the `printpdf` document once                                                                                                                                                                                                        |
| `renderer/header.rs`               | FPR-020 — title, source PDF filename, period start/end, generation date                                                                                                                                                                                                                                                                            |
| `renderer/section_unreconciled.rs` | FPR-030 / FPR-031 / FPR-032 / FPR-033 — table or empty-state confirmation, total line when present                                                                                                                                                                                                                                                 |
| `renderer/section_corrections.rs`  | FPR-040 / FPR-041 / FPR-042 — group-by correction-type in priority order, sort by date ascending, per-group column sets                                                                                                                                                                                                                            |
| `renderer/footer.rs`               | FPR-022 — page numbers                                                                                                                                                                                                                                                                                                                             |
| `api.rs`                           | `#[tauri::command] #[specta::specta] pub async fn generate_fund_reconciliation_report_pdf(request: ReportGenerationRequest, state: tauri::State<'_, Arc<ReportPdfService>>) -> Result<Vec<u8>, String>`. Two error variants per contract: `InvalidRequest`, `PdfGenerationFailed` (mapped to `String` via the existing `to_command_error` pattern) |

> **ADR-001 reminder**: `billed_amount`, `paid_amount`, `original_billed_amount`, `corrected_billed_amount` are all `i64` cents in `UnreconciledProcedure` and `AutoCorrection` variants. The renderer must format them as currency at display time only — never persist or compute in floats.

#### Wiring

| Path                                   | Action                                                                                                                                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src-tauri/src/use_cases/mod.rs`       | Add `pub mod fund_payment_report_pdf;`                                                                                                                                            |
| `src-tauri/src/lib.rs`                 | In `initialize_app()`, construct `Arc<ReportPdfService>` and `app.manage(...)` it (stateless service — fonts loaded lazily on first call or via `OnceCell`)                       |
| `src-tauri/src/core/specta_builder.rs` | Add `.typ::<fund_payment_report_pdf::ReportGenerationRequest>()` to the type list and `fund_payment_report_pdf::generate_fund_reconciliation_report_pdf` to `collect_commands![]` |

#### Backend tests (inline `#[cfg(test)]` per `docs/test_convention.md`)

`test-writer-backend` derives stubs from the contract entry. Expected coverage:

- `request::validate()`: empty locale → `InvalidRequest`; bad ISO date in `period_start` → `InvalidRequest`; bad ISO datetime in `generation_date` → `InvalidRequest`; empty `source_pdf_filename` → `InvalidRequest`; valid request → `Ok`
- `service::generate()`: happy path returns non-empty `Vec<u8>` starting with the `%PDF-` magic bytes
- `service::generate()`: empty `unreconciled_procedures` → still produces a PDF (FPR-032 empty-state path)
- `service::generate()`: empty `auto_corrections` → still produces a PDF (FPR-040 omits Section 2)
- `service::generate()`: all six correction types present → produces a PDF (FPR-041 / FPR-042 group ordering exercised; assert by length thresholds, not byte-exact comparison — PDF byte output is non-deterministic across platforms)
- `i18n::label_for(locale, key)`: returns French label for `"fr"`, English label for `"en"`, falls back to English for unknown locale (no panic — FPR-021 robustness)

> No DB tests needed — FPR-013 forbids DB access during rendering.

#### Rules Coverage — PR 2 (backend)

| Rule                   | Layer         | File                                                           |
| ---------------------- | ------------- | -------------------------------------------------------------- |
| FPR-011 (backend half) | api / service | `api.rs`, `service.rs`                                         |
| FPR-013 (backend half) | service       | `service.rs` (no repository injected)                          |
| FPR-020                | renderer      | `renderer/header.rs`                                           |
| FPR-021 (backend half) | i18n          | `i18n.rs`, threaded through renderer                           |
| FPR-022                | renderer      | `renderer/footer.rs`                                           |
| FPR-030                | renderer      | `renderer/section_unreconciled.rs`                             |
| FPR-031                | renderer      | `renderer/section_unreconciled.rs` (column set)                |
| FPR-032                | renderer      | `renderer/section_unreconciled.rs` (empty-state branch)        |
| FPR-033                | renderer      | `renderer/section_unreconciled.rs` (total line)                |
| FPR-040                | renderer      | `renderer/section_corrections.rs` (omit-section branch)        |
| FPR-041                | renderer      | `renderer/section_corrections.rs` (priority order + date sort) |
| FPR-042                | renderer      | `renderer/section_corrections.rs` (per-group column set)       |

### Review touchpoints — PR 2

| Reviewer            | Why                                                              |
| ------------------- | ---------------------------------------------------------------- |
| `reviewer-backend`  | Mandatory — `.rs` modified                                       |
| `reviewer-security` | Mandatory — new Tauri command + bundled binary assets            |
| `reviewer-arch`     | Mandatory — new use_case module placement + command registration |
| `reviewer-infra`    | Mandatory — `tauri.conf.json` modified                           |

---

## PR 3 — Frontend implementation (new branch off `main`)

### Goal

Wire the UI: gateway functions, `ReportPreviewModal`, reworked `usePrintReport` hook, deletion of obsolete HTML-template files, and updated tests.

### Workflow TaskList

- [ ] 📖 Re-read [`docs/frontend-rules.md`](../frontend-rules.md), [`docs/i18n-rules.md`](../i18n-rules.md), [`docs/test_convention.md`](../test_convention.md)
- [ ] ✍️ `test-writer-frontend` writes failing tests — all stubs red, confirmed via `vitest`. **Modified-functions list** to pass: `[usePrintReport.ts, ReconciliationModal.test.tsx]` (both currently mock `window.open` and must be reworked to mock the gateway)
  - Gateway unit tests (mocking Tauri `invoke` + `tauri-plugin-dialog` + `tauri-plugin-fs`)
  - RTL component tests for `ReportPreviewModal`
  - RTL tests for `usePrintReport` (gateway mocked)
  - Updated `ReconciliationModal.test.tsx` (gateway mocked instead of `window.open`)
- [ ] 💻 Frontend implementation (minimal — make failing tests pass, green confirmed). Implement only what the failing tests demand. No defensive code, no extra hook surface
- [ ] 🗑️ Delete obsolete files (see "Dead code to delete" table below). Verify no remaining imports via `Grep`
- [ ] 🌍 Add i18n keys for the preview modal (`fr` and `en` namespaces, `fund-payment-match` namespace already exists)
- [ ] 🧹 `just format`
- [ ] 📸 `/visual-proof` — capture preview modal in idle / preview-ready / save-error states, both light and dark mode. Stage screenshots before commit
- [ ] 🔍 `reviewer-frontend` → fix issues
- [ ] 🔍 `reviewer-arch` → mandatory because `.ts` / `.tsx` modified
- [ ] ✅ `just check` — lint + typecheck clean
- [ ] 💾 Commit (suggested title): `feat(fund-pdf): add preview modal and rework report flow`
- [ ] 🚀 Open PR 3, merge before starting PR 4

### Detailed Implementation Plan — PR 3

#### Gateway extension — `src/features/fund-payment-match/gateway.ts`

Add two functions to the existing file (do **not** create a new gateway):

| Function                                                                        | Wraps                                                                            | Notes                                                                                                              |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `generateReportPdf(request: ReportGenerationRequest) -> Uint8Array`             | `commands.generateFundReconciliationReportPdf`                                   | Positional args; returns `result.data` (`Uint8Array` from Specta `Vec<u8>`); throws on `result.status === "error"` |
| `saveReportPdf(bytes: Uint8Array, defaultFilename: string) -> {saved: boolean}` | `tauri-plugin-dialog` `save({...})` + `tauri-plugin-fs` `writeFile(path, bytes)` | If user cancels dialog → returns `{saved: false}` (no toast). If write fails → throws                              |

> **Pattern check** (`CLAUDE.md` Critical Patterns): the binding `commands.generateFundReconciliationReportPdf` takes one positional arg (`request`). Call it as such, never as an object wrap.

> **In-app printing is out of scope.** Users can print the saved PDF from any external viewer if needed (FPR-017 vacant).

#### Component — NEW `src/features/fund-payment-match/reconciliation_modal/ReportPreviewModal.tsx`

| Concern          | Implementation                                                                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layout           | `ModalContainer` (existing UI primitive), header with title + Close icon, body with `<iframe>`, footer with Save / Close buttons                                                                               |
| PDF embed        | On mount, `URL.createObjectURL(new Blob([bytes], {type: "application/pdf"}))` → `iframe.src`. Revoke the URL on unmount                                                                                        |
| Save action      | FPR-016 — calls `gateway.saveReportPdf(bytes, defaultFilename)`. On `{saved: true}` → success toast. On cancel → silent. On throw → error toast. Modal stays open in all cases                                 |
| Close action     | FPR-018 — calls `onClose` prop                                                                                                                                                                                 |
| Default filename | FPR-016 — `reconciliation-{periodStart}-to-{periodEnd}.pdf` (dates in `YYYY-MM-DD` from session data; the hook holds these independently of the request payload, which now carries only pre-formatted strings) |

#### Hook rework — `src/features/fund-payment-match/reconciliation_modal/usePrintReport.ts`

Drop the entire `window.open` flow. New surface:

```ts
function usePrintReport(args: UsePrintReportArgs): {
  handleReport: () => Promise<void>; // FPR-011 — assemble request, call gateway, open modal
  isGenerating: boolean; // FPR-019 — drives Report button loading state
  previewBytes: Uint8Array | null; // FPR-015 — non-null while preview is open
  defaultFilename: string; // FPR-016 — used by ReportPreviewModal
  closePreview: () => void; // FPR-018 — clears previewBytes
  reportError: string | null; // FPR-014 — toast trigger
  clearReportError: () => void;
};
```

Behavior:

- `handleReport` assembles `ReportGenerationRequest` from session data, **resolving every label and value to a string before sending** (per ADR-006 — backend has no i18n):
  - `title`, `continuation_title`, `correction_section_heading`, `page_label` and every column header / group title via `t(...)` (i18next).
  - `header_lines` — period (`t("print.header.period", { start, end })` with each date through `Intl.DateTimeFormat(i18n.language, ...)`), generation timestamp (`Intl.DateTimeFormat` long form using `i18n.language`), source PDF file name.
  - `unreconciled` — `Empty` variant when no rows; `Rows` variant otherwise with each row's `date` via `Intl.DateTimeFormat`, `amount` via the existing `formatCurrency(thousandths, locale)` presenter, and the total computed in JS and pre-formatted.
  - `correction_groups` — built in FPR-041 priority order, sorted within each group by date ascending. Each row is the variant-specific columns joined into a single string by a presenter (see "Correction-row presenter" below). Empty groups are skipped (no zero-row group entries).
- On success → set `previewBytes`. On failure → set `reportError` and surface a toast.
- The reconciliation modal stays open underneath (FPR-015) — that is the consumer's existing behavior; the hook does not touch it.

#### Correction-row presenter — NEW `src/features/fund-payment-match/shared/correctionReportPresenter.ts`

A pure function `correctionRowsForGroup(kind: AutoCorrectionKind, corrections: AutoCorrection[], dbMatches: DbMatch[], t, locale): string[]` that returns the pre-joined row strings for a given correction kind. One implementation per FPR-042 row layout, using `formatCurrency` and `formatDate` helpers. Inline test file covers each of the six variants.

#### Modal integration — `ReconciliationModal.tsx`

Render `<ReportPreviewModal>` conditionally on `previewBytes !== null`. The button is renamed from "Print" to **"Report"** (Q1 decision); it uses `isGenerating` for the loading state (FPR-019), and is rendered only when `isReportStep` is true (FPR-010 — already gated this way today).

#### Dead code to delete

| Path                                                                  | Reason                                                           |
| --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `src/features/fund-payment-match/shared/printReport.ts`               | HTML template builder — obsolete once PDF is the source of truth |
| `src/features/fund-payment-match/shared/printReport.test.ts`          | Tests the deleted file                                           |
| `src/features/fund-payment-match/shared/printReportPresenter.ts`      | View-model builder for the HTML template — no other consumer     |
| `src/features/fund-payment-match/shared/printReportPresenter.test.ts` | Tests the deleted file                                           |

> Run `Grep` for `buildPrintReportHtml`, `buildPrintReportViewModel`, `printReportPresenter` after deletion to prove zero remaining imports. The hook rework removes the only call sites.

#### Tests to update (modified_functions list for `test-writer-frontend`)

| File                           | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `usePrintReport.test.ts`       | Replace `window.open` mock with mocks for `gateway.generateReportPdf`. Test FPR-014 (error path), FPR-015 (success path opens preview), FPR-019 (`isGenerating` toggles), FPR-018 (`closePreview` clears state). Assert request assembly: every string field is pre-resolved (no raw enums, no ISO dates, no raw `i64` amounts in the dispatched payload) and `correction_groups` are in FPR-041 priority order. Detailed per-variant row formatting is covered in `correctionReportPresenter.test.ts` |
| `ReconciliationModal.test.tsx` | Replace `window.open` assertions with assertions on the gateway mock + on the conditional rendering of `ReportPreviewModal`. Update button label assertion from "Print" to "Report"                                                                                                                                                                                                                                                                                                                    |

#### Tests to add (new files)

| File                                                                                 | Coverage                                                                                                                             |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src/features/fund-payment-match/reconciliation_modal/ReportPreviewModal.test.tsx`   | Save success / cancel / error (FPR-016); Close calls `onClose` (FPR-018); iframe receives a blob URL on mount and revokes on unmount |
| `src/features/fund-payment-match/gateway.test.ts` (extend if it exists, else create) | `generateReportPdf` happy path + error path; `saveReportPdf` cancel returns `{saved: false}`, success writes file, throw propagates  |

#### i18n keys to add

Namespace `fund-payment-match` (already exists). Suggested keys (final names decided during implementation):

- `report.button` — label for the renamed Report button (was "Print")
- `report.preview.title`
- `report.preview.save`
- `report.preview.close`
- `report.preview.saveSuccess`
- `report.preview.saveError`
- `report.error.generationFailed` (replaces the old `print.error.windowOpenFailed`)

> Existing keys used by the deleted HTML template (`print.report.title`, `print.column.*`, etc.) are no longer needed in the **frontend** — but the **backend** i18n table (PR 2) holds the equivalent labels for the PDF itself. Do not delete the FE keys before confirming via `Grep` that nothing in `src/` still references them; some may have been reused for the on-screen unreconciled report view.

#### Rules Coverage — PR 3 (frontend)

| Rule                    | Layer                                   | File                                                                           |
| ----------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| FPR-010                 | component                               | `ReconciliationModal.tsx` (existing gate, verify still correct)                |
| FPR-011 (frontend half) | hook + gateway                          | `usePrintReport.ts`, `gateway.ts`                                              |
| FPR-012                 | _vacant_ — see locked-vacant note above |
| FPR-013 (frontend half) | hook                                    | `usePrintReport.ts` (request assembled from props only, no fetch)              |
| FPR-014                 | hook + UI                               | `usePrintReport.ts` (`printError`), toast trigger in `ReconciliationModal.tsx` |
| FPR-015                 | hook + component                        | `usePrintReport.ts` (`previewBytes`), `ReportPreviewModal.tsx`                 |
| FPR-016                 | component + gateway                     | `ReportPreviewModal.tsx`, `gateway.saveReportPdf`                              |
| FPR-017                 | _vacant_ — see locked-vacant note above |
| FPR-018                 | component + hook                        | `ReportPreviewModal.tsx`, `usePrintReport.closePreview`                        |
| FPR-019                 | hook + UI                               | `usePrintReport.isGenerating`, button state in `ReconciliationModal.tsx`       |
| FPR-021 (frontend half) | hook                                    | `usePrintReport.ts` (captures `i18n.language` at request time)                 |

### Review touchpoints — PR 3

| Reviewer            | Why                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `reviewer-frontend` | Mandatory — `.ts` / `.tsx` modified                                                                                                 |
| `reviewer-arch`     | Mandatory — runs on any FE / BE source change; verify gateway-encapsulation rule still holds (only `gateway.ts` calls `commands.*`) |
| `/visual-proof`     | Mandatory — TSX changes, must commit screenshots                                                                                    |

---

## PR 4 — E2E + closure (new branch off `main`)

### Goal

Wire WebDriver E2E coverage for the print → preview → save / print / close flow, update architecture docs, close the spec todo entry, and run the final spec-checker pass.

### Workflow TaskList

- [ ] 🛠️ Run `/setup-e2e` if not already done on this clone
- [ ] ✍️ `test-writer-e2e` writes Tauri WebDriver E2E tests — green confirmed
  - Happy path: open reconciliation modal → reach report step → click Print → preview modal opens with embedded PDF (assertion: iframe present, non-empty `src`) → click Close → preview dismissed, reconciliation modal still at report step
  - Error path (optional, harness-permitting): mock backend failure on `generate_fund_reconciliation_report_pdf` and assert error toast + Report button re-enabled
  - Save action: open save dialog (use the WebDriver dialog hook from existing `db-backup` E2E tests as reference)
- [ ] 🔍 `reviewer-frontend` → fix issues in E2E test files
- [ ] 📚 Update [`ARCHITECTURE.md`](../../ARCHITECTURE.md):
  - Add `Fund Payment Report PDF (use_cases/fund_payment_report_pdf/)` section under "Use Cases"
  - Append `generate_fund_reconciliation_report_pdf` to the existing "Fund Payment Reconciliation" command list (or move it under the new use_case section — pick one and stay consistent)
  - Note the new `ReportPreviewModal` sub-feature under `features/fund-payment-match/`
- [ ] 📋 If a tracking entry was added to [`docs/todo.md`](../todo.md) at any point, close it (English entries only — `CLAUDE.md` rule)
- [ ] 📌 Note the Linux iframe-PDF caveat in the dev README or in `docs/todo.md` as a known dev-environment limitation (NSIS Windows bundle is the production target)
- [ ] ✅ `spec-checker` — verifies every FPR-NNN rule has an implementation site and a test, and that the contract entry is fully covered
- [ ] 🧹 `just format`
- [ ] 💾 Commit (suggested title): `test(fund-pdf): add E2E coverage and update architecture docs`
- [ ] 🚀 Open PR 4

### Review touchpoints — PR 4

| Reviewer            | Why                                   |
| ------------------- | ------------------------------------- |
| `reviewer-frontend` | E2E test files are TS — mandatory     |
| `reviewer-arch`     | `ARCHITECTURE.md` updated — mandatory |
| `spec-checker`      | Mandatory final gate before merge     |

---

## Plan-level Decisions (resolved 2026-05-06; revised 2026-05-07 after the i18n pivot)

The five questions surfaced during planning are still resolved; ownership of #1, #2, #4, and #5 moved from BE to FE on 2026-05-07 per ADR-006.

1. **Currency formatting** — `fr`: `1 234,56 €` (NBSP thousands separator, comma decimal, trailing €). `en`: `€1,234.56` (leading €, comma thousands, dot decimal). **Owner: frontend** — produced by the existing `formatCurrency(thousandths, locale)` presenter (or `Intl.NumberFormat`), then passed in as a pre-formatted string in `ReportGenerationRequest`. No Rust formatter.
2. **Generation-date rendering in the PDF header** — locale-aware long form. `fr`: `6 mai 2026, 16:42`. `en`: `May 6, 2026, 4:42 PM`. **Owner: frontend** — produced via `Intl.DateTimeFormat(i18n.language, { dateStyle: "long", timeStyle: "short" })` and passed in as a pre-formatted string in one of `header_lines`. The wire format used to be ISO 8601 in the request; the field no longer exists.
3. **Font fallback for missing glyphs** — accept tofu (`□`) for v1. Roboto Regular/Bold cover Latin-1 + Extended (French, German, Spanish, Italian, Polish, Czech, Vietnamese, etc.), which is sufficient for the French clinic context. Revisit only if a real-world report surfaces a missing-glyph case.
4. **Correction-row display data** — frontend pre-formats and pre-joins. The contract type `EnrichedAutoCorrection` was removed; `correction_groups[].rows` is `Vec<String>`, where each row is the variant-specific FPR-042 columns joined into a single line by the new `correctionReportPresenter`. Backend performs no DB lookup, no per-variant dispatch, and no formatting.
5. **Locale typing** — the `locale` field was removed from the request entirely. The frontend implicitly owns the locale via `i18n.language`; the backend has no opinion on language. No server-side validation against `["fr", "en"]` because the BE no longer sees a locale.

---

## Cross-Phase Notes

- **No schema changes** — this feature performs no DB writes. No migration, no `just prepare-sqlx`.
- **Tauri profile** — bindings regeneration (`just generate-types`) is mandatory after PR 2's backend changes; that is what makes `commands.generateFundReconciliationReportPdf` available to PR 3.
- **English-only rule** — all in-code comments, log lines, and `docs/todo.md` entries must be in English. UI strings go through `t(...)` with `fr` and `en` translations.
- **Commit policy** (`CLAUDE.md` Core Rule 1) — Claude Code never commits without explicit user authorization. The four "Commit (suggested title)" checkboxes are stop-and-ask gates.
- **Visual proof** (`docs/frontend-visual-proof.md`) — PR 3 is a `.tsx` change and must include screenshots. PR 2 and PR 4 are Rust/test/docs only and may use the "No visual impact" attestation.

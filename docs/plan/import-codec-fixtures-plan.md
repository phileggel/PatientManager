# Implementation Plan — Import Fixture Codec (IFC)

> **Source spec**: [`docs/spec/import-codec-fixtures.md`](../spec/import-codec-fixtures.md)
> **Trigram**: IFC (registered in `docs/spec-index.md`)
> **Contract**: intentionally absent — no Tauri commands, no IPC boundary, no persisted entity.
> The contract type is the existing `ParsedExcelData` already living in production code.
> `contract-reviewer` does **not** run for this feature; validate against the spec only.

---

## At a glance

- **Phase 1 — Spec/Plan**: this document is the last Phase-1 artifact (no contract step). Hand off to `plan-reviewer` next.
- **Phase 2 — Backend (substantive)**: Cargo feature wiring → dev binary skeleton → xlsx writer choice → scenario builders → fixture artifacts → typed access helper → round-trip integration test → `just regen-fixtures` recipe → `dev-fixtures` CI job.
- **Phase 3 — Frontend**: **NO-OP**. No UI, no gateway, no Specta types regenerated. Skip every `frontend-*` checkpoint in the workflow.
- **Phase 4 — Review/Closure**: `reviewer-arch` + `reviewer-infra` (Cargo manifest, justfile recipe, GitHub Actions workflow) + `reviewer-security` (verify dev binary and write-side deps are absent from the production `tauri build`). `reviewer-backend` only if any production source was touched (must be **none** per IFC-022).
- **E2E**: not applicable.
- **PR strategy**: 1 PR, BE-only.

---

## 1. Workflow TaskList (synthetic — derived from CLAUDE.md)

- [ ] Review architecture & rules (`ARCHITECTURE.md`, `docs/backend-rules.md`)
- [ ] Inspect existing parser entry (`ExcelParserService::parse_excel`) and confirm it is callable from `tests/`
- [ ] Backend test stubs (`test-writer-backend` — round-trip integration test stubs written, red confirmed). **No contract; tests are derived directly from the spec rules** (IFC-021, IFC-032, IFC-051). No `modified_functions` list — all new files.
- [ ] Backend implementation — minimal, only what is required to make the failing tests pass. No additional methods, no defensive code, no anticipation of future surfaces.
  - [ ] Cargo feature `dev-fixtures` declared, write-side deps gated under it (IFC-011, IFC-013)
  - [ ] Dev binary `src-tauri/src/bin/generate_fixtures.rs` with `required-features = ["dev-fixtures"]` (IFC-010, IFC-012)
  - [ ] Scenario builder module (Rust functions returning `ParsedExcelData`) (IFC-031, IFC-032)
  - [ ] Excel xlsx writer module (IFC-020, IFC-025 — generation logic lives outside the codec)
  - [ ] Atomic write helper (temp + rename, partial cleanup) (IFC-034)
  - [ ] Determinism configuration / post-processing (IFC-040)
  - [ ] Sibling JSON snapshot writer (IFC-030)
  - [ ] Typed fixture access helper module under `src-tauri/tests/fixtures.rs` or `src-tauri/tests/common/fixtures.rs` (IFC-050)
  - [ ] Round-trip integration test `src-tauri/tests/codec_round_trip.rs` (IFC-021, IFC-051)
- [ ] `just format`
- [ ] Confirm production build is unaffected: `cargo check --no-default-features` + `cargo build --release` show no write-side dep linkage (IFC-013, IFC-024)
- [ ] Backend review (`reviewer-backend`) — only if any prod-code (`src-tauri/src/**` outside `bin/`) was modified. Per IFC-022 this should be **no**.
- [ ] Type synchronization — **SKIPPED** (no Tauri command added)
- [ ] Compilation fixup — **SKIPPED** (no bindings change)
- [ ] `just check` — Rust/format clean
- [ ] Frontend test stubs — **SKIPPED** (no FE)
- [ ] Frontend implementation — **SKIPPED**
- [ ] Visual proof — **SKIPPED** (write `No visual impact — Rust-only dev tooling change.` in PR body)
- [ ] Frontend review — **SKIPPED**
- [ ] E2E tests — **SKIPPED**
- [ ] Generate the committed fixture set: `just regen-fixtures` (produces `tests/fixtures/excel/*.xlsx` + `*.expected.json`)
- [ ] Run round-trip suite locally: `cargo test --features dev-fixtures --test codec_round_trip`
- [ ] Add `dev-fixtures` CI job (`.github/workflows/dev-fixtures.yml` or extension of `ci.yml`) (IFC-041, IFC-042)
- [ ] Cross-cutting review:
  - [ ] `reviewer-arch` (always)
  - [ ] `reviewer-infra` (Cargo manifest, justfile recipe, GitHub Actions workflow all changed)
  - [ ] `reviewer-security` (confirm dev bin and write-side deps absent from prod `tauri build`; inspect `cargo tree --no-default-features` for the `patient_manager_app` binary)
  - [ ] `reviewer-sql` — N/A (no migrations)
- [ ] Documentation update (`ARCHITECTURE.md` — add a short "Dev Fixtures (IFC)" subsection under Backend; `docs/todo.md` if any deferred items surface — entries in English)
- [ ] Spec check (`spec-checker`)
- [ ] Commit checkpoints (single PR — see PR Plan):
  - `feat(ifc): add dev-fixtures Cargo feature, dev binary, and Excel scenario builders`
  - `feat(ifc): commit Excel fixture artifacts (happy_path + parsing_issues)`
  - `test(ifc): add round-trip integration test and typed fixture access helper`
  - `ci(ifc): add dev-fixtures CI job and just regen-fixtures recipe`
  - `docs(ifc): document dev-fixtures tooling in ARCHITECTURE.md`

---

## 2. Detailed Implementation Plan

### Migrations

None. This feature does not touch the database (spec § Entity Definition).

---

### Backend

> All paths absolute from repo root. Every path below has been verified against the codebase.
> The contract type `ParsedExcelData` lives at `src-tauri/src/use_cases/excel_import/domain.rs` and is **not** modified (IFC-022).

#### Cargo manifest changes (`src-tauri/Cargo.toml`)

| Change                                                                                                                                                                              | Detail                                                                                                                                           | Rules            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| `[features]` add `dev-fixtures = ["dep:rust_xlsxwriter", "dep:zip"]` (or just `["dep:rust_xlsxwriter"]` — see writer recommendation below)                                          | Single feature gates the binary and every write-side dep. Co-existence with the existing `generate-bindings` feature is fine; both are dev-only. | IFC-011          |
| `[dependencies]` keep clean — write-side libs declared with `optional = true` and pulled in by the feature only. Example: `rust_xlsxwriter = { version = "0.x", optional = true }`. | Production `cargo build` (no features) MUST NOT pull `rust_xlsxwriter`. Verify with `cargo tree --no-default-features`.                          | IFC-013, IFC-024 |
| `[[bin]]` add new entry: `name = "generate_fixtures"`, `path = "src/bin/generate_fixtures.rs"`, `required-features = ["dev-fixtures"]`.                                             | Mirrors the existing `generate_bindings` bin pattern.                                                                                            | IFC-010, IFC-011 |

#### Excel xlsx writer — library decision

**Recommendation: `rust_xlsxwriter`** (current crate name on crates.io for `rust_xlsxwriter`, by John McNamara — author of the established Python `xlsxwriter`).

| Criterion                                                                       | `rust_xlsxwriter`                                                                                                                                                                                                                                                                                                                                 | `umya-spreadsheet`                                           | Verdict                                                                                                                                                             |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cell-level layout control (string vs. number, formulas, dates)                  | First-class — `worksheet.write_string`, `write_number`, `write_datetime`. Header row by row, exact column placement.                                                                                                                                                                                                                              | Higher-level model (whole document tree), more indirection.  | **`rust_xlsxwriter`** — the parser is sensitive to header text (`CAISSE`, `TARIF`, `DATE`, `Versé`, `En attente`) and column position; we need direct cell control. |
| Excel serial date emission (matches `convert_excel_date_to_iso` in `domain.rs`) | Has `ExcelDateTime` and `worksheet.write_datetime` → produces native serial-date cells.                                                                                                                                                                                                                                                           | Has date support but relies on its OOXML model abstractions. | **`rust_xlsxwriter`** — closer alignment with what calamine reads back.                                                                                             |
| Determinism knobs (zip mtime, sheet order)                                      | Sheet order is insertion order — deterministic. Zip entries default to `1980-01-01` (the OOXML convention) or library-set fixed time; verify with a hex dump and post-process if needed (rezip with fixed mtimes). The library has a `set_creation_time` / properties API that lets us pin the workbook's `dcterms:created` / `dcterms:modified`. | Less documented determinism story.                           | **`rust_xlsxwriter`** — combine its document-property setters with a post-processing rezip step if any field still varies.                                          |
| Maintenance & maturity                                                          | Actively maintained, mirrors a battle-tested Python lib.                                                                                                                                                                                                                                                                                          | Active but smaller ecosystem.                                | **`rust_xlsxwriter`**.                                                                                                                                              |
| Minimum dependency surface                                                      | Brings `zip`, `serde`, etc. — all dev-fixtures gated.                                                                                                                                                                                                                                                                                             | Heavier.                                                     | **`rust_xlsxwriter`**.                                                                                                                                              |

**Determinism plan (IFC-040)**:

1. Pin workbook properties (`set_creation_time`, `set_author`) to fixed values.
2. After write, if any zip-entry mtime is observed to vary across runs, rezip the file deterministically: read entries, rewrite with all `last_modified` set to a fixed epoch (e.g., `1980-01-01T00:00:00`), preserving entry order.
3. If a non-suppressible field remains (e.g., random GUIDs in workbook XML), **accept** non-determinism per IFC-040 fallback: rely on IFC-021's structural-equality property, never on byte equality of committed files.
4. The drift check (IFC-041) compares **bytes** — so steps 1+2 must be enough in practice. If not, the spec explicitly allows the byte-level guard to be effective only modulo the post-processing we apply; the round-trip test (IFC-051) is the load-bearing correctness check.

#### Dev binary skeleton — `src-tauri/src/bin/generate_fixtures.rs`

```
fn main() {
    // CLI parse:
    //   args[1] = surface  (required, currently only "excel")
    //   args[2] = scenario (optional; if absent, regenerate all scenarios for the surface)
    // Dispatch to surface module.
    // On unknown surface or scenario: print available list, exit 1.
}
```

The module the bin imports lives **inside the bin's own source tree**, not under `src/lib.rs`, to keep the codec data-only (IFC-025) and to keep all write-side logic out of the production crate's library. Suggested layout:

```
src-tauri/src/bin/generate_fixtures.rs        (entry point — CLI)
src-tauri/src/bin/fixtures_excel/mod.rs       (excel surface module)
src-tauri/src/bin/fixtures_excel/scenarios.rs (Rust functions returning ParsedExcelData)
src-tauri/src/bin/fixtures_excel/writer.rs    (ParsedExcelData → .xlsx file via rust_xlsxwriter)
src-tauri/src/bin/fixtures_excel/atomic.rs    (temp + rename helper, partial cleanup)
```

> Cargo allows binaries to have a sibling module tree — `src/bin/generate_fixtures.rs` plus a sibling `src/bin/generate_fixtures/` folder — but having a separate `fixtures_excel/` tree keeps the surface namespace explicit. Verify the `[[bin]]` entry's `path` resolves modules from a sibling dir; if not, place the helpers under `src/bin/generate_fixtures/` (Cargo's default for `path = "src/bin/generate_fixtures.rs"` does support a sibling directory of the same stem).

| Rule             | Implementation site                                                                                                                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IFC-010          | `[[bin]]` entry; default `cargo build` does not see this file because of `required-features`.                                                                                                                                            |
| IFC-012          | Two positional args: `surface` (required, exhaustive match on `"excel"` for now) + `scenario` (optional). Future surfaces extend the match without breaking existing callers.                                                            |
| IFC-013          | `rust_xlsxwriter` import lives only in `fixtures_excel/writer.rs`, which compiles only when `dev-fixtures` is enabled.                                                                                                                   |
| IFC-031, IFC-032 | `fixtures_excel/scenarios.rs`: `pub fn happy_path_3_patients_2_funds() -> ParsedExcelData` and `pub fn skipped_rows_invalid_dates() -> ParsedExcelData`. Plus a registry `pub fn all() -> Vec<(&'static str, fn() -> ParsedExcelData)>`. |
| IFC-034          | `atomic.rs` exposes `write_atomically(target: &Path, bytes: &[u8])` — writes to `target.with_extension("xlsx.tmp")` (or sibling `.tmp`), `fsync`, then `rename`. On `Err`, `remove_file` the temp path before propagating.               |
| IFC-030          | Output paths computed as `src-tauri/tests/fixtures/excel/{scenario_name}.xlsx` and `.expected.json`. Both written atomically. JSON is `serde_json::to_string_pretty(&parsed_excel_data)` so reviewer audits stay readable.               |
| IFC-040          | Determinism config lives in `writer.rs` (workbook properties pinned) plus a final rezip pass in `atomic.rs` if needed.                                                                                                                   |

#### Scenario expectations vs. what the writer emits (IFC-021 round-trip)

For every scenario, the builder declares the **expected** `ParsedExcelData` — **including** `parsing_issues`. The writer must produce a workbook that, when re-parsed by `ExcelParserService::parse_excel`, yields the same value, byte-for-byte at the contract level.

- **`happy_path_3_patients_2_funds`** (IFC-032 #1):
  - 3 entries on `Patiente` sheet, 2 on `Secu`, ≥1 monthly sheet (e.g. `Mars` or `Mars`).
  - All rows valid → `parsing_issues.skipped_rows = []`, `parsing_issues.missing_sheets = []`.
  - Tests cover headers `CAISSE / TARIF / DATE / T / REMBSE / Versé / En attente` (parser ColIdx detection).
  - **Session-scoped UUIDs (IFC-021 carve-out)**: the parser generates fresh `Uuid::new_v4()` for `procedure_type_tmp_id` on each `ExcelProcedure` and for `temp_id` on each `ExcelPatient` / `ExcelFund` (`parser.rs` lines 153–164). Per EXI R5 these are session-scoped, never persisted. IFC-021 explicitly excludes them from the round-trip equality. The test compares only durable fields; no normalization, no deterministic placeholder.

- **`skipped_rows_invalid_dates`** (IFC-032 #2):
  - Monthly sheet contains rows with: empty patient name (skipped per EXI R2), invalid SSN (skipped per EXI R3), missing date.
  - Builder declares the expected `parsing_issues.skipped_rows` with `(sheet, row_number, reason)` triples that match what the parser will emit.
  - Round-trip equality verifies the parser produced exactly those skipped rows — no more, no less. This is the rule that makes the test non-trivial (per spec § IFC-021 rationale).

#### Round-trip integration test — `src-tauri/tests/codec_round_trip.rs`

```
#![cfg(feature = "dev-fixtures")]

mod fixtures;  // typed access helper (IFC-050)

#[tokio::test]
async fn excel_happy_path_round_trips() { ... }

#[tokio::test]
async fn excel_skipped_rows_invalid_dates_round_trips() { ... }
```

- Calls `patient_manager_app::use_cases::excel_import::parser::ExcelParserService::parse_excel(path)` — verified `pub` and async, callable from `tests/` via the lib.
- Loads the expected value via `fixtures::excel::happy_path()` etc., which returns `(PathBuf, ParsedExcelData)` (IFC-050).
- Asserts structural equality on durable fields per IFC-021 — including `parsing_issues`, excluding `procedure_type_tmp_id` and `temp_id` (the session-scoped UUID carve-out). Implementation: compare via a custom equality helper that ignores those three fields, or strip them in-place before `assert_eq!`.

Test file location: `src-tauri/tests/codec_round_trip.rs` plus `src-tauri/tests/fixtures/mod.rs` (helper) — **do not** confuse with `src-tauri/tests/fixtures/excel/` (the data files). To keep them separate, put the helper at `src-tauri/tests/fixtures_helper.rs` or use a `common/` folder convention. **Recommended**: `src-tauri/tests/common/fixtures.rs` + `src-tauri/tests/common/mod.rs`, imported with `mod common;` in `codec_round_trip.rs`. The data files stay at `src-tauri/tests/fixtures/excel/` and are discovered at runtime by the helper.

#### Justfile recipe — `justfile`

Add (alongside existing `generate-types`):

```
# Regenerate import fixtures for all surfaces (or just one if SURFACE/SCENARIO given)
regen-fixtures *ARGS:
    cd src-tauri && cargo run --features dev-fixtures --bin generate_fixtures -- {{ARGS}}
```

Argument forwarding via `*ARGS` lets `just regen-fixtures excel` and `just regen-fixtures excel happy_path_3_patients_2_funds` both work (IFC-012, IFC-033).

#### CI workflow — `.github/workflows/dev-fixtures.yml` (new)

Decision: **separate workflow file**, not extending `ci.yml`. Reasons:

1. Lets us scope the trigger to relevant paths only (the dev-fixtures suite is heavier than the `cargo test --lib` job).
2. Keeps the standard `backend` job lean, per IFC-042 ("standard `cargo test` job MUST NOT enable the dev-fixtures feature").

Trigger: `pull_request` on paths `src-tauri/src/bin/**`, `src-tauri/tests/**`, `src-tauri/Cargo.toml`, `.github/workflows/dev-fixtures.yml`, `justfile`. (Push to main optional — keep simple, PR-only matches the existing CI policy.)

Job steps:

1. Checkout, install Linux deps (mirroring `ci.yml`'s `backend` job), setup Rust, cache.
2. `cd src-tauri && cargo run --features dev-fixtures --bin generate_fixtures -- excel` (regenerates all Excel scenarios).
3. `git diff --exit-code src-tauri/tests/fixtures/` — drift guard (IFC-041). Non-zero diff fails the job.
4. `cd src-tauri && cargo test --features dev-fixtures --test codec_round_trip` — round-trip suite (IFC-051).

Both behaviors run **in sequence** in the **same job**, per IFC-042. Standard `ci.yml` `backend` job is **unchanged** and continues to run `cargo test --lib` (no `--features`).

#### Production-build verification (IFC-013, IFC-024)

After implementation, in the workflow taskList "Confirm production build is unaffected" step, run:

```
cd src-tauri && cargo tree --no-default-features --target-dir /tmp/ifc-check | grep -E "rust_xlsxwriter|zip" || echo "OK: write-side deps absent from prod"
```

Expected: `OK` line printed. Captured by `reviewer-security`.

---

### Frontend

**No-op — explicitly.** This feature has no frontend slice. Specifically:

- No new file under `src/features/`.
- No new entry in `src/bindings.ts` (no Tauri command registered, so Specta has nothing to add).
- No i18n strings.
- No visual proof. PR body must contain: `No visual impact — Rust-only dev tooling change.`

If a future spec extension adds a fund-PDF or bank-PDF surface, that extension may or may not introduce a frontend slice (still unlikely — these are dev tools).

---

### Rules Coverage

| Rule    | Theme            | Implementation site                                                                                                                                         | Notes                                                                                                                                |
| ------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| IFC-010 | Tool surface     | `src-tauri/Cargo.toml` `[[bin]]` + `required-features = ["dev-fixtures"]`; `src-tauri/src/bin/generate_fixtures.rs`                                         | Default `cargo build` skips it.                                                                                                      |
| IFC-011 | Tool surface     | `src-tauri/Cargo.toml` `[features]` `dev-fixtures = [...]`                                                                                                  | Single feature gates bin + all write-side deps.                                                                                      |
| IFC-012 | Tool surface     | `src-tauri/src/bin/generate_fixtures.rs` arg parsing                                                                                                        | Two positional args; surface arg uses an exhaustive match.                                                                           |
| IFC-013 | Tool surface     | `src-tauri/Cargo.toml` `[dependencies]` keeps `optional = true` for write-side libs; verified via `cargo tree --no-default-features`                        | Reviewed by `reviewer-security`.                                                                                                     |
| IFC-020 | Codec contract   | `src-tauri/src/use_cases/excel_import/domain.rs` (unchanged — `ParsedExcelData`)                                                                            | Production-side contract; both consumers depend on it.                                                                               |
| IFC-021 | Codec contract   | `src-tauri/tests/codec_round_trip.rs`                                                                                                                       | Structural equality on durable fields per IFC-021's carve-out (excludes session-scoped `*_tmp_id` UUIDs, includes `parsing_issues`). |
| IFC-022 | Codec contract   | **Verification only**: `git diff src-tauri/src/use_cases/excel_import/parser.rs domain.rs` must show no changes. Enforced by `reviewer-backend` if it runs. | Hard rule.                                                                                                                           |
| IFC-023 | Codec contract   | `src-tauri/src/bin/fixtures_excel/` is self-contained; future surfaces add sibling `fixtures_fund_pdf/`, etc.                                               | No shared abstraction.                                                                                                               |
| IFC-024 | Codec contract   | Contract type stays in `src/use_cases/excel_import/domain.rs` (no feature gate). Generator depends on it.                                                   | Production-code rule.                                                                                                                |
| IFC-025 | Codec contract   | `domain.rs` remains data-only. Layout/positioning logic lives in `bin/fixtures_excel/writer.rs`.                                                            | Hard rule.                                                                                                                           |
| IFC-030 | Fixture set      | `src-tauri/tests/fixtures/excel/{scenario}.xlsx` + `{scenario}.expected.json`, both committed.                                                              | Output dir created on first run.                                                                                                     |
| IFC-031 | Fixture set      | `src-tauri/src/bin/fixtures_excel/scenarios.rs` — Rust fns returning `ParsedExcelData`, `snake_case` names.                                                 | Registry function for enumeration.                                                                                                   |
| IFC-032 | Fixture set      | Two scenarios: `happy_path_3_patients_2_funds`, `skipped_rows_invalid_dates`.                                                                               | Non-empty parsing_issues for the second.                                                                                             |
| IFC-033 | Fixture set      | `justfile` recipe `regen-fixtures *ARGS`.                                                                                                                   | Argument forwarding.                                                                                                                 |
| IFC-034 | Fixture set      | `src-tauri/src/bin/fixtures_excel/atomic.rs` — temp + rename + cleanup-on-fail.                                                                             | Both `.xlsx` and `.expected.json` go through it.                                                                                     |
| IFC-040 | Determinism      | `writer.rs` pins workbook properties; optional rezip pass with fixed mtimes; fallback documented.                                                           | Round-trip test is the load-bearing correctness check.                                                                               |
| IFC-041 | Determinism      | `.github/workflows/dev-fixtures.yml` step 3: `git diff --exit-code src-tauri/tests/fixtures/`.                                                              | Catches drift and hand-edits.                                                                                                        |
| IFC-042 | Determinism      | `.github/workflows/dev-fixtures.yml` runs regen+drift then round-trip in one job. `ci.yml` `backend` job unchanged.                                         | Standard CI stays fast.                                                                                                              |
| IFC-050 | Test consumption | `src-tauri/tests/common/fixtures.rs` (new) — `pub fn happy_path() -> (PathBuf, ParsedExcelData)`, etc.                                                      | Imported via `mod common;`.                                                                                                          |
| IFC-051 | Test consumption | `src-tauri/tests/codec_round_trip.rs` — `#![cfg(feature = "dev-fixtures")]` at the top.                                                                     | One `#[tokio::test]` per scenario.                                                                                                   |

---

## 3. PR Plan

- **Strategy**: **1 PR** (BE-only, no UI slice, single thematic change).
- **Estimate**:
  - BE: ~10 files / ~500 LOC (Cargo.toml diff, bin entry + 3–4 module files, scenarios, writer, atomic helper, fixture-access helper, round-trip test, justfile diff, GitHub Actions workflow file). 2 binary fixture files + 2 JSON snapshots committed.
  - FE: 0 files / 0 LOC.
  - Coupling: tight — the dev binary, the scenario builders, the committed fixtures, the round-trip test, and the CI job all reference each other and only land coherently together.
- **PR list**:
  - **PR #1** — `feat(ifc): import fixture codec — Excel pilot`
    - **Scope**: every Workflow TaskList checkpoint above (Phase 2 backend + closure).
    - **Dependency**: none — branches off `main`.
    - **Branch suffix**: `feat/ifc-import-fixture-codec`
    - **Body must include**: `No visual impact — Rust-only dev tooling change.` (per CLAUDE.md visual-proof rule).

---

## Notes for the next gate

- **Mandatory next step**: `plan-reviewer` agent reviews this plan. Block on critical findings before any test-writer subagent runs.
- **UUID handling resolved at spec level**: IFC-021 was amended to exclude session-scoped `procedure_type_tmp_id` and `temp_id` from the round-trip equality (per EXI R5 — these fields are never persisted). The plan's round-trip test compares only durable fields. No further open decision.
- **Library version pin**: pick the latest stable `rust_xlsxwriter` at implementation time (currently `0.x` — let `test-writer-backend` lock the exact patch version when the Cargo entry is added).
- **No contract-reviewer**: skipping `/contract` was a deliberate decision after spec-reviewer; do not regenerate this thread's contract step.

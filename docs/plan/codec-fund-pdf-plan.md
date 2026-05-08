# Implementation Plan — Import Fixture Codec, fund-PDF surface (IFC-060..IFC-065)

> **Source spec**: [`docs/spec/import-codec-fixtures.md`](../spec/import-codec-fixtures.md) — Fund-Payment-Reconciliation PDF Surface section (IFC-060..IFC-065). Surface-agnostic rules IFC-010..IFC-051 still govern.
> **Trigram**: IFC (already registered in `docs/spec-index.md`; no new entry).
> **Contract**: intentionally absent. Same shape as the IFC pilot (PR #12, merged): no Tauri commands added, no IPC boundary, no new Specta type, no domain entity, no state transition. The contract type is the existing `PdfParseResult` already produced by `parse_pdf_text`. `/contract` is not run; validate against the spec only.

---

## At a glance

- **Phase 1 — Spec/Plan**: this document. Hand off to `plan-reviewer` next. No contract step.
- **Phase 2 — Backend (substantive)**:
  1. Move `PdfParseResult` + `PdfProcedureGroup` + `NormalizedPdfLine` from `api.rs` to a new `fund_pdf_codec.rs`; re-export from `api.rs` so the Specta surface and every existing import stay untouched.
  2. Promote data-mapping literals into codec constants; the existing parser regex patterns are rebuilt at module-init using those constants (`once_cell`/`std::sync::LazyLock`).
  3. Extend the `generate_fixtures` binary with a `fund-pdf` surface arm: scenario builders + a printpdf-backed writer that emits a `.pdf` whose `pdf-extract` text round-trips through the parser.
  4. Two scenarios per IFC-062: multi-fund happy path (two `Total réglé le` blocks, one period date range) + unparsed-line scenario (declared `unparsed_lines` content).
  5. Sibling `tests/fixtures/fund-pdf/{scenario}.pdf` + `{scenario}.expected.json` artifacts under `src-tauri/tests/fixtures/fund-pdf/`.
  6. Round-trip test file: **new sibling `src-tauri/tests/codec_round_trip_fund_pdf.rs`** (separate test binary, mirrors Excel layout one-file-per-surface).
  7. Extend `src-tauri/tests/common/fixtures.rs` with `pub mod fund_pdf { ... }`.
  8. Extend `.github/workflows/dev-fixtures.yml`: add the `fund-pdf` regen step, change drift step to use the `:(exclude)*.pdf` pathspec, add the new round-trip test invocation, and extend the `paths:` triggers.
- **Phase 3 — Frontend**: **NO-OP**. No UI, no gateway, no Specta types regenerated (the move is pure-Rust and `pub use`-exported; bindings stay byte-equivalent). Skip every `frontend-*` checkpoint.
- **Phase 4 — Review/Closure**: `reviewer-arch` always; `reviewer-infra` (Cargo build wiring? — no Cargo deps change, but workflow + justfile change) and `reviewer-security` (verify production `tauri build` still does NOT link `printpdf` for any new reason — it already does for FPR, no new exposure). `reviewer-backend` runs because `pdf_parser.rs` and `api.rs` (production source) are touched (codec move + literal-to-constant promotion).
- **E2E**: not applicable.
- **PR strategy**: 1 PR, BE-only, mirroring PR #12.
- **Highest implementation risk**: PDF text extraction round-trip — `printpdf` 0.9 emits ToUnicode CMaps that `lopdf 0.39` cannot parse (already documented in FPR's `renderer.rs:62-65`). `pdf-extract` 0.10 is a separate parser with its own CMap support; it MUST be probed early before committing to printpdf for the writer. See "Risk: text extraction feasibility" below.

---

## 1. Workflow TaskList (synthetic — derived from CLAUDE.md)

- [ ] Review architecture & rules (`ARCHITECTURE.md`, `docs/backend-rules.md`)
- [ ] Inspect existing parser + extractor (`pdf_parser::parse_pdf_text`, `pdf_extractor::extract_pdf_text`) and confirm they remain callable from `tests/` (lib already exposes them through `use_cases::fund_payment_reconciliation::api::*`)
- [x] **Spike (PASSED 2026-05-08)**: `printpdf 0.9` + embedded Roboto-Regular + `pdf_extract::extract_text` round-trips every fund-PDF special character: `é`, `è`, `à`, `ï`, `ô`, `ê`, `°` (in `n° 931`), `€`, `/`, `,`, plus all compound markers (`Total réglé le `, `par`, `au`, ` €`) and patient names. Top-down emission order is preserved. **Line-index layout discovered**: `pdf-extract` emits **two leading blank lines** plus **one blank separator between each emitted text line** — scenario builders MUST declare `NormalizedPdfLine.line_index` at indices 2, 4, 6, … (first non-blank line at index 2). This is deterministic and locks the scenario index values for IFC-061's full-equality round-trip. Mitigation tree (font swap, coordinate positioning, ASCII surrogate fallback) was never needed; IFC-065 reuse decision stands. PR body must reproduce this finding.
- [ ] Database migration — **N/A** (no schema change)
- [ ] Backend test stubs (`test-writer-backend` — round-trip integration test stubs written, red confirmed). No contract; tests are derived directly from spec rules IFC-061, IFC-062 (and IFC-051 for the gating). No `modified_functions` list — the `pdf_parser.rs` modification is purely a literal-to-constant refactor (still covered by its existing inline `#[cfg(test)] mod tests` block, which runs unchanged after the refactor and forms the regression net for IFC-063).
- [ ] Backend implementation — minimal, only what is required to make the failing tests pass. No additional methods, no defensive code, no anticipation of future surfaces (bank-PDF is out of scope).
  - [ ] **Codec move (IFC-060)**: create `src-tauri/src/use_cases/fund_payment_reconciliation/fund_pdf_codec.rs`. Move `NormalizedPdfLine`, `PdfProcedureGroup`, `PdfParseResult` from `api.rs:18-74` into the new file (with their `#[derive(Debug, Clone, ...)]`, `#[serde]`, `#[specta]` attributes intact). Add `pub use fund_pdf_codec::{NormalizedPdfLine, PdfProcedureGroup, PdfParseResult};` at the top of `api.rs` so every existing internal import (`service.rs`, `output/candidate_grouper.rs`, `output/csv_exporter.rs`, `data/pool_builder.rs`, `data/fund_cache.rs`, `reconciliation/perfect_match_checker.rs`, `parsing/pdf_parser.rs:4-6`) and every external Tauri caller continues to resolve unchanged. Wire the new module in `mod.rs` next to `parsing` (`pub mod fund_pdf_codec;`). **Specta byte-equivalence verification** is a checklist item below.
  - [ ] **Codec data-mapping constants (IFC-060, IFC-063)**: in `fund_pdf_codec.rs`, declare these `pub const`s — names exactly as listed:
    - `TOTAL_LINE_PREFIX: &str = "Total réglé le "` (the parser's literal opening marker)
    - `TOTAL_LINE_SEPARATOR: &str = " par "`
    - `TOTAL_LINE_FUND_NUMBER_OPEN: &str = "(n° "`
    - `TOTAL_LINE_FUND_NUMBER_CLOSE: &str = ")"`
    - `DATE_RANGE_SEPARATOR: &str = " au "`
    - `CURRENCY_SUFFIX: &str = "€"` (the suffix after the amount; the parser tolerates a trailing space/whitespace)
      These are _data-mapping_ strings only. Validation regex patterns, the `unparsed-line` length threshold (`> 30`), the unparsed-sample cap (`5`), and any parser-emitted strings stay inline in `pdf_parser.rs` per IFC-063.
  - [ ] **Parser regex rebuilt from constants (IFC-063 — promotion only, no semantic change)**: in `pdf_parser.rs`, replace the literal occurrences of `" par "`, `"(n°"`, `")"`, `" au "`, `"Total réglé le "`, `"€"` _inside_ `DATA_LINE_PATTERN` and `TOTAL_LINE_PATTERN` with `format!`/`concat!` constructed at first use, sourced from the codec constants. Use `std::sync::LazyLock<Regex>` (Rust 1.80+, project uses 1.90 per Cargo.toml) so the pattern is built once and reused. Patterns themselves (regex shapes — `\d{2}/\d{2}/\d{4}`, `\d{13}`, `[A-Z]{1,4}`, etc.) STAY inline; only the literal text fragments come from the codec. The existing inline `#[cfg(test)] mod tests` block in `pdf_parser.rs` (10 tests, all of which currently pass) is the regression net — none of them must change behavior.
  - [ ] **Codec move (IFC-061 — round-trip via extracted text)**: implementation of the round-trip itself is the test; this checkbox is the dev-binary part:
    - [ ] **Dev-binary extension (IFC-012)**: in `src-tauri/src/bin/generate_fixtures.rs`, add `mod fixtures_fund_pdf;` next to `mod fixtures_excel;`. Extend the surface match arm: `"fund-pdf" => fixtures_fund_pdf::regenerate(&out_root, scenario)`. Update the `print_usage` string to list `fund-pdf`.
    - [ ] **Scenario builders (IFC-031, IFC-062)**: `src-tauri/src/bin/fixtures_fund_pdf/scenarios.rs` exporting two `pub fn`s returning `PdfParseResult` literals — see "Scenarios design" below.
    - [ ] **PDF writer (IFC-064, IFC-065)**: `src-tauri/src/bin/fixtures_fund_pdf/writer.rs` using `printpdf` (already a prod dep — `Cargo.toml:56`, no Cargo change). One `printpdf` `Op::ShowText` per data line and per total line; y-cursor decreases monotonically so `pdf-extract` recovers lines in document order. Roboto-Regular embedded — reuse the same TTF the FPR renderer embeds (`src-tauri/resources/fonts/Roboto-Regular.ttf`) by direct `include_bytes!` from the same path. **Determinism not required (IFC-064)** — no need to pin metadata; the committed `.pdf` is inspection-only.
    - [ ] **Atomic write (IFC-034)**: same temp+rename pattern as `bin/fixtures_excel/writer.rs:atomic_save`. Ship a small helper next to the writer or factor a tiny shared module under `bin/fixtures_common/atomic.rs` ONLY if both surfaces would otherwise duplicate non-trivial code. **Decision**: copy the helper inline (≤30 lines). Per IFC-023 the two surfaces share NO traits/helpers/constants — but a private dev-binary atomic-write helper that touches no codec/parser state is not a codec abstraction; still, to honor the spec's spirit, we duplicate. (Plan-reviewer to confirm.)
    - [ ] **Sibling JSON snapshot (IFC-030)**: `{scenario}.expected.json` written from `serde_json::to_string_pretty(&PdfParseResult)`, same shape as Excel surface.
    - [ ] **Output directory**: `src-tauri/tests/fixtures/fund-pdf/`. Created on first run by `std::fs::create_dir_all` in the regenerate fn.
  - [ ] **Typed fixture access helper (IFC-050)**: extend `src-tauri/tests/common/fixtures.rs` with a new `pub mod fund_pdf` containing `happy_path_multi_fund() -> (PathBuf, PdfParseResult)` and `unparsed_line_scenario() -> (PathBuf, PdfParseResult)` (exact scenario names locked in "Scenarios design" below). Imports `PdfParseResult` from `patient_manager_app::use_cases::fund_payment_reconciliation::api::PdfParseResult` (the re-export keeps this path unchanged).
  - [ ] **Round-trip integration test (IFC-051, IFC-061)**: new file `src-tauri/tests/codec_round_trip_fund_pdf.rs`. Two `#[tokio::test]` functions; both `#![cfg(feature = "dev-fixtures")]`. Each:
    1. Loads `(pdf_path, expected: PdfParseResult)` from the helper.
    2. Calls `pdf_extractor::extract_pdf_text(pdf_path)` (currently `pub use`-exported through `parsing::pdf_extractor`; verify path before writing the test). If the public path is not exposed, prefer reading the bytes and calling the public Tauri-handler-equivalent function via `extract_pdf_text_from_bytes` which is callable through the lib. **Action**: confirm at test-writing time which symbol path is `pub` (one of `parsing::extract_pdf_text` per `parsing/mod.rs:7`, or the Tauri handler `api::extract_pdf_text` which wraps it).
    3. Calls `pdf_parser::parse_pdf_text(&extracted)` — produces a `PdfParseResult`.
    4. Asserts **full structural equality** on every field — no carve-outs (IFC-061 explicit). Use `assert_eq!` directly if `PdfParseResult` derives `PartialEq`; **today it does not** (verified at `api.rs:66`). Two options:
       - **Option A (preferred, smallest diff)**: derive `PartialEq` on `PdfParseResult`, `PdfProcedureGroup`, `NormalizedPdfLine` in `fund_pdf_codec.rs` after the move. `NormalizedPdfLine` already has `PartialEq` (`api.rs:18`); `PdfProcedureGroup` and `PdfParseResult` need it added. This is permitted under IFC-063 because adding a derive macro does NOT alter the parser's behavior and does NOT change the shape of the type for serde/specta consumers (TS bindings only encode field structure).
       - **Option B**: serialize both sides to `serde_json::Value` and `assert_eq!` on the JSON tree (mirrors the Excel approach in `tests/codec_round_trip.rs:88-120`).
         Plan-reviewer to confirm. **Recommendation**: Option A — simpler, type-safe, exactly matches the spec language ("full structural equality"). Spec-checker can verify via the diff.
- [ ] `just format`
- [ ] **Specta byte-equivalence verification (codec move guard)**: run `just generate-types` BEFORE the move, save `src/bindings.ts` to a backup, run `just generate-types` AFTER the move (and after the codec data-mapping refactor). `diff` MUST be empty. Capture the diff result in the PR body. _(This step exists because the move adds a `pub use` re-export from `api.rs`; Specta walks the actual type definitions, but the discovery point is the `#[specta::specta]`-annotated Tauri command return type — `parse_pdf_text` returns `PdfParseResult`, which Specta resolves through the re-export. The expected diff is empty.)_
- [ ] Confirm production build is unaffected: `cd src-tauri && cargo check --no-default-features` succeeds; `cargo build --release` is unchanged in linkage. (No new prod deps; only the dev binary gains a module.)
- [ ] Backend review (`reviewer-backend`) — **required**: `pdf_parser.rs`, `api.rs`, and `mod.rs` (under `use_cases/fund_payment_reconciliation/`) are production source. Reviewer asserts IFC-063 compliance (only data-mapping literals promoted; regex/threshold/sample-cap stay inline) and that `parse_pdf_text` semantics are unchanged (the existing 10 tests still pass).
- [ ] Type synchronization (`just generate-types`) — **MANDATORY** as a guard, even though the diff must be empty. (See "Specta byte-equivalence verification" above. If the diff is non-empty, STOP and investigate — the move broke the public type surface.)
- [ ] Compilation fixup — **SKIPPED** (no bindings change expected; if any, treat as a regression and fix the codec move).
- [ ] `just check` — Rust/format clean.
- [ ] Frontend test stubs — **SKIPPED** (no FE).
- [ ] Frontend implementation — **SKIPPED**.
- [ ] Visual proof — **SKIPPED**. PR body must contain: `No visual impact — Rust-only dev tooling change.`
- [ ] Frontend review — **SKIPPED**.
- [ ] E2E tests — **SKIPPED**.
- [ ] Generate the committed fixture set: `just regen-fixtures fund-pdf` (produces `tests/fixtures/fund-pdf/*.pdf` + `*.expected.json`).
- [ ] Run round-trip suite locally:
  - `cargo test --features dev-fixtures --test codec_round_trip` (Excel — must still pass; regression net for the codec move)
  - `cargo test --features dev-fixtures --test codec_round_trip_fund_pdf` (new fund-PDF suite)
- [ ] Extend `dev-fixtures` CI job (`.github/workflows/dev-fixtures.yml`):
  - Trigger `paths:` add `src-tauri/src/bin/fixtures_fund_pdf/**`, `src-tauri/src/use_cases/fund_payment_reconciliation/**`, `src-tauri/tests/codec_round_trip_fund_pdf.rs`.
  - Add a regen step: `cargo run --features dev-fixtures --bin generate_fixtures -- fund-pdf`.
  - Replace the drift step with: `git diff --exit-code src-tauri/tests/fixtures/ -- ':(exclude)*.pdf'` (IFC-041's pathspec exclusion clause; IFC-064 mandates `*.pdf` is excluded; `*.expected.json` and every Excel artifact remain covered).
  - Add a round-trip step: `cargo test --features dev-fixtures --test codec_round_trip_fund_pdf`.
- [ ] Cross-cutting review:
  - [ ] `reviewer-arch` (always)
  - [ ] `reviewer-infra` (workflow file modified, justfile unchanged this round)
  - [ ] `reviewer-security` — confirm dev-fixtures gating still excludes the new module from `tauri build` (no new prod deps; `printpdf` was already prod since FPR; `pdf-extract` was already prod for the parser). The new dev-binary module is feature-gated through the existing `[[bin]] required-features = ["dev-fixtures"]`.
  - [ ] `reviewer-sql` — N/A (no migrations).
- [ ] Documentation update:
  - `ARCHITECTURE.md` — update the existing "Dev Binaries → Import codec pattern (`generate_fixtures`)" subsection to mention fund-PDF as the second supported surface, with a one-line pointer to `fund_pdf_codec.rs` and the round-trip test path. Update the surface-coverage sentence ("Currently covered: **Excel** ...") to add **Fund-PDF**.
  - `docs/todo.md` — add an entry only if a deferred item surfaces (e.g., "bank-PDF surface — IFC-100..; spec extension pending"); entry in English. Likely no entry needed.
- [ ] Spec check (`spec-checker`).
- [ ] Commit checkpoints (single PR — see PR Plan):
  - `refactor(fpr): move PdfParseResult into fund_pdf_codec; promote data-mapping literals (IFC-060, IFC-063)`
  - `feat(ifc): add fund-pdf surface to generate_fixtures binary with two scenarios (IFC-062)`
  - `test(ifc): add fund-pdf round-trip test and typed fixture helper (IFC-051, IFC-061)`
  - `ci(ifc): extend dev-fixtures workflow for fund-pdf with pdf-exclusion drift pathspec (IFC-041, IFC-064)`
  - `docs(ifc): document fund-pdf surface in ARCHITECTURE.md`

---

## 2. Detailed Implementation Plan

### Migrations

None. This feature does not touch the database (spec § Entity Definition; no IFC-060.. rule mentions schema).

---

### Backend

> All paths absolute from repo root. Every path below has been verified against the codebase.
> No production-API surface change: every type still resolves under `patient_manager_app::use_cases::fund_payment_reconciliation::api::*` after the move.

#### Codec move — `src-tauri/src/use_cases/fund_payment_reconciliation/fund_pdf_codec.rs` (NEW)

Owns:

- `pub struct NormalizedPdfLine` — moved verbatim from `api.rs:18-45`.
- `pub struct PdfProcedureGroup` — moved verbatim from `api.rs:47-63`. Add `PartialEq` to the derive list (it currently has `Debug, Clone, Serialize, Deserialize, Type`).
- `pub struct PdfParseResult` — moved verbatim from `api.rs:65-74`. Add `PartialEq` to the derive list.
- The data-mapping constants listed under IFC-060/IFC-063 above (`TOTAL_LINE_PREFIX`, `TOTAL_LINE_SEPARATOR`, `TOTAL_LINE_FUND_NUMBER_OPEN`, `TOTAL_LINE_FUND_NUMBER_CLOSE`, `DATE_RANGE_SEPARATOR`, `CURRENCY_SUFFIX`).

Wired in `src-tauri/src/use_cases/fund_payment_reconciliation/mod.rs:9-13` by adding `pub mod fund_pdf_codec;` next to the existing `pub mod parsing;`.

Re-exported from `api.rs` (insert near line 18, before the bulk of definitions):

```rust
pub use super::fund_pdf_codec::{NormalizedPdfLine, PdfParseResult, PdfProcedureGroup};
```

This means every `use ...api::{NormalizedPdfLine, PdfProcedureGroup, PdfParseResult}` import (verified call-sites: `service.rs:9`, `parsing/pdf_parser.rs:4`, `output/candidate_grouper.rs:3`, `output/csv_exporter.rs:208`, `data/pool_builder.rs:4` and `:125`, `data/fund_cache.rs:4` and `:102`, `reconciliation/perfect_match_checker.rs:3`) continues to resolve. **No call site is touched.** Specta walks types from the Tauri command return — `parse_pdf_text(text) -> PdfParseResult` — and `PdfParseResult` resolves to the new file via the re-export; the generated `bindings.ts` block for these three types is byte-equivalent.

| Rule                | Implementation site                                                                                                                                                                           | Notes                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| IFC-060             | `fund_pdf_codec.rs` (new) — types + constants                                                                                                                                                 | Independent sibling of `excel_codec.rs`; no shared abstraction.                                                    |
| IFC-063 (move part) | The move itself                                                                                                                                                                               | Production parser semantics unchanged.                                                                             |
| IFC-023             | The codec is a sibling module of `excel_codec.rs` (one under `excel_import/`, one under `fund_payment_reconciliation/`). They share no `use` statements, no traits, no helpers, no constants. | The dev-binary's atomic-write helper is duplicated in each surface's writer module to honor the spirit of IFC-023. |

#### Parser refactor — `src-tauri/src/use_cases/fund_payment_reconciliation/parsing/pdf_parser.rs`

Affected literals (current locations):

- `pdf_parser.rs:18` — `DATA_LINE_PATTERN: &str = r"...\d{2}/\d{2}/\d{4}(?:\s+au\s+\d{2}/\d{2}/\d{4})?...€?..."` — contains `" au "` (the `DATE_RANGE_SEPARATOR`) and the optional `€` suffix.
- `pdf_parser.rs:82` — `TOTAL_LINE_PATTERN: &str = r"^Total réglé le (...)\s+par\s+(...)(?:\(n°\s*(\d+)\s*\))?...€?..."` — contains `Total réglé le `, `par`, `(n°` (and trailing `)`), `€`.

Refactor strategy:

- Convert both `const &str` patterns to `LazyLock<Regex>` built from a `format!` that interpolates the codec constants. Example sketch (illustrative, not load-bearing — actual implementation must escape regex meta-chars in the codec strings before interpolation; only `(` and `)` from `TOTAL_LINE_FUND_NUMBER_OPEN`/`CLOSE` need escaping, and a one-line `regex::escape` call handles it):
  ```rust
  static TOTAL_LINE_RE: LazyLock<Regex> = LazyLock::new(|| {
      let prefix = regex::escape(codec::TOTAL_LINE_PREFIX);
      let separator = regex::escape(codec::TOTAL_LINE_SEPARATOR);
      let open = regex::escape(codec::TOTAL_LINE_FUND_NUMBER_OPEN);
      let close = regex::escape(codec::TOTAL_LINE_FUND_NUMBER_CLOSE);
      let pattern = format!(
          r"^{prefix}(\d{{2}}/\d{{2}}/\d{{4}})\s+{separator}\s*(.+?)\s*(?:{open}\s*(\d+)\s*{close})?\s+([\d\s]+,\d{{2}})\s*€?\s*$"
      );
      Regex::new(&pattern).expect("total line regex must compile")
  });
  ```
- Same treatment for `DATA_LINE_PATTERN` (interpolating `DATE_RANGE_SEPARATOR` for `\s+au\s+`).
- The hardcoded `\s+par\s+` in the existing pattern _includes whitespace anchors around_ the codec separator `" par "`. That is deliberate parser-side normalization (handles arbitrary whitespace between fund name and "par"). We preserve it: the codec exposes the separator without surrounding `\s+`, and the parser re-adds the regex `\s+...\s+` framing. This is acceptable under IFC-063 — the codec carries the separator literal; the regex shape stays in the parser.

What stays inline (per IFC-063, NOT promoted):

- The `30` length threshold at `pdf_parser.rs:163` — heuristic filter.
- The `5` unparsed-sample cap at `pdf_parser.rs:166` — heuristic filter.
- The validation patterns themselves (`\d{13}`, `[A-Z]{1,4}`, `\d{2}/\d{2}/\d{4}`) — validation patterns.
- `derive_fund_label`'s `format!("n° {fund_num}")` at `pdf_parser.rs:112` — this is a parser-side reconstruction of the displayed label, NOT a document-data-mapping literal; it stays. (Plan-reviewer: consider whether this should be promoted; current reading is "the codec exposes `(n° ` and `)` separately, and how the parser reconstructs the embedded `n° NNN` from those is a parser internal".)
- Skip-reason prefixes — none here; this parser does not emit `SkippedRow`.

Existing inline test block (`pdf_parser.rs:239-378`, 10 tests) is the regression net. None must be touched.

| Rule             | Implementation site                                                   | Notes                                       |
| ---------------- | --------------------------------------------------------------------- | ------------------------------------------- |
| IFC-063          | `pdf_parser.rs` regex rebuilt from codec constants via `LazyLock`     | Promotion only; parser semantics unchanged. |
| IFC-022 (analog) | The existing inline tests in `pdf_parser.rs` still pass byte-for-byte | Hard regression net.                        |

#### Dev binary — `src-tauri/src/bin/generate_fixtures.rs`

Modify (current state at `generate_fixtures.rs:13` declares `mod fixtures_excel;`):

```rust
mod fixtures_excel;
mod fixtures_fund_pdf;  // NEW
```

Modify the surface match (currently `generate_fixtures.rs:47-53`):

```rust
match surface {
    "excel" => fixtures_excel::regenerate(&out_root, scenario),
    "fund-pdf" => fixtures_fund_pdf::regenerate(&out_root, scenario),
    other => {
        print_usage();
        anyhow::bail!("unknown surface: {other}")
    }
}
```

Modify `print_usage` (currently `generate_fixtures.rs:56-63`) to list `fund-pdf`. The `out_root` calculation already uses `surface` as a directory component (`generate_fixtures.rs:42-45`), so `tests/fixtures/fund-pdf/` is auto-derived.

#### Surface module — `src-tauri/src/bin/fixtures_fund_pdf/`

Layout (mirrors `fixtures_excel/`):

- `mod.rs` — `pub fn regenerate(out_root: &Path, scenario: Option<&str>) -> Result<()>`. Registry of two scenario entries.
- `scenarios.rs` — two `pub fn` returning `PdfParseResult` literals (see "Scenarios design" below).
- `writer.rs` — printpdf-backed PDF writer + `write_expected_json` + atomic-write helpers. See "Writer design" below.

| Rule             | Implementation site                                                                                                                                                                                                   | Notes                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| IFC-010, IFC-012 | `bin/generate_fixtures.rs` already gated by `required-features = ["dev-fixtures"]` and the new module sits inside it. The CLI extends with `fund-pdf` as a new surface arg without breaking the existing `excel` arg. | No Cargo change.                                             |
| IFC-013          | No new write-side dep. `printpdf` is already in `[dependencies]` (Cargo.toml:56) for the FPR renderer; per IFC-065 reuse is explicitly permitted (the library has an existing production consumer).                   | Verified: production `cargo build` already links `printpdf`. |
| IFC-031, IFC-062 | `fixtures_fund_pdf/scenarios.rs` — two builders.                                                                                                                                                                      | See below.                                                   |
| IFC-064          | Writer does NOT pin metadata; non-deterministic output is acceptable. The drift guard for `*.pdf` is excluded in CI.                                                                                                  | Inspection-only artifact.                                    |
| IFC-065          | Writer reuses `printpdf` and the embedded Roboto-Regular at `src-tauri/resources/fonts/Roboto-Regular.ttf` (already in-tree for FPR).                                                                                 | No new write-side library.                                   |
| IFC-034          | `writer.rs` atomic-save helper (temp + rename + cleanup-on-fail), copied inline from the Excel surface's pattern at `fixtures_excel/writer.rs:63-110`. Per IFC-023 the two surfaces share no helper module.           | ≤30 LOC per surface.                                         |
| IFC-030          | Output paths: `src-tauri/tests/fixtures/fund-pdf/{scenario}.pdf` + `{scenario}.expected.json`.                                                                                                                        | Both atomic-written.                                         |

#### Writer design — `src-tauri/src/bin/fixtures_fund_pdf/writer.rs`

The hard part. Strategy:

1. **Layout**: A4 portrait. Fixed left margin (e.g. 20 mm). Y-cursor starts near top (e.g. y = 280 mm) and decreases by a fixed line-height (e.g. 7 mm) per logical line. Each line of the scenario's text is emitted as a single `Op::ShowText` call in `printpdf` so `pdf-extract` recovers it as a single text-stream segment.

2. **Per-group emission**: for each `PdfProcedureGroup` in the scenario:
   - Emit each `NormalizedPdfLine` as one PDF text line, formatted to match the parser's `DATA_LINE_PATTERN`:
     ```
     {dd/mm/yyyy} {invoice_number} {fund_label}{patient_padding}{patient_name} {ssn} {nature} {start_date}[ au {end_date}] {amount},XX €
     ```
     The `fund_label` here is the `NormalizedPdfLine.fund_name` (which is the bare fund label, since the parser splits the original raw `fund_name` into `fund_label + patient` via `split_fund_and_patient`). To round-trip, the writer must emit a single string `{fund_label} {patient_name}` (concatenated with at least one space) at the position the parser reads as `(.+)` between invoice_number and SSN. The exact pattern: `parse_raw_data_line` captures group 3 (`(.+)`) as fund_name+patient blob, then `split_fund_and_patient` strips the leading `fund_label` to extract `patient_name`. The writer therefore emits the bare fund_label literally followed by a space and the patient_name.
   - **Date format**: French `DD/MM/YYYY`. Use `chrono::NaiveDate::format("%d/%m/%Y")` on `payment_date`, `procedure_start_date`, `procedure_end_date`.
   - **Amount format**: write `i64` thousandths back to French-locale `12,34` (two decimals, comma separator, optional thousand-separator space — start with NO thousand separator since the parser's `parse_amount` strips spaces). Format: `format!("{integer},{cents:02}")` after dividing by 1000 and computing the remainder thousandths. Caveat: `NormalizedPdfLine.amount` is in **thousandths of a euro** (`api.rs:44`), but the parser's `parse_amount` reads `,XX` (centimes only) and does `* 1000.0`. So the writer must verify that scenario amounts have a zero last digit of thousandths — i.e. `amount % 10 == 0`. The two scenarios listed below are crafted to satisfy this.
   - **Currency suffix**: emit ` ` + `codec::CURRENCY_SUFFIX` (= `€`) at end of each amount-bearing line (data line and total line both).
   - After the last data line of a group, emit a total line:
     ```
     {TOTAL_LINE_PREFIX}{dd/mm/yyyy}{TOTAL_LINE_SEPARATOR}{fund_full_name} {TOTAL_LINE_FUND_NUMBER_OPEN}{fund_number}{TOTAL_LINE_FUND_NUMBER_CLOSE} {amount},XX €
     ```
     The fund_number is parsed from `derive_fund_label`'s perspective; the writer extracts it from `fund_label` if it ends with `n° NNN`. Scenario builders SHOULD include the `n°`-suffixed form so the round-trip is unambiguous.

3. **Unparsed-line emission (scenario 2 only)**: the scenario declares `unparsed_lines: Vec<String>` literally. The writer emits each declared unparsed-line string verbatim as its own PDF text line, positioned BETWEEN data lines and the total line, OR after the total line — placement matters because the parser walks lines in order. A line is counted as unparsed only if it (a) does not match `DATA_LINE_PATTERN`, (b) does not match `TOTAL_LINE_PATTERN`, (c) contains `/`, (d) contains an ASCII digit, (e) length > 30. The scenario string MUST satisfy these. See "Scenarios design" below.

4. **Fonts**: use `printpdf::ParsedFont::from_bytes(include_bytes!("../../../resources/fonts/Roboto-Regular.ttf"), ...)` — same path as `use_cases/fund_payment_report_pdf/renderer.rs:18`. This font supports French accents and the `€` glyph. The bold variant is not needed; the dev fixture uses regular only.

5. **Atomic write**: copy of the pattern at `bin/fixtures_excel/writer.rs:63-110`. Helper `atomic_save_bytes(bytes: &[u8], path: &Path) -> Result<()>` writes to `parent/.{name}.tmp` then renames; on `Err` removes the temp file.

6. **Determinism**: NOT required (IFC-064). Do not call `set_creation_datetime` or any property-pinning API. The `.pdf` is regenerated locally any time the developer wants and is excluded from the drift check via `:(exclude)*.pdf`.

#### Risk: text extraction feasibility

**Critical concern documented for plan-reviewer and the eventual implementer.**

The FPR renderer's own test file already states (`use_cases/fund_payment_report_pdf/renderer.rs:60-65`):

> tests call it to walk the `Op` tree directly — printpdf's own deserializer decodes glyph IDs (not text) and `lopdf 0.39` cannot parse printpdf 0.9's ToUnicode CMaps, so the only reliable way to assert that a supplied string was emitted is to inspect the pre-serialisation `Op` list.

This is a real warning: PDFs written by `printpdf` 0.9 may not be readable as text by all PDF parsers. The production text extractor used here is `pdf-extract` 0.10 (`Cargo.toml:45`), a different crate than `lopdf`. The IFC pilot succeeded for Excel because `calamine` (read-side) and `rust_xlsxwriter` (write-side) are tested-against-each-other in the broader Rust ecosystem; for PDF, the printpdf↔pdf-extract pair has no such guarantee.

**Mitigation strategy (gate the implementation)**:

1. **Spike before tests are written** (workflow checkbox above): run a 30–60 min spike. Write a 5-line PDF using `printpdf` 0.9 with embedded Roboto-Regular. Read it with `pdf_extract::extract_text_from_mem`. Verify (a) line ordering preserved, (b) French accents `é`, `è`, `à` round-trip, (c) `€` round-trips, (d) `°` (in `n°`) round-trips, (e) digits and `/` round-trip cleanly.
2. **If the spike fails on (b)–(d)**: substitute the codec constants for ASCII surrogates is NOT permitted (would change the parser's behavior — IFC-063 violation). Instead: (i) try a different font with explicit Unicode coverage; (ii) if that fails, escalate to the user — the spec assumed feasibility; the empirical answer would force re-scoping (e.g. switch the writer to `lopdf` raw or a different library).
3. **If the spike fails on (a)**: lay out the PDF with explicit text positioning (`Op::SetTextCursor` per line at decreasing Y-coordinates) so `pdf-extract` recovers reading order from PDF coordinates rather than text-stream order.

The spike is **mandatory** before any test-writer subagent runs. The plan-reviewer should block on this if the spike has not been completed.

#### Scenarios design

**Scenario 1 — `multi_fund_happy_path`** (IFC-062 §1):

- 2 procedure groups (`Total réglé le` blocks for two different funds).
- Group A (`fund_label: "CPAM n° 931"`, `fund_full_name: "Caisse Primaire"`, `payment_date: 2025-05-02`):
  - Line 1: invoice 100, patient `MARTIN ALICE`, SSN `1111111111111`, nature `SF`, single-date `28/04/2025`, amount `25_000` (= 25,00 €).
  - Line 2: invoice 101, patient `DURAND BOB`, SSN `2222222222222`, nature `SF`, **period date range** `28/04/2025 au 30/04/2025`, amount `76_800` (= 76,80 €). **This satisfies IFC-062 §1's "at least one line uses a period date range" requirement.**
  - Total: 101_800 thousandths (= 101,80 €). `is_total_valid = true`.
- Group B (`fund_label: "MGEN"`, `fund_full_name: "MGEN"`, no fund-number marker, `payment_date: 2025-05-03`):
  - Line 3: invoice 200, patient `BERNARD CAROL`, SSN `3333333333333`, nature `SF`, single-date `29/04/2025`, amount `50_000` (= 50,00 €).
  - Total: 50_000. `is_total_valid = true`.
- `unparsed_line_count: 0`, `unparsed_lines: []` (empty).
- Expected `line_index` values per `NormalizedPdfLine`: locked by the spike result (2026-05-08). `pdf_extract::extract_text` emits two leading blank lines plus one blank separator line between each `Op::ShowText`-emitted text line. The first content line lands at `line_index = 2`, the second at `line_index = 4`, the third at `line_index = 6`, and so on. Total lines (`Total réglé le …`) sit at the same even-stride positions. Scenario builders declare these indices verbatim; the writer emits one `Op::ShowText` per logical line in declared order.

**Scenario 2 — `unparsed_line_present`** (IFC-062 §2):

- 1 procedure group (`fund_label: "CPAM n° 931"`, `fund_full_name: "Caisse Primaire"`, `payment_date: 2025-05-02`):
  - Line 1: invoice 100, patient `MARTIN ALICE`, SSN `1111111111111`, nature `SF`, single-date `28/04/2025`, amount `25_000` (= 25,00 €).
  - Total: 25_000. `is_total_valid = true`.
- `unparsed_line_count: 1`.
- `unparsed_lines: vec!["Reference 99/2025-MAL ill-formed receipt entry not data nor total".to_string()]` — this satisfies the parser's unparsed criteria (`'/'` present, ASCII digit `9`, `2`, `0`, `2`, `5` present, length > 30 — currently 60 chars). The writer emits this exact string verbatim as a PDF text line between line 1 and the total line.
- The scenario builder MUST declare exactly this string in `unparsed_lines` (IFC-062 §2 mandates the exact expected content is declared).
- `line_index` of line 1: 2 (per spike: two leading blank lines from pdf_extract, content starts at index 2; subsequent content lines at +2 stride).

> Trade-off: the order of declaration in the writer (data lines, then unparsed line, then total line) matters because the parser scans top-down and groups data lines under the next-encountered total. Placing the unparsed line BETWEEN them (after data, before total) makes it part of the "before total" run — but the unparsed line does not match `DATA_LINE_PATTERN`, so it is correctly counted as unparsed and not associated with the group. This is the intended placement.

#### Round-trip integration test — `src-tauri/tests/codec_round_trip_fund_pdf.rs` (NEW)

```rust
#![cfg(feature = "dev-fixtures")]
//! Round-trip integration tests for the Import Fixture Codec, fund-PDF surface.
//!
//! Spec: docs/spec/import-codec-fixtures.md, rules IFC-061, IFC-062, IFC-051.
//!
//! The round-trip property is `parse(extract_text(generate(scenario))) == scenario`,
//! full structural equality (IFC-061 — no carve-outs, unlike the Excel surface).

mod common;

use patient_manager_app::use_cases::fund_payment_reconciliation::api::{
    PdfParseResult,  // re-exported from fund_pdf_codec
};
use patient_manager_app::use_cases::fund_payment_reconciliation::parsing::{
    extract_pdf_text, pdf_parser,
};

#[tokio::test]
async fn fund_pdf_multi_fund_happy_path_round_trips() {
    let (pdf_path, expected) = common::fixtures::fund_pdf::happy_path_multi_fund();
    let extracted = extract_pdf_text(&pdf_path).expect("extraction must succeed");
    let parsed: PdfParseResult = pdf_parser::parse_pdf_text(&extracted);
    assert_eq!(expected, parsed, "round-trip failed for happy_path_multi_fund");
}

#[tokio::test]
async fn fund_pdf_unparsed_line_present_round_trips() {
    let (pdf_path, expected) = common::fixtures::fund_pdf::unparsed_line_present();
    let extracted = extract_pdf_text(&pdf_path).expect("extraction must succeed");
    let parsed: PdfParseResult = pdf_parser::parse_pdf_text(&extracted);
    assert_eq!(expected, parsed, "round-trip failed for unparsed_line_present");
}
```

Notes:

- The file uses `mod common;` to pull in `tests/common/mod.rs` exactly like `tests/codec_round_trip.rs:63` does. Each integration test binary in `tests/` gets its own `common/` import; this is idiomatic.
- `extract_pdf_text` from `parsing::pdf_extractor` is already `pub use`-exported through `parsing/mod.rs:7`. Path: `parsing::extract_pdf_text`.
- `pdf_parser::parse_pdf_text` is `pub` (verified at `parsing/pdf_parser.rs:143`) and exposed via `pub mod pdf_parser` in `parsing/mod.rs:5`.
- Both call paths require no new public API. **However**: `parsing` is currently `pub mod parsing` from `mod.rs:12` — confirm visibility from `tests/` (which sees only the lib's public surface). The path `patient_manager_app::use_cases::fund_payment_reconciliation::parsing::pdf_parser::parse_pdf_text` requires every intermediate `mod` in the chain to be `pub`. `use_cases` is `pub mod use_cases` in `lib.rs` (assumed; verify before writing the test). If anything is private, **prefer calling the Tauri-handler shim `api::parse_pdf_text(text)` which is `pub async fn` and `Result<_, String>`** — wrap with `tokio::block_on` or `await`. The test file is `#[tokio::test]` so `await` is natural.

#### Trade-off: one round-trip file per surface vs. extending the existing one

**Decision**: separate file (`tests/codec_round_trip_fund_pdf.rs`). Reasons:

- Each `tests/*.rs` is its own integration-test binary; keeping surfaces separate makes test-output paths and CI step names self-describing (`cargo test --test codec_round_trip_fund_pdf`).
- The `#![cfg(feature = "dev-fixtures")]` gate sits at the file level — keeping surface scope per file makes the gate locality obvious.
- IFC-023 surface independence is reinforced: a future bank-PDF surface adds yet another `tests/codec_round_trip_bank_pdf.rs` file without touching either existing one.
- Trade-off accepted: two binaries means two compile units, slightly slower CI. Given the dev-fixtures CI job is itself dedicated and infrequent (only fires on path-matched changes), the cost is negligible.

#### CI workflow — `.github/workflows/dev-fixtures.yml` (modify)

Current state at lines 11-37 lists `paths:` for `pull_request` and `push` triggers. Extend both lists with:

```yaml
- "src-tauri/src/bin/fixtures_fund_pdf/**"
- "src-tauri/src/use_cases/fund_payment_reconciliation/**"
- "src-tauri/tests/codec_round_trip_fund_pdf.rs"
```

Current "Regenerate fixtures" step at line 65-67 runs only `excel`. Add a sibling step right after:

```yaml
- name: Regenerate fund-PDF fixtures
  working-directory: src-tauri
  run: cargo run --features dev-fixtures --bin generate_fixtures -- fund-pdf
```

Current "Drift check" step at line 68-69:

```yaml
- name: Drift check (IFC-041)
  run: git diff --exit-code src-tauri/tests/fixtures/
```

Replace with the pathspec-excluding form (IFC-041 with the IFC-064 carve-out clause; the `--` separator is required by Git to disambiguate revisions from pathspecs):

```yaml
- name: Drift check (IFC-041, with IFC-064 PDF exclusion)
  run: git diff --exit-code src-tauri/tests/fixtures/ -- ':(exclude)*.pdf'
```

Verification before the workflow change is committed: run `git diff --exit-code src-tauri/tests/fixtures/ -- ':(exclude)*.pdf'` locally and confirm it reports zero diff after a fresh `just regen-fixtures` (the `*.expected.json` files are deterministic; the `*.pdf` files are excluded).

Current "Round-trip tests" step at line 70-72 runs only `--test codec_round_trip`. Add a sibling step:

```yaml
- name: Round-trip tests fund-PDF (IFC-051)
  working-directory: src-tauri
  run: cargo test --features dev-fixtures --test codec_round_trip_fund_pdf
```

#### Justfile — no changes

The existing recipe `regen-fixtures SURFACE='excel' SCENARIO=''` (justfile:21-22) accepts `fund-pdf` as the SURFACE argument because the dev binary handles dispatch. Both `just regen-fixtures fund-pdf` and `just regen-fixtures fund-pdf multi_fund_happy_path` work without recipe changes.

#### Production-build verification

Same step as the IFC pilot:

```
cd src-tauri && cargo check --no-default-features
```

must succeed and `cargo build --release` must show no new dependencies linked. (`printpdf` is already linked by the FPR renderer; this PR does not add a new prod-side dep.)

---

### Frontend

**No-op — explicitly.** This feature has no frontend slice. Specifically:

- No new file under `src/features/`.
- No new entry in `src/bindings.ts` — the codec move uses a `pub use` re-export so Specta resolves `PdfParseResult` to the same TypeScript shape it already produces. **The `just generate-types` diff MUST be empty.** That command runs as a guard, not as a real synchronization step.
- No i18n strings.
- No visual proof. PR body must contain: `No visual impact — Rust-only dev tooling change.`

---

### Rules Coverage

| Rule        | Theme                                 | Implementation site                                                                                                                                                                                                                                                 | Notes                                                                        |
| ----------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| IFC-010     | Tool surface (carry-over)             | `src-tauri/Cargo.toml [[bin]]` already gates `generate_fixtures` with `required-features = ["dev-fixtures"]`; the new module sits inside it.                                                                                                                        | No Cargo change.                                                             |
| IFC-011     | Tool surface (carry-over)             | Existing `dev-fixtures` feature already gates the binary; extension is module-internal.                                                                                                                                                                             | No Cargo change.                                                             |
| IFC-012     | Tool surface                          | `src-tauri/src/bin/generate_fixtures.rs` match arm extended with `"fund-pdf"`; `print_usage` updated.                                                                                                                                                               | Existing CLI shape preserved.                                                |
| IFC-013     | Tool surface                          | No new write-side dep. `printpdf` is already prod (FPR consumer); IFC-065 explicitly exempts existing-prod-consumer libs from IFC-013.                                                                                                                              | Verified: `Cargo.toml:56`.                                                   |
| IFC-023     | Codec contract — surface independence | `fund_pdf_codec.rs` is a sibling of `excel_codec.rs`, no shared imports. The dev-binary atomic-write helper is duplicated per surface (≤30 LOC each).                                                                                                               | Surface independence preserved.                                              |
| IFC-024     | Codec contract — production code      | `fund_pdf_codec.rs` lives under `src/use_cases/fund_payment_reconciliation/`, not feature-gated. The dev binary depends on it; the parser also depends on it.                                                                                                       | Production-code rule.                                                        |
| IFC-025     | Codec contract — data-mapping only    | `fund_pdf_codec.rs` carries types + 6 data-mapping `pub const`s; no validation, no I/O, no parsing logic.                                                                                                                                                           | Hard rule.                                                                   |
| IFC-030     | Fixture set                           | `src-tauri/tests/fixtures/fund-pdf/{scenario}.pdf` + `{scenario}.expected.json` written by the dev binary, both committed.                                                                                                                                          | Two scenarios = 4 files committed.                                           |
| IFC-031     | Fixture set                           | `src-tauri/src/bin/fixtures_fund_pdf/scenarios.rs` — `pub fn happy_path_multi_fund()` and `pub fn unparsed_line_present()` returning `PdfParseResult`.                                                                                                              | snake_case names with intent.                                                |
| IFC-032     | (carry-over: Excel scenarios)         | Untouched; existing Excel scenarios remain.                                                                                                                                                                                                                         | This PR adds fund-PDF, does not modify Excel.                                |
| IFC-033     | Fixture set                           | Existing `just regen-fixtures` recipe accepts `fund-pdf` as SURFACE without change.                                                                                                                                                                                 | No justfile diff.                                                            |
| IFC-034     | Fixture set                           | `bin/fixtures_fund_pdf/writer.rs` atomic-save helper (temp + rename + cleanup-on-fail), copied inline.                                                                                                                                                              | Both `.pdf` and `.expected.json` go through it.                              |
| IFC-040     | Determinism                           | Not pursued for `*.pdf` (per IFC-064). The `.expected.json` snapshot remains deterministic via `serde_json::to_string_pretty`.                                                                                                                                      | Fallback clause invoked.                                                     |
| IFC-041     | Determinism — drift guard             | `.github/workflows/dev-fixtures.yml` drift step changed to `git diff --exit-code src-tauri/tests/fixtures/ -- ':(exclude)*.pdf'`.                                                                                                                                   | Pathspec exclusion clause.                                                   |
| IFC-042     | Determinism — CI job                  | Same workflow file extended with the fund-PDF regen step + the new round-trip test step, in the same single job.                                                                                                                                                    | Standard `ci.yml` `backend` job stays unchanged.                             |
| IFC-050     | Test consumption                      | `src-tauri/tests/common/fixtures.rs` extended with `pub mod fund_pdf` exposing `happy_path_multi_fund()` and `unparsed_line_present()`.                                                                                                                             | Mirrors the Excel helper.                                                    |
| IFC-051     | Test consumption                      | `src-tauri/tests/codec_round_trip_fund_pdf.rs` (new) — `#![cfg(feature = "dev-fixtures")]`. Two `#[tokio::test]` functions.                                                                                                                                         | Standard `cargo test` skips it.                                              |
| **IFC-060** | fund-PDF codec                        | New file `src-tauri/src/use_cases/fund_payment_reconciliation/fund_pdf_codec.rs` carrying `NormalizedPdfLine` + `PdfProcedureGroup` + `PdfParseResult` + 6 data-mapping `const`s. `api.rs` `pub use`s the three types so external callers and Specta see no change. | Sibling of `excel_codec.rs`.                                                 |
| **IFC-061** | fund-PDF round-trip                   | `tests/codec_round_trip_fund_pdf.rs` asserts full structural equality on `PdfParseResult` (no carve-outs). `PdfParseResult` and `PdfProcedureGroup` gain `PartialEq` to enable `assert_eq!`.                                                                        | `NormalizedPdfLine` already has `PartialEq`.                                 |
| **IFC-062** | fund-PDF scenarios                    | Two scenarios: `happy_path_multi_fund` (2 groups, period range, no unparsed) and `unparsed_line_present` (1 group + 1 declared unparsed line).                                                                                                                      | See "Scenarios design".                                                      |
| **IFC-063** | fund-PDF generator-only               | Codec move + literal-to-constant promotion in `pdf_parser.rs` regex. The 6 promoted literals are listed above. Validation regex/threshold/sample-cap stay inline.                                                                                                   | Parser semantics unchanged; existing 10 inline tests are the regression net. |
| **IFC-064** | fund-PDF non-determinism              | Writer does NOT pin metadata. CI drift check excludes `*.pdf` via `:(exclude)*.pdf` pathspec. `.expected.json` remains under the check.                                                                                                                             | Round-trip test is the load-bearing correctness check.                       |
| **IFC-065** | fund-PDF library reuse                | Writer reuses `printpdf` (already prod for FPR). `Cargo.toml` unchanged.                                                                                                                                                                                            | No second PDF write-side library.                                            |

---

## 3. PR Plan

- **Strategy**: **1 PR** (BE-only; mirrors PR #12's shape; no UI slice; tightly coupled — codec move, parser refactor, dev-binary extension, fixtures, round-trip test, and CI workflow change all land coherently together).
- **Estimate**:
  - BE: ~12 files / ~600 LOC.
    - `fund_pdf_codec.rs` (new, ~80 LOC: 3 type definitions moved + 6 const declarations).
    - `api.rs` (modified, ~10 LOC delta: types removed, `pub use` line added).
    - `mod.rs` (modified, +1 line: `pub mod fund_pdf_codec;`).
    - `pdf_parser.rs` (modified, ~30 LOC delta: two `LazyLock<Regex>` blocks replacing the two `const &str` patterns).
    - `bin/generate_fixtures.rs` (modified, ~5 LOC delta: new `mod` + match arm + usage string).
    - `bin/fixtures_fund_pdf/mod.rs` (new, ~80 LOC: registry + regenerate fn, mirrors `fixtures_excel/mod.rs`).
    - `bin/fixtures_fund_pdf/scenarios.rs` (new, ~120 LOC: two literal `PdfParseResult` builders).
    - `bin/fixtures_fund_pdf/writer.rs` (new, ~200 LOC: PDF emission with printpdf + JSON snapshot + atomic helpers).
    - `tests/common/fixtures.rs` (modified, ~40 LOC delta: `pub mod fund_pdf` block).
    - `tests/codec_round_trip_fund_pdf.rs` (new, ~60 LOC: two `#[tokio::test]` functions).
    - `.github/workflows/dev-fixtures.yml` (modified, ~10 LOC delta: paths + 2 new steps + drift step pathspec).
    - `ARCHITECTURE.md` (modified, ~5 LOC delta: surface coverage sentence + codec module pointer).
    - 4 fixture artifacts committed (`*.pdf` + `*.expected.json` × 2 scenarios).
  - FE: 0 files / 0 LOC.
  - Coupling: tight. The codec move, the parser refactor, the dev-binary surface, and the round-trip test are co-dependent and meaningless individually.
- **PR list**:
  - **PR #1** — `feat(ifc): import fixture codec — fund-PDF surface`
    - **Scope**: every Workflow TaskList checkpoint (Phase 2 backend + Phase 4 closure).
    - **Dependency**: none — branches off `main`.
    - **Branch suffix**: `feat/codec-fund-pdf` (current branch `feat/import-codec-fixtures` is the working branch from the spike; rename or land from this branch as the user prefers).
    - **Body must include**: `No visual impact — Rust-only dev tooling change.` AND the spike result (text-extraction round-trip evidence — see "Risk: text extraction feasibility").

Threshold check: BE files ~12, BE LOC ~600. The 1-PR threshold from the planner doctrine is 20 files / 500 LOC. We exceed the LOC line by ~100 but stay well under the file count, and the BE-only nature with no UI/E2E or contract overhead keeps the review surface small and uniform. Coupling argues strongly against splitting (the codec move, the parser refactor, and the round-trip test that validates them must merge together to avoid a transient broken intermediate state). **Recommendation: 1 PR.** Confirmed by user pre-decision in the brief.

---

## Notes for the next gate

- **Mandatory next step**: `plan-reviewer` agent reviews this plan. Block on critical findings before any test-writer subagent runs.
- **Critical-risk gate (re-stated)**: the "spike" before tests in the Workflow TaskList is mandatory. If `printpdf` 0.9 + `pdf-extract` 0.10 cannot round-trip French/`€`/`°` text in a 5-line stub, the implementation strategy must change before any further code lands. The plan-reviewer should verify this gate is explicit and unambiguous.
- **Specta-equivalence gate**: the `just generate-types` diff after the codec move must be empty. If non-empty, the move broke the public type surface — investigate before proceeding.
- **Locked decisions** (from /start interview, NOT to be re-litigated by plan-reviewer):
  - Codec module name: `fund_pdf_codec.rs` under `use_cases/fund_payment_reconciliation/` ✓
  - Round-trip equality: full structural, no carve-outs ✓
  - Two scenarios: multi-fund happy path + unparsed-line ✓
  - Output non-deterministic, drift excludes `*.pdf` only ✓
  - `printpdf` reuse, no second PDF write-side library ✓
  - Codec scope: 6 data-mapping literals only ✓
  - Surface independence: no shared traits/helpers/constants with Excel codec ✓
  - Existing `dev-fixtures` feature extended, not replaced ✓
  - Existing `generate_fixtures` binary extended with surface arg, not forked ✓
- **No contract-reviewer**: skipping `/contract` was a deliberate decision; do not regenerate this thread's contract step.

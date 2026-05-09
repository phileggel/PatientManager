# Implementation Plan — Import Fixture Codec, bank-PDF surface (IFC-100..IFC-105)

> **Source spec**: [`docs/spec/import-codec-fixtures.md`](../spec/import-codec-fixtures.md) — _Bank-Statement-Reconciliation PDF Surface_ section (IFC-100..IFC-105). Surface-agnostic rules IFC-010..IFC-013, IFC-023..IFC-025, IFC-030..IFC-034, IFC-040..IFC-042, IFC-050..IFC-051 still govern.
> **Trigram**: IFC (already registered in `docs/spec-index.md`; the existing IFC line — `Excel + fund-PDF + bank-PDF` — already names this surface; no spec-index edit).
> **Contract**: `docs/contracts/bank-statement-auto-match-contract.md` — **UNCHANGED**. The codec adds no Tauri commands; the existing `parse_bank_statement(file_path: String) -> Result<BankStatementParseResult, String>` (post-PR #14) is the consumer. Contract-reviewer has already verified the no-change verdict for this PR.
> **Reference precedent**: [`docs/plan/codec-fund-pdf-plan.md`](codec-fund-pdf-plan.md) (PR #13, commit `77f2a14`). Bank-PDF is structurally identical to fund-PDF as an IFC consumer; this plan mirrors it.

---

## At a glance

- **Phase 1 — Spec/Plan**: this document. Hand off to `plan-reviewer` next. No `/contract` step (contract is unchanged).
- **Phase 2 — Backend (substantive)**:
  1. Move `BankStatementParseResult` + `BankStatementCreditLine` from `parser.rs` to a new `bank_pdf_codec.rs`; re-export from `parser.rs` (and consequently through `mod.rs`'s existing `pub use parser::{...}`) so the Specta surface and every existing import stay untouched.
  2. Add `PartialEq` to both types (additive derive — IFC-103-compliant, enables `assert_eq!` in the round-trip test).
  3. Promote 7 data-mapping literals into codec constants. Parser regex patterns are rebuilt at module init from those constants via `LazyLock<Regex>`.
  4. Extend the `generate_fixtures` binary with a `bank-pdf` surface arm: scenario builders + a printpdf-backed writer that emits a `.pdf` whose `pdf-extract` text round-trips through the parser.
  5. Two scenarios per IFC-102: `happy_path_multi_label` (IBAN + period + 2+ distinct fund labels including one trailing-`SEPA` cleanup case) + `iban_period_only_no_credits` (IBAN + period, zero `VIR SEPA` lines — models BAS R26 input shape, but R26 is out of codec scope).
  6. Sibling `tests/fixtures/bank_pdf/{scenario}.pdf` + `{scenario}.expected.json` artifacts.
  7. New round-trip test file `src-tauri/tests/codec_round_trip_bank_pdf.rs` (separate test binary, mirrors the fund-PDF layout).
  8. Extend `src-tauri/tests/common/fixtures.rs` with `pub mod bank_pdf { ... }`.
  9. Extend `.github/workflows/dev-fixtures.yml`: add the bank-PDF regen step, extend the round-trip test invocation, and extend the `paths:` triggers. The drift step's `*.pdf` exclusion already covers bank-PDF outputs (no change there).
- **Phase 3 — Frontend**: **NO-OP**. No UI, no gateway, no Specta types regenerated (the move is pure-Rust and `pub use`-exported; bindings stay byte-equivalent). Skip every `frontend-*` checkpoint.
- **Phase 4 — Review/Closure**: `reviewer-arch` always; `reviewer-infra` (workflow file modified); `reviewer-security` (verify production `tauri build` still does NOT link `printpdf` for any new reason — it already does for FPR, no new exposure). `reviewer-backend` runs because `parser.rs`, `mod.rs`, and `api.rs` (production source) are touched (codec move + literal-to-constant promotion + import-path follow-through).
- **E2E**: not applicable.
- **PR strategy**: 1 PR, BE-only, mirroring PR #13.
- **Highest implementation risk**: NONE — the spike-locked `pdf-extract`/`printpdf 0.9` round-trip pattern from PR #13 applies identically here. Same writer pattern; same line-index stride (2 leading blank lines + 1 blank separator between `Op::ShowText` ops); same Roboto-Regular font reuse. No spike re-run needed. The only fresh consideration is the bank parser's input-shape: the bank parser walks `text.lines()` (filters by `contains("VIR")`/`contains("SEPA")`) and does not depend on `line_index`, so the spike-locked stride is round-trip-invariant for the bank surface (the parser ignores blanks).

---

## 1. Workflow TaskList (synthetic — derived from CLAUDE.md)

- [ ] Review architecture & rules (`ARCHITECTURE.md`, `docs/backend-rules.md`)
- [ ] Inspect existing parser (`parser::parse_bank_statement`) and confirm it remains callable from `tests/` (the `pub fn` stays public; `mod.rs` already `pub use`s the types — verified at `mod.rs:11`)
- [ ] Spike — **NOT REQUIRED**. The fund-PDF spike (PR #13, 2026-05-08) already established that `printpdf 0.9` + embedded Roboto-Regular + `pdf_extract::extract_text` round-trips every special character bank-PDF needs (`/`, `,`, ASCII digits, ASCII letters — bank text uses no accented characters or `€` symbol since amounts are bare `xxx,xx`). The bank parser only inspects line text content, not `line_index`, so the spike-locked emission stride is trivially compatible.
- [ ] Database migration — **N/A** (no schema change)
- [ ] Backend test stubs (`test-writer-backend` — round-trip integration test stubs written, red confirmed). No contract entry; tests are derived directly from spec rules IFC-101, IFC-102 (and IFC-051 for the gating). No `modified_functions` list — `parser.rs`'s changes are (a) a codec move with `pub use` re-export and (b) a literal-to-constant refactor; both are covered by the existing inline `#[cfg(test)] mod tests` block (12 tests at `parser.rs:193-333`) which forms the regression net for IFC-103.
- [ ] Backend implementation — minimal, only what is required to make the failing tests pass. No additional methods, no defensive code, no anticipation of future surfaces.
  - [ ] **Codec move (IFC-100)**: create `src-tauri/src/use_cases/bank_statement_reconciliation/bank_pdf_codec.rs`. Move `BankStatementCreditLine` (`parser.rs:8-16`) and `BankStatementParseResult` (`parser.rs:19-31`) verbatim into the new file. Add `PartialEq` to the derive list of both types (preserves `Debug, Clone, Serialize, Deserialize, Type`). Add the 7 codec constants listed below. Wire in `mod.rs` next to `parser` (`pub mod bank_pdf_codec;`). Re-export the two types from `parser.rs` so every existing internal import (`mod.rs:11`'s `pub use parser::{BankStatementCreditLine, BankStatementParseResult}`, `api.rs:14`'s `use super::parser::{self, BankStatementParseResult}`) keeps resolving:
    ```rust
    pub use super::bank_pdf_codec::{BankStatementCreditLine, BankStatementParseResult};
    ```
    The Specta registration site is `src-tauri/src/core/specta_builder.rs:55-56` — `bank_statement_reconciliation::BankStatementParseResult` and `BankStatementCreditLine`. Both still resolve via `mod.rs`'s `pub use`. Specta walks the actual `#[derive(Type)]` definitions, which now live in the codec module; the generated `bindings.ts` block must be byte-equivalent.
  - [ ] **Codec data-mapping constants (IFC-100, IFC-103)**: in `bank_pdf_codec.rs`, declare these `pub const`s — names locked here, must match the spec's IFC-100 enumeration:
    - `IBAN_HEADER_MARKER: &str = "I.B.A.N."` — the parser's IBAN line marker (`parser.rs:59` `r"I\.?B\.?A\.?N\.?\s*..."` regex source).
    - `IBAN_COUNTRY_PREFIX: &str = "FR"` — the IBAN country prefix the parser captures (`parser.rs:59` `(FR\d[\d\s]*)`).
    - `PERIOD_PREFIX: &str = "du "` — the period line opening token (`parser.rs:74` `r"du\s*..."` source; `parser.rs:78` emit-side `format!("du {} au {}")`).
    - `PERIOD_SEPARATOR: &str = " au "` — the period date-range separator (same regex; same `format!`).
    - `VIR_SEPA_MARKER: &str = "VIR SEPA"` — the credit-line marker the writer MUST emit with a single space (IFC-102 §1 emit-side constraint). The parser's regex tolerates `\s+` for read-side robustness; the emitter uses a single space for fidelity with real bank statements.
    - `LABEL_TRAILING_SUFFIX: &str = "SEPA"` — the trailing-suffix cleanup token (`parser.rs:125` `if label.ends_with("SEPA")` and `parser.rs:126` `label[..label.len() - 4]`).
    - `FRENCH_AMOUNT_DECIMAL: &str = ","` — the French amount decimal separator (`parser.rs:189` `cleaned.replace(',', ".")`).

    These are _data-mapping_ strings only. Validation regex patterns themselves (`I\.?B\.?A\.?N\.?\s*(FR\d[\d\s]*)`, the credit-line regex shape, the period regex shape), the `>= 14` IBAN-length threshold, helper conversions (`convert_date_to_iso`, `parse_french_amount`), and the trailing-`SEPA` cleanup _logic_ stay inline in `parser.rs` per IFC-103 / IFC-025. The codec carries the literal `"SEPA"` token; the parser owns the `ends_with` check and the `len() - 4` slice.

  - [ ] **Parser regex rebuilt from constants (IFC-103 — promotion only, no semantic change)**: in `parser.rs`, replace the literal text fragments inside the three regexes with constants interpolated via `format!`. Use `std::sync::LazyLock<Regex>` (Rust 1.80+, project uses 1.90 per Cargo.toml) so the pattern compiles once. Sketch (illustrative — the implementation must `regex::escape` constants before interpolation; the only constant containing regex meta-chars is `IBAN_HEADER_MARKER` which has dots, but the existing pattern already encodes `I\.?B\.?A\.?N\.?` with optional escapes — the safest shape is to keep the meta-char-bearing pattern bits inline and interpolate only the safe constants):

    ```rust
    static IBAN_RE: LazyLock<Regex> = LazyLock::new(|| {
        let prefix = codec::IBAN_COUNTRY_PREFIX;
        let pattern = format!(r"I\.?B\.?A\.?N\.?\s*({prefix}\d[\d\s]*)");
        Regex::new(&pattern).expect("iban regex must compile")
    });
    static PERIOD_RE: LazyLock<Regex> = LazyLock::new(|| {
        // PERIOD_PREFIX is `du `; trim to `du` for the regex anchor since
        // the regex uses `\s*` for whitespace control.
        let prefix = codec::PERIOD_PREFIX.trim_end();
        let separator = codec::PERIOD_SEPARATOR.trim();
        let pattern = format!(r"{prefix}\s*(\d{{2}}/\d{{2}}/\d{{4}})\s*{separator}\s*(\d{{2}}/\d{{2}}/\d{{4}})");
        Regex::new(&pattern).expect("period regex must compile")
    });
    static CREDIT_LINE_RE: LazyLock<Regex> = LazyLock::new(|| {
        // VIR_SEPA_MARKER is `VIR SEPA`; split on the space and rejoin with `\s+`
        // to preserve the parser's tolerance for arbitrary whitespace between
        // VIR and SEPA. (IFC-102 emits the canonical single-space form.)
        let marker = codec::VIR_SEPA_MARKER.replace(' ', r"\s+");
        let pattern = format!(r"^\d{{2}}/\d{{2}}/\d{{4}}\s+{marker}\s+(.+?)\s+(\d{{2}}/\d{{2}}/\d{{4}})\s+([\d\s]+,\d{{2}})");
        Regex::new(&pattern).expect("credit line regex must compile")
    });
    ```

    The `format!("du {} au {}", start, end)` at `parser.rs:78` (the period-line emit-side reconstruction) becomes:

    ```rust
    Some(format!("{prefix}{start}{sep}{end}",
        prefix = codec::PERIOD_PREFIX,
        sep = codec::PERIOD_SEPARATOR,
    ))
    ```

    The trailing-`SEPA` slice at `parser.rs:125-127` consumes `LABEL_TRAILING_SUFFIX`:

    ```rust
    if label.ends_with(codec::LABEL_TRAILING_SUFFIX) {
        label = label[..label.len() - codec::LABEL_TRAILING_SUFFIX.len()].to_string();
    }
    ```

    The French-amount helper at `parser.rs:189` consumes `FRENCH_AMOUNT_DECIMAL`:

    ```rust
    let cleaned = s.replace(' ', "").replace(codec::FRENCH_AMOUNT_DECIMAL, ".");
    ```

    What stays inline (per IFC-103 / IFC-025, NOT promoted):
    - The IBAN length threshold `>= 14` at `parser.rs:63`.
    - Validation regex shapes (`\d{2}/\d{2}/\d{4}`, `[\d\s]+,\d{2}`, the `I\.?B\.?A\.?N\.?` meta-char skeleton).
    - The `len() - 4` arithmetic conceptually (now expressed via `LABEL_TRAILING_SUFFIX.len()` but the slice operation itself is parser logic).
    - `convert_date_to_iso` (`parser.rs:174-185`) — date helper.
    - `parse_french_amount` (`parser.rs:188-191`) — amount helper.

    Existing inline test block (`parser.rs:193-333`, 12 tests) is the regression net. None must change behavior.

  - [ ] **Dev-binary extension (IFC-012)**: in `src-tauri/src/bin/generate_fixtures.rs`, add `mod fixtures_bank_pdf;` next to `mod fixtures_fund_pdf;`. Extend the surface match arm: `"bank-pdf" => fixtures_bank_pdf::regenerate(&fixtures_root.join("bank_pdf"), scenario)` (kebab-case CLI arg → snake_case directory, matching the fund-PDF convention at `generate_fixtures.rs:49`). Update `print_usage` to list `bank-pdf`.
  - [ ] **Scenario builders (IFC-031, IFC-102)**: `src-tauri/src/bin/fixtures_bank_pdf/scenarios.rs` exporting two `pub fn`s returning `BankStatementParseResult`. See "Scenarios design" below.
  - [ ] **PDF writer (IFC-104, IFC-105)**: `src-tauri/src/bin/fixtures_bank_pdf/writer.rs` using `printpdf` (already a prod dep — `Cargo.toml`, no Cargo change). One `printpdf` `Op::ShowText` per emitted text line; same A4 portrait + Roboto-Regular pattern as the fund-PDF writer. **Determinism not required (IFC-104)** — the committed `.pdf` is inspection-only.
  - [ ] **Atomic write (IFC-034)**: same temp+rename pattern as `bin/fixtures_fund_pdf/writer.rs:atomic_write_bytes`. Per IFC-023 the three surfaces share NO traits/helpers/constants — duplicate the helper inline (≤30 LOC). _This duplication is identical to the fund-PDF precedent and is not a codec abstraction._
  - [ ] **Sibling JSON snapshot (IFC-030)**: `{scenario}.expected.json` written from `serde_json::to_string_pretty(&BankStatementParseResult)` + trailing newline (matches fund-PDF convention).
  - [ ] **Output directory**: `src-tauri/tests/fixtures/bank_pdf/`. Created on first run by `std::fs::create_dir_all` in the `regenerate` fn.
  - [ ] **Typed fixture access helper (IFC-050)**: extend `src-tauri/tests/common/fixtures.rs` with a new `pub mod bank_pdf` containing `happy_path_multi_label() -> (PathBuf, BankStatementParseResult)` and `iban_period_only_no_credits() -> (PathBuf, BankStatementParseResult)`. Imports `BankStatementParseResult` from `patient_manager_app::use_cases::bank_statement_reconciliation::bank_pdf_codec::BankStatementParseResult` — this path requires `bank_pdf_codec` to be `pub` in `mod.rs` (it will be — same shape as `fund_pdf_codec` reference at `tests/common/fixtures.rs:21`). The helper mirrors the fund-PDF helper at `tests/common/fixtures.rs:77-120` exactly.
  - [ ] **Round-trip integration test (IFC-051, IFC-101)**: new file `src-tauri/tests/codec_round_trip_bank_pdf.rs`. Two `#[test]` functions (synchronous — neither extractor nor parser is async); both `#![cfg(feature = "dev-fixtures")]`. Each:
    1. Loads `(pdf_path, expected: BankStatementParseResult)` from the helper.
    2. Calls `extract_pdf_text(&pdf_path)` (path: `patient_manager_app::use_cases::fund_payment_reconciliation::parsing::extract_pdf_text` — the same cross-context import the bank-statement `api.rs:8` already uses; this is a pre-existing pattern, NOT introduced by this PR).
    3. Calls `parser::parse_bank_statement(&extracted)` — produces a `BankStatementParseResult`.
    4. Asserts **full structural equality** on every field via `assert_eq!`. `PartialEq` on `BankStatementParseResult` and `BankStatementCreditLine` is added in the codec move above; `Option<String>` (for `iban`/`period`) compares structurally without trouble.

    Notes:
    - The file uses `mod common;` to pull in `tests/common/mod.rs` exactly like the fund-PDF round-trip test at `tests/codec_round_trip_fund_pdf.rs:31`.
    - `extract_pdf_text` at `parsing/mod.rs:7` is `pub use`-exported. Path: `parsing::extract_pdf_text`.
    - `parser::parse_bank_statement` is `pub` at `parser.rs:37` and exposed via `pub mod parser` in `mod.rs:4`. Path: `bank_statement_reconciliation::parser::parse_bank_statement`. **NOT** the Tauri command `api::parse_bank_statement` (which adds R26 `NoVirSepaLines` boundary check that would break scenario 2 — IFC-102 §2 explicitly carves R26 out of codec scope per IFC-101).

- [ ] `just format`
- [ ] **Specta byte-equivalence verification (codec move guard)**: run `just generate-types` BEFORE the move, save `src/bindings.ts` to a backup, run `just generate-types` AFTER the move (and after the codec data-mapping refactor). `diff` MUST be empty. Capture the diff result in the PR body. Adding `PartialEq` is a derive macro-only change with no Specta impact (Specta walks `Type` derive, not `PartialEq`).
- [ ] Confirm production build is unaffected: `cd src-tauri && cargo check --no-default-features` succeeds; `cargo build --release` is unchanged in linkage. (No new prod deps; only the dev binary gains a module.)
- [ ] Backend review (`reviewer-backend`) — **required**: `parser.rs`, `mod.rs`, and the new `bank_pdf_codec.rs` (under `use_cases/bank_statement_reconciliation/`) are production source. Reviewer asserts IFC-103 compliance (only data-mapping literals promoted; regex shapes/threshold/cleanup logic stay inline) and that `parse_bank_statement` semantics are unchanged (the existing 12 inline tests still pass). Also reviews `api.rs` to confirm no behavioral change (the `use super::parser::{self, BankStatementParseResult}` import still resolves through the re-export).
- [ ] Type synchronization (`just generate-types`) — **MANDATORY** as a guard, even though the diff must be empty. (See "Specta byte-equivalence verification" above. If the diff is non-empty, STOP and investigate — the move broke the public type surface.)
- [ ] Compilation fixup — **SKIPPED** (no bindings change expected; if any, treat as a regression and fix the codec move).
- [ ] `just check` — Rust/format clean.
- [ ] Frontend test stubs — **SKIPPED** (no FE).
- [ ] Frontend implementation — **SKIPPED**.
- [ ] Visual proof — **SKIPPED**. PR body must contain: `No visual impact — Rust-only dev tooling change.`
- [ ] Frontend review — **SKIPPED**.
- [ ] E2E tests — **SKIPPED**.
- [ ] Generate the committed fixture set: `just regen-fixtures bank-pdf` (produces `tests/fixtures/bank_pdf/*.pdf` + `*.expected.json`).
- [ ] Run round-trip suite locally:
  - `cargo test --features dev-fixtures --test codec_round_trip` (Excel — must still pass)
  - `cargo test --features dev-fixtures --test codec_round_trip_fund_pdf` (fund-PDF — must still pass; regression net for the codec move pattern)
  - `cargo test --features dev-fixtures --test codec_round_trip_bank_pdf` (new bank-PDF suite)
- [ ] Extend `dev-fixtures` CI job (`.github/workflows/dev-fixtures.yml`):
  - Trigger `paths:` add `src-tauri/src/bin/fixtures_bank_pdf/**`, `src-tauri/src/use_cases/bank_statement_reconciliation/**`, `src-tauri/tests/codec_round_trip_bank_pdf.rs` (under both `pull_request` and `push`).
  - Add a regen step: `cargo run --features dev-fixtures --bin generate_fixtures -- bank-pdf`.
  - **Drift check pathspec**: ALREADY excludes bank-PDF outputs. The current step at `.github/workflows/dev-fixtures.yml:89-90` uses `':(exclude)src-tauri/tests/fixtures/**/*.pdf'` which is glob-based and covers `tests/fixtures/bank_pdf/*.pdf` automatically. **No change needed**; verify by running the same command locally after `just regen-fixtures bank-pdf` and confirming zero diff on `*.expected.json`.
  - Extend the round-trip step from `--test codec_round_trip --test codec_round_trip_fund_pdf` to `--test codec_round_trip --test codec_round_trip_fund_pdf --test codec_round_trip_bank_pdf`.
- [ ] Cross-cutting review:
  - [ ] `reviewer-arch` (always)
  - [ ] `reviewer-infra` (workflow file modified; justfile unchanged this round — see "Justfile" below)
  - [ ] `reviewer-security` — confirm dev-fixtures gating still excludes the new module from `tauri build` (no new prod deps; `printpdf` was already prod since FPR; `pdf-extract` was already prod for bank parsing). The new dev-binary module is feature-gated through the existing `[[bin]] required-features = ["dev-fixtures"]` declaration on `generate_fixtures`.
  - [ ] `reviewer-sql` — N/A (no migrations).
- [ ] Documentation update:
  - `ARCHITECTURE.md` — under "Currently covered" (line 418-423), add a third row for **Bank-PDF** → `use_cases/bank_statement_reconciliation/bank_pdf_codec.rs` → `BankStatementParseResult` → "None — full structural equality (IFC-101)." Update line 425's last sentence from "Bank-PDF (rules 100+) is reserved for a future spec extension." to "All three surfaces are covered." Update line 427 to add `tests/codec_round_trip_bank_pdf.rs` to the round-trip-test enumeration. Update line 429 to include `just regen-fixtures bank-pdf` in the fixture-regeneration enumeration.
  - `docs/todo.md` — close the `(codec/bank-pdf)` entry at lines 31-33 (delete the section and the trailing `---` separator). The pre-existing `(docs/contract-drift)` entry at lines 5-7 surfaced during this PR's contract-reviewer pass; leave it intact (deferred per the defer-pre-existing-findings pattern).
- [ ] Spec check (`spec-checker`).
- [ ] Commit checkpoints (single PR — see PR Plan):
  - `refactor(bsr): move BankStatementParseResult into bank_pdf_codec; promote data-mapping literals (IFC-100, IFC-103)`
  - `feat(ifc): add bank-pdf surface to generate_fixtures binary with two scenarios (IFC-102)`
  - `test(ifc): add bank-pdf round-trip test and typed fixture helper (IFC-051, IFC-101)`
  - `ci(ifc): extend dev-fixtures workflow for bank-pdf surface (IFC-042)`
  - `docs(ifc): document bank-pdf surface in ARCHITECTURE.md; close codec/bank-pdf todo`

---

## 2. Detailed Implementation Plan

### Migrations

None. This feature does not touch the database (spec § Entity Definition; no IFC-100.. rule mentions schema).

---

### Backend

> All paths absolute from repo root. Every path below has been verified against the codebase.
> No production-API surface change: every type still resolves under `patient_manager_app::use_cases::bank_statement_reconciliation::*` after the move.

#### Codec move — `src-tauri/src/use_cases/bank_statement_reconciliation/bank_pdf_codec.rs` (NEW)

Owns:

- `pub struct BankStatementCreditLine` — moved verbatim from `parser.rs:8-16`. `PartialEq` added to derive list (was: `Debug, Clone, Serialize, Deserialize, Type`).
- `pub struct BankStatementParseResult` — moved verbatim from `parser.rs:19-31`. `PartialEq` added to derive list (was: `Debug, Clone, Serialize, Deserialize, Type`).
- The 7 data-mapping `pub const`s listed under IFC-100/IFC-103 above (`IBAN_HEADER_MARKER`, `IBAN_COUNTRY_PREFIX`, `PERIOD_PREFIX`, `PERIOD_SEPARATOR`, `VIR_SEPA_MARKER`, `LABEL_TRAILING_SUFFIX`, `FRENCH_AMOUNT_DECIMAL`).

Wired in `src-tauri/src/use_cases/bank_statement_reconciliation/mod.rs` by adding `pub mod bank_pdf_codec;` next to the existing `pub mod parser;` (line 4 currently). The existing `pub use parser::{BankStatementCreditLine, BankStatementParseResult};` at line 11 stays unchanged — it will resolve through `parser.rs`'s new `pub use super::bank_pdf_codec::{...};` re-export. Specta walks the actual `#[derive(Type)]` definitions, which now live in `bank_pdf_codec.rs`; the `bindings.ts` block for `BankStatementParseResult` and `BankStatementCreditLine` is byte-equivalent.

Re-export added in `parser.rs` (insert near line 1, before the existing `use regex::Regex;` block):

```rust
pub use super::bank_pdf_codec::{BankStatementCreditLine, BankStatementParseResult};
```

This means every `use ...parser::{BankStatementParseResult}` import (verified call-sites: `mod.rs:11`, `api.rs:14`) continues to resolve. **No call site is touched.**

| Rule                | Implementation site                                                                                                                             | Notes                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| IFC-100             | `bank_pdf_codec.rs` (new) — types + 7 constants                                                                                                 | Independent sibling of `excel_codec.rs` and `fund_pdf_codec.rs`; no shared abstraction.                            |
| IFC-103 (move part) | The move itself + `PartialEq` derive                                                                                                            | Production parser semantics unchanged; `PartialEq` is additive.                                                    |
| IFC-023             | The codec is a sibling module of `excel_codec.rs` and `fund_pdf_codec.rs`. They share no `use` statements, no traits, no helpers, no constants. | The dev-binary's atomic-write helper is duplicated in each surface's writer module to honor the spirit of IFC-023. |

#### Parser refactor — `src-tauri/src/use_cases/bank_statement_reconciliation/parser.rs`

Affected literals (current locations):

- `parser.rs:59` — IBAN regex with literal `FR` country prefix.
- `parser.rs:74` — period regex with literal `du ` and `au`.
- `parser.rs:78` — period emit-side `format!("du {} au {}", start, end)`.
- `parser.rs:97-99` — credit-line regex with literal `VIR\s+SEPA`.
- `parser.rs:125` — `if label.ends_with("SEPA")`.
- `parser.rs:126` — `label[..label.len() - 4]`.
- `parser.rs:189` — `cleaned.replace(',', ".")`.

Refactor strategy:

- Replace the three `Regex::new(...).ok()?` / `Regex::new(...)` invocations inside `extract_iban`, `extract_period`, `extract_credit_lines` with module-level `LazyLock<Regex>` blocks built from `format!` interpolations of the codec constants (sketch in Workflow above). This is the same pattern fund-PDF uses at `pdf_parser.rs:LazyLock<Regex>`.
- Replace the `format!("du {} au {}", start, end)` with `format!("{prefix}{start}{sep}{end}", ...)`.
- Replace the trailing-`SEPA` slice with `LABEL_TRAILING_SUFFIX.len()` arithmetic (preserves correctness when the constant changes length — but the constant won't change; this is a maintainability bonus, not the feature).
- Replace `cleaned.replace(',', ".")` with `cleaned.replace(codec::FRENCH_AMOUNT_DECIMAL, ".")`.

What stays inline (per IFC-103, NOT promoted):

- The IBAN length threshold `>= 14` at `parser.rs:63` — heuristic filter.
- Validation regex meta-shape (`I\.?B\.?A\.?N\.?`, `\d{2}/\d{2}/\d{4}`, `[\d\s]+,\d{2}`).
- `convert_date_to_iso` (`parser.rs:174-185`) — date helper.
- `parse_french_amount` (`parser.rs:188-191`) — amount helper.
- The trailing-`SEPA` cleanup _logic_ (`ends_with` + slice + `is_empty` skip) — parser internal.
- The `VIR\s+SEPA` whitespace tolerance — preserved by the regex `\s+` rebuild from the constant's space-split.

Existing inline test block (`parser.rs:193-333`, 12 tests) is the regression net. None must be touched. They cover: IBAN extraction (with and without spaces), period extraction (with and without spaces around `au`), date conversion, French amount parsing, credit-line extraction (basic, MGEN, CPAM75-style, CPRPF, hauts-de-seine), non-`VIR SEPA` filtering, full parse end-to-end.

| Rule             | Implementation site                                                  | Notes                                       |
| ---------------- | -------------------------------------------------------------------- | ------------------------------------------- |
| IFC-103          | `parser.rs` regex + format + slice rebuilt from codec constants      | Promotion only; parser semantics unchanged. |
| IFC-022 (analog) | The existing 12 inline tests in `parser.rs` still pass byte-for-byte | Hard regression net.                        |

#### Dev binary — `src-tauri/src/bin/generate_fixtures.rs`

Modify (current state at `generate_fixtures.rs:13-14` declares `mod fixtures_excel; mod fixtures_fund_pdf;`):

```rust
mod fixtures_excel;
mod fixtures_fund_pdf;
mod fixtures_bank_pdf;  // NEW
```

Modify the surface match (currently `generate_fixtures.rs:45-54`):

```rust
match surface {
    "excel" => fixtures_excel::regenerate(&fixtures_root.join("excel"), scenario),
    "fund-pdf" => fixtures_fund_pdf::regenerate(&fixtures_root.join("fund_pdf"), scenario),
    "bank-pdf" => fixtures_bank_pdf::regenerate(&fixtures_root.join("bank_pdf"), scenario),
    other => {
        print_usage();
        anyhow::bail!("unknown surface: {other}")
    }
}
```

Modify `print_usage` (`generate_fixtures.rs:57-65`) to add the `bank-pdf` line under "Surfaces:":

```rust
eprintln!("  bank-pdf   Bank-statement-reconciliation PDF fixtures");
```

#### Surface module — `src-tauri/src/bin/fixtures_bank_pdf/`

Layout (mirrors `fixtures_fund_pdf/`):

- `mod.rs` — `pub fn regenerate(out_root: &Path, scenario: Option<&str>) -> Result<()>`. Registry of two scenario entries. ~80 LOC, mirrors `fixtures_fund_pdf/mod.rs:24-83` with `BankStatementParseResult` type substitution.
- `scenarios.rs` — two `pub fn` returning `BankStatementParseResult` literals (see "Scenarios design" below). Plus an `emission_order(scenario, data) -> Vec<String>` helper that returns the verbatim text the writer must emit, ONE entry per `Op::ShowText`, in document top-to-bottom order. Same shape as `fixtures_fund_pdf/scenarios.rs:165-199`.
- `writer.rs` — printpdf-backed PDF writer + `write_expected_json` + atomic-write helpers. ~140 LOC, mirrors `fixtures_fund_pdf/writer.rs:1-138` with the `BankStatementParseResult` type substitution and a different emission-formatter that turns `BankStatementCreditLine` into the `DD/MM/YYYY VIR SEPA <LABEL>[SEPA] DD/MM/YYYY <amount>,XX` shape the parser inverts.

| Rule             | Implementation site                                                                                                                                                                                                  | Notes                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| IFC-010, IFC-012 | `bin/generate_fixtures.rs` already gated by `required-features = ["dev-fixtures"]`. The new module sits inside it. The CLI extends with `bank-pdf` as a third surface arg without breaking `excel` or `fund-pdf`.    | No Cargo change.           |
| IFC-013          | No new write-side dep. `printpdf` is already prod (FPR consumer). IFC-105 extends the IFC-065 carve-out transitively.                                                                                                | Verified: `Cargo.toml`.    |
| IFC-031, IFC-102 | `fixtures_bank_pdf/scenarios.rs` — two builders.                                                                                                                                                                     | See below.                 |
| IFC-104          | Writer does NOT pin metadata; non-deterministic output is acceptable. The drift guard for `*.pdf` is already excluded in CI.                                                                                         | Inspection-only artifact.  |
| IFC-105          | Writer reuses `printpdf` and the embedded Roboto-Regular at `src-tauri/resources/fonts/Roboto-Regular.ttf` (already in-tree for FPR; reused by fund-PDF writer).                                                     | No new write-side library. |
| IFC-034          | `writer.rs` atomic-save helper (temp + rename + cleanup-on-fail), copied inline from the fund-PDF surface's pattern at `fixtures_fund_pdf/writer.rs:108-138`. Per IFC-023 the three surfaces share no helper module. | ≤30 LOC per surface.       |
| IFC-030          | Output paths: `src-tauri/tests/fixtures/bank_pdf/{scenario}.pdf` + `{scenario}.expected.json`.                                                                                                                       | Both atomic-written.       |

#### Writer design — `src-tauri/src/bin/fixtures_bank_pdf/writer.rs`

Strategy (closely follows fund-PDF's `writer.rs`):

1. **Layout**: A4 portrait. Same `MARGIN_X = 20.0` mm, `MARGIN_TOP = 280.0` mm, `LINE_STEP = 8.0` mm, `FONT_SIZE_PT = 9.0` as the fund-PDF writer. Y-cursor decreases monotonically; `pdf-extract` recovers reading order from text-stream order.

2. **Per-line emission**: for each entry returned by `scenarios::emission_order(scenario, data)`, emit one `Op::ShowText` block (`StartTextSection` / `SetTextCursor` / `SetFont` / `SetLineHeight` / `ShowText` / `EndTextSection`) — exactly the same `text_ops` helper as `fixtures_fund_pdf/writer.rs:88-106`, copied inline (IFC-023).

3. **Emission order (`scenarios::emission_order`)**: drives the writer with verbatim strings:
   - **Scenario 1 (`happy_path_multi_label`)**: an IBAN-header line, a period-range line, then one credit-line per `BankStatementCreditLine`. Format details:
     - IBAN header: `format!("B.I.C. TESTFRPPXXX {marker} {prefix}<iban-digits-without-FR>", marker=IBAN_HEADER_MARKER, prefix=IBAN_COUNTRY_PREFIX)`. The parser's regex captures the `FR\d[\d\s]*` portion; the BIC prefix is decorative (and present in the existing inline test fixture at `parser.rs:199`). The exact emitted string for IBAN `FR7600000000000000000000000` is `B.I.C. TESTFRPPXXX I.B.A.N. FR7600000000000000000000000`.
     - Period line: `format!("{prefix}{start} {sep_trimmed} {end}", ...)` where `sep_trimmed = "au"` (the parser at `parser.rs:74` uses `\s*au\s*`, so the writer emits `du DD/MM/YYYY au DD/MM/YYYY` with single spaces; the parser-emit reconstruction at `parser.rs:78` uses the same single-space form).
     - Credit line: `format!("{date} {marker} {label_raw} {date} {amount_str}")` where:
       - `date` = `DD/MM/YYYY` (movement date and value date — they may match in the scenario).
       - `marker` = `VIR_SEPA_MARKER` = `VIR SEPA` (single space, IFC-102 emit-side constraint).
       - `label_raw` = scenario-declared raw label (i.e. for the trailing-`SEPA` cleanup case, the writer emits `MUTUELLEGENERALEEDUCATIONNATSEPA` so the parser's `ends_with("SEPA")` cleanup yields `MUTUELLEGENERALEEDUCATIONNAT` — which is what the scenario declares as `BankStatementCreditLine.label`).
       - `amount_str` = French-formatted amount with `,XX` (no thousand separator unless the scenario amount exceeds 999,99 €). Same `format_french_amount` helper as fund-PDF (`fixtures_fund_pdf/scenarios.rs:254-266`), copied inline (IFC-023). Scenarios MUST satisfy `amount % 10 == 0` (centimes precision) for round-trip.
   - **Scenario 2 (`iban_period_only_no_credits`)**: IBAN-header line + period line. **NO** `VIR SEPA` lines.

4. **Fonts**: same `include_bytes!("../../../resources/fonts/Roboto-Regular.ttf")` constant as the fund-PDF writer — the path resolves identically from `src/bin/fixtures_bank_pdf/` (one extra `..` versus `use_cases/fund_payment_report_pdf/renderer.rs`, matching the fund-PDF writer's path layout).

5. **Atomic write**: copy of `fixtures_fund_pdf/writer.rs:atomic_write_bytes` and `temp_path_for` inline (~30 LOC).

6. **Determinism**: NOT required (IFC-104). Do not call `set_creation_datetime`. The `.pdf` is excluded from drift via the existing `:(exclude)src-tauri/tests/fixtures/**/*.pdf` pathspec.

#### Scenarios design

**Scenario 1 — `happy_path_multi_label`** (IFC-102 §1):

- `iban: Some("FR7600000000000000000000000")` (27 chars, satisfies the parser's `>= 14` check).
- `period: Some("du 01/05/2025 au 30/05/2025")`.
- `credit_lines: vec![...]` — at least 3 entries to comfortably satisfy "several credit lines" + "at least two distinct fund labels" + "at least one trailing-`SEPA` cleanup case":
  - Line A: `date = "2025-05-02"`, `label = "CPAM01"`, `amount = 100_000` (= 100,00 €). Raw form emitted: `02/05/2025 VIR SEPA CPAM01 02/05/2025 100,00`. No `SEPA` suffix on the raw label, no cleanup applied — exercises the no-cleanup path.
  - Line B: `date = "2025-05-15"`, `label = "MUTUELLEGENERALEEDUCATIONNAT"`, `amount = 50_000` (= 50,00 €). Raw form emitted: `15/05/2025 VIR SEPA MUTUELLEGENERALEEDUCATIONNATSEPA 15/05/2025 50,00`. The parser's `ends_with("SEPA")` cleanup strips the trailing 4 chars to yield the declared label — exercises the cleanup path. **This satisfies IFC-102 §1's trailing-`SEPA` cleanup requirement.**
  - Line C: `date = "2025-05-20"`, `label = "CPAMHAUTSDESEINE"`, `amount = 75_000` (= 75,00 €). Raw form emitted: `20/05/2025 VIR SEPA CPAMHAUTSDESEINE 20/05/2025 75,00`. Distinct third label (also satisfies "at least 2 distinct labels" trivially with B and C alone — adding A makes the scenario a closer model of a real statement).
- `total_credits: 225_000` (= 100_000 + 50_000 + 75_000, matching IFC-102 §1's "MUST equal the sum" requirement; `parse_bank_statement` computes this from the credit_lines).
- `unparsed_count: 0` (hardcoded by parser at `parser.rs:52`, asserted by IFC-102 §2's matching clause for §1).

**Scenario 2 — `iban_period_only_no_credits`** (IFC-102 §2):

- `iban: Some("FR7600000000000000000000000")`.
- `period: Some("du 01/05/2025 au 30/05/2025")`.
- `credit_lines: vec![]` (empty — no `VIR SEPA` lines emitted by the writer).
- `total_credits: 0` (sum of empty vec).
- `unparsed_count: 0`.
- The writer emits ONLY the IBAN-header line and the period line. No `VIR SEPA` lines; no continuation/reference lines. The parser walks `text.lines()`, finds zero lines containing both `VIR` and `SEPA`, returns an empty `credit_lines` vec.

> Models the input shape that triggers BAS R26 (`NoVirSepaLines`) at the Tauri-command layer (`api.rs:46-49` returns `Err("NO_VIR_SEPA_LINES")`). The codec round-trip target is `parser::parse_bank_statement` (which never errors), NOT the command — IFC-102 §2 explicitly carves R26 out of codec scope. Command-layer R26 coverage belongs in the existing/future `tests/bank_statement_reconciliation.rs` integration test suite, not here.

#### Round-trip integration test — `src-tauri/tests/codec_round_trip_bank_pdf.rs` (NEW)

```rust
#![cfg(feature = "dev-fixtures")]
//! Round-trip integration tests for the Import Fixture Codec, bank-PDF surface.
//!
//! Spec: docs/spec/import-codec-fixtures.md, rules IFC-101, IFC-102, IFC-051.
//! Plan: docs/plan/codec-bank-pdf-plan.md, §Round-trip integration test.
//!
//! # Round-trip property (IFC-101)
//!
//! For every committed bank-PDF scenario:
//!
//!   `parse(extract_text(generate(scenario))) == scenario`
//!
//! Full structural equality — NO carve-outs. `BankStatementParseResult` carries
//! no session-scoped fields; every field (`iban`, `period`, every
//! `BankStatementCreditLine` member, `total_credits`, `unparsed_count`) is
//! compared directly via `assert_eq!`.
//!
//! # Equality strategy
//!
//! `PartialEq` is derived on `BankStatementParseResult` and
//! `BankStatementCreditLine` in `bank_pdf_codec.rs` (added by the codec move).
//!
//! # Feature gate
//!
//! `#![cfg(feature = "dev-fixtures")]` (IFC-051). Standard `cargo test` skips
//! this file entirely.

mod common;

use patient_manager_app::use_cases::bank_statement_reconciliation::parser;
use patient_manager_app::use_cases::fund_payment_reconciliation::parsing::extract_pdf_text;

#[test]
fn bank_pdf_happy_path_multi_label_round_trips() {
    let (pdf_path, expected) = common::fixtures::bank_pdf::happy_path_multi_label();
    let extracted = extract_pdf_text(&pdf_path)
        .expect("text extraction must succeed on a committed fixture PDF");
    let parsed = parser::parse_bank_statement(&extracted);
    assert_eq!(
        expected, parsed,
        "round-trip failed for happy_path_multi_label: \
         parse(extract_text(generate(scenario))) must equal scenario on every field \
         (IFC-101 — no carve-outs)"
    );
}

#[test]
fn bank_pdf_iban_period_only_no_credits_round_trips() {
    let (pdf_path, expected) = common::fixtures::bank_pdf::iban_period_only_no_credits();
    let extracted = extract_pdf_text(&pdf_path)
        .expect("text extraction must succeed on a committed fixture PDF");
    let parsed = parser::parse_bank_statement(&extracted);
    assert_eq!(
        expected, parsed,
        "round-trip failed for iban_period_only_no_credits: \
         parse(extract_text(generate(scenario))) must equal scenario on every field \
         (IFC-101 — no carve-outs). This scenario models the BAS R26 input shape; \
         R26 itself is enforced at the Tauri-command layer and is out of codec scope."
    );
}
```

Notes:

- The file uses `mod common;` to pull in `tests/common/mod.rs`. Each integration-test binary in `tests/` gets its own `common/` import; this is idiomatic and matches `tests/codec_round_trip.rs`, `tests/codec_round_trip_fund_pdf.rs`.
- `extract_pdf_text` from `parsing::pdf_extractor` is `pub use`-exported through `parsing/mod.rs:7`. Same import as the fund-PDF round-trip test. The cross-context use is a pre-existing pattern (`bank_statement_reconciliation/api.rs:8` already imports it).
- `parser::parse_bank_statement` is `pub` and synchronous — no `#[tokio::test]` needed (unlike fund-PDF's `extract_pdf_text` which is sync but the fund-PDF tests were `#[test]`-ish; in fact `tests/codec_round_trip_fund_pdf.rs` uses plain `#[test]` per `:54`). Confirm at test-writing time.

#### Trade-off: one round-trip file per surface vs. extending the existing one

**Decision**: separate file (`tests/codec_round_trip_bank_pdf.rs`). Same reasoning as the fund-PDF precedent:

- Each `tests/*.rs` is its own integration-test binary; keeping surfaces separate makes test-output paths and CI step names self-describing.
- The `#![cfg(feature = "dev-fixtures")]` gate sits at the file level — keeping surface scope per file makes the gate locality obvious.
- IFC-023 surface independence is reinforced.
- Trade-off accepted: three binaries means three compile units, marginally slower CI. The dev-fixtures CI job is itself dedicated and infrequent (only fires on path-matched changes).

#### CI workflow — `.github/workflows/dev-fixtures.yml` (modify)

Current state:

- `paths:` (under both `pull_request` at lines 13-26 and `push` at lines 28-42) currently lists `fixtures_excel`, `fixtures_fund_pdf`, `excel_import`, `fund_payment_reconciliation`, `codec_round_trip.rs`, `codec_round_trip_fund_pdf.rs`. Extend BOTH lists with:
  ```yaml
  - "src-tauri/src/bin/fixtures_bank_pdf/**"
  - "src-tauri/src/use_cases/bank_statement_reconciliation/**"
  - "src-tauri/tests/codec_round_trip_bank_pdf.rs"
  ```
- Regen step pair (lines 75-80) currently runs excel + fund-pdf. Add a sibling step right after fund-pdf:
  ```yaml
  - name: Regenerate fixtures (bank-pdf)
    working-directory: src-tauri
    run: cargo run --features dev-fixtures --bin generate_fixtures -- bank-pdf
  ```
- Drift step at lines 89-90:
  ```yaml
  - name: Drift check (IFC-041)
    run: git diff --exit-code -- src-tauri/tests/fixtures/ ':(exclude)src-tauri/tests/fixtures/**/*.pdf'
  ```
  **NO CHANGE.** The `**/*.pdf` glob already covers `tests/fixtures/bank_pdf/*.pdf`. Verified: the same expression matches both `tests/fixtures/fund_pdf/*.pdf` and `tests/fixtures/bank_pdf/*.pdf`. Re-run locally after `just regen-fixtures bank-pdf` to confirm zero diff on the JSON snapshots.
- Round-trip step at lines 91-93:
  ```yaml
  - name: Round-trip tests (IFC-051)
    working-directory: src-tauri
    run: cargo test --features dev-fixtures --test codec_round_trip --test codec_round_trip_fund_pdf
  ```
  Extend to:
  ```yaml
  - name: Round-trip tests (IFC-051)
    working-directory: src-tauri
    run: cargo test --features dev-fixtures --test codec_round_trip --test codec_round_trip_fund_pdf --test codec_round_trip_bank_pdf
  ```

#### Justfile — no changes

The existing recipe `regen-fixtures SURFACE='excel' SCENARIO=''` (`justfile:21-22`) accepts `bank-pdf` as the SURFACE argument because the dev binary handles dispatch. Both `just regen-fixtures bank-pdf` and `just regen-fixtures bank-pdf happy_path_multi_label` work without recipe changes. Verified by inspection.

The `coverage-be` recipe at `justfile:45` excludes `src/bin/fixtures_excel/*` from tarpaulin coverage but does NOT mention `fixtures_fund_pdf` or `fixtures_bank_pdf`. **This is a pre-existing gap from PR #13 that this PR does not introduce; treat as out-of-scope.** (Plan-reviewer: confirm this is acceptable; if a fix is desired, it should be a separate trivial PR or piggybacked here only with explicit user approval.)

#### Production-build verification

Same step as the IFC pilot and PR #13:

```
cd src-tauri && cargo check --no-default-features
```

must succeed and `cargo build --release` must show no new dependencies linked. (`printpdf` is already linked by the FPR renderer; this PR does not add a new prod-side dep.)

---

### Frontend

**No-op — explicitly.** This feature has no frontend slice. Specifically:

- No new file under `src/features/`.
- No new entry in `src/bindings.ts` — the codec move uses a `pub use` re-export so Specta resolves `BankStatementParseResult`/`BankStatementCreditLine` to the same TypeScript shapes it already produces. **The `just generate-types` diff MUST be empty.** That command runs as a guard, not as a real synchronization step.
- No i18n strings.
- No visual proof. PR body must contain: `No visual impact — Rust-only dev tooling change.`

---

### Rules Coverage

| Rule        | Theme                                 | Implementation site                                                                                                                                                                                                                                                | Notes                                                                        |
| ----------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| IFC-010     | Tool surface (carry-over)             | `src-tauri/Cargo.toml [[bin]]` already gates `generate_fixtures` with `required-features = ["dev-fixtures"]`; the new module sits inside it.                                                                                                                       | No Cargo change.                                                             |
| IFC-011     | Tool surface (carry-over)             | Existing `dev-fixtures` feature already gates the binary; extension is module-internal.                                                                                                                                                                            | No Cargo change.                                                             |
| IFC-012     | Tool surface                          | `src-tauri/src/bin/generate_fixtures.rs` match arm extended with `"bank-pdf"`; `print_usage` updated.                                                                                                                                                              | Existing CLI shape preserved.                                                |
| IFC-013     | Tool surface                          | No new write-side dep. `printpdf` is already prod (FPR consumer); IFC-105 extends the IFC-065 carve-out transitively.                                                                                                                                              | Verified: `Cargo.toml`.                                                      |
| IFC-023     | Codec contract — surface independence | `bank_pdf_codec.rs` is a sibling of `excel_codec.rs` and `fund_pdf_codec.rs`; no shared imports. The dev-binary atomic-write helper is duplicated per surface (≤30 LOC each).                                                                                      | Surface independence preserved.                                              |
| IFC-024     | Codec contract — production code      | `bank_pdf_codec.rs` lives under `src/use_cases/bank_statement_reconciliation/`, not feature-gated. The dev binary depends on it; the parser also depends on it.                                                                                                    | Production-code rule.                                                        |
| IFC-025     | Codec contract — data-mapping only    | `bank_pdf_codec.rs` carries the two contract types + 7 data-mapping `pub const`s; no validation, no I/O, no parsing logic.                                                                                                                                         | Hard rule.                                                                   |
| IFC-030     | Fixture set                           | `src-tauri/tests/fixtures/bank_pdf/{scenario}.pdf` + `{scenario}.expected.json` written by the dev binary, both committed.                                                                                                                                         | Two scenarios = 4 files committed.                                           |
| IFC-031     | Fixture set                           | `src-tauri/src/bin/fixtures_bank_pdf/scenarios.rs` — `pub fn happy_path_multi_label()` and `pub fn iban_period_only_no_credits()` returning `BankStatementParseResult`.                                                                                            | snake_case names with intent.                                                |
| IFC-032     | (carry-over: Excel scenarios)         | Untouched.                                                                                                                                                                                                                                                         | This PR adds bank-PDF, does not modify other surfaces.                       |
| IFC-033     | Fixture set                           | Existing `just regen-fixtures` recipe accepts `bank-pdf` as SURFACE without change.                                                                                                                                                                                | No justfile diff.                                                            |
| IFC-034     | Fixture set                           | `bin/fixtures_bank_pdf/writer.rs` atomic-save helper (temp + rename + cleanup-on-fail), copied inline.                                                                                                                                                             | Both `.pdf` and `.expected.json` go through it.                              |
| IFC-040     | Determinism                           | Not pursued for `*.pdf` (per IFC-104). The `.expected.json` snapshot remains deterministic via `serde_json::to_string_pretty`.                                                                                                                                     | Fallback clause invoked.                                                     |
| IFC-041     | Determinism — drift guard             | `.github/workflows/dev-fixtures.yml` drift step's `:(exclude)src-tauri/tests/fixtures/**/*.pdf` pathspec already covers bank-PDF outputs; no change needed.                                                                                                        | Pathspec already glob-correct.                                               |
| IFC-042     | Determinism — CI job                  | Same workflow file extended with the bank-PDF regen step + the new round-trip test invocation, in the same single job.                                                                                                                                             | Standard `ci.yml` `backend` job stays unchanged.                             |
| IFC-050     | Test consumption                      | `src-tauri/tests/common/fixtures.rs` extended with `pub mod bank_pdf` exposing `happy_path_multi_label()` and `iban_period_only_no_credits()`.                                                                                                                     | Mirrors the fund-PDF helper.                                                 |
| IFC-051     | Test consumption                      | `src-tauri/tests/codec_round_trip_bank_pdf.rs` (new) — `#![cfg(feature = "dev-fixtures")]`. Two `#[test]` functions.                                                                                                                                               | Standard `cargo test` skips it.                                              |
| **IFC-100** | bank-PDF codec                        | New file `src-tauri/src/use_cases/bank_statement_reconciliation/bank_pdf_codec.rs` carrying `BankStatementParseResult` + `BankStatementCreditLine` + 7 data-mapping `const`s. `parser.rs` `pub use`s the two types so external callers and Specta see no change.   | Sibling of `excel_codec.rs` and `fund_pdf_codec.rs`.                         |
| **IFC-101** | bank-PDF round-trip                   | `tests/codec_round_trip_bank_pdf.rs` asserts full structural equality on `BankStatementParseResult` (no carve-outs). Both types gain `PartialEq` to enable `assert_eq!`. `Option<String>` for `iban`/`period` compares structurally.                               | Round-trip target is `parser::parse_bank_statement` (NOT the Tauri command). |
| **IFC-102** | bank-PDF scenarios                    | Two scenarios: `happy_path_multi_label` (IBAN + period + 3 credit lines covering trailing-`SEPA` cleanup and 2+ distinct labels) and `iban_period_only_no_credits` (IBAN + period, zero credit lines).                                                             | See "Scenarios design".                                                      |
| **IFC-103** | bank-PDF generator-only               | Codec move + literal-to-constant promotion in `parser.rs` regex / format / slice / replace. The 7 promoted literals are listed above. Validation regex shapes / threshold / cleanup logic / helpers stay inline. `PartialEq` derive is additive (no shape change). | Parser semantics unchanged; existing 12 inline tests are the regression net. |
| **IFC-104** | bank-PDF non-determinism              | Writer does NOT pin metadata. CI drift check excludes `*.pdf` via existing `:(exclude)**/*.pdf` pathspec.                                                                                                                                                          | Round-trip test is the load-bearing correctness check.                       |
| **IFC-105** | bank-PDF write-side library reuse     | Writer reuses `printpdf` (already prod for FPR; reused by fund-PDF writer). `Cargo.toml` unchanged.                                                                                                                                                                | No second PDF write-side library.                                            |

---

## 3. PR Plan

- **Strategy**: **1 PR** (BE-only; mirrors PR #13's shape; no UI slice; tightly coupled — codec move, parser refactor, dev-binary extension, fixtures, round-trip test, and CI workflow change all land coherently together).
- **Estimate**:
  - BE: ~13 files / ~700 LOC.
    - `bank_pdf_codec.rs` (new, ~100 LOC: 2 type definitions moved + `PartialEq` derive added + 7 const declarations + module-doc).
    - `parser.rs` (modified, ~50 LOC delta: type definitions removed, `pub use` line added, three `LazyLock<Regex>` blocks replacing inline `Regex::new`s, three constant-substitutions in format/slice/replace).
    - `mod.rs` (modified, +1 line: `pub mod bank_pdf_codec;`).
    - `bin/generate_fixtures.rs` (modified, ~5 LOC delta: new `mod` + match arm + usage string).
    - `bin/fixtures_bank_pdf/mod.rs` (new, ~80 LOC: registry + regenerate fn).
    - `bin/fixtures_bank_pdf/scenarios.rs` (new, ~150 LOC: two literal `BankStatementParseResult` builders + emission_order + format_credit_line + format_french_amount).
    - `bin/fixtures_bank_pdf/writer.rs` (new, ~140 LOC: PDF emission with printpdf + JSON snapshot + atomic helpers).
    - `tests/common/fixtures.rs` (modified, ~45 LOC delta: `pub mod bank_pdf` block).
    - `tests/codec_round_trip_bank_pdf.rs` (new, ~55 LOC: two `#[test]` functions).
    - `.github/workflows/dev-fixtures.yml` (modified, ~10 LOC delta: paths × 2 + regen step + round-trip step extension).
    - `ARCHITECTURE.md` (modified, ~5 LOC delta: third row in surface-coverage table + sentence updates on lines 425/427/429).
    - `docs/todo.md` (modified, -3 LOC: close `(codec/bank-pdf)` entry).
    - 4 fixture artifacts committed (`*.pdf` + `*.expected.json` × 2 scenarios).
  - FE: 0 files / 0 LOC.
  - Coupling: tight. The codec move, the parser refactor, the dev-binary surface, and the round-trip test are co-dependent and meaningless individually.
- **PR list**:
  - **PR #1** — `feat(ifc): import fixture codec — bank-PDF surface`
    - **Scope**: every Workflow TaskList checkpoint (Phase 2 backend + Phase 4 closure).
    - **Dependency**: none — branches off `main`.
    - **Branch suffix**: `feat/codec-bank-pdf`.
    - **Body must include**: `No visual impact — Rust-only dev tooling change.` AND a one-line note that the spike-locked emission pattern from PR #13 transfers directly (no spike re-run).

Threshold check: BE files ~13, BE LOC ~700. The 1-PR threshold from the planner doctrine is 20 files / 500 LOC. We exceed the LOC line by ~200 but stay well under the file count, and the BE-only nature with no UI/E2E/contract overhead keeps the review surface small and uniform. Coupling argues strongly against splitting (the codec move, the parser refactor, and the round-trip test that validates them must merge together to avoid a transient broken intermediate state). PR #13 set the precedent for this exact shape and merged successfully. **Recommendation: 1 PR.** Confirmed by user pre-decision in the brief.

---

## Notes for the next gate

- **Mandatory next step**: `plan-reviewer` agent reviews this plan. Block on critical findings before any test-writer subagent runs.
- **Specta-equivalence gate**: the `just generate-types` diff after the codec move must be empty. If non-empty, the move broke the public type surface — investigate before proceeding.
- **No spike gate**: the fund-PDF spike (2026-05-08) covers every character class bank-PDF needs. If the round-trip test fails for an unforeseen reason (e.g. multi-space `VIR\s+SEPA` whitespace handling regresses), revisit before adjusting scenarios.
- **Pre-existing TODO drift**: the `(docs/contract-drift)` entry at `docs/todo.md:5-7` was surfaced by contract-reviewer during this PR's contract review. It documents `iban`/`period` `String` vs `Option<String>` drift in the contract document (the runtime types are `Option<String>`, the contract says `String` with prose carve-out). Per the defer-pre-existing-findings pattern, this is NOT in scope for this PR. Leave the entry intact when closing the `(codec/bank-pdf)` entry.
- **Locked decisions** (from /start interview, NOT to be re-litigated by plan-reviewer):
  - Codec module name: `bank_pdf_codec.rs` under `use_cases/bank_statement_reconciliation/` ✓
  - Round-trip target: `parser::parse_bank_statement` (NOT the Tauri command — R26 is out of codec scope per IFC-101/IFC-102 §2) ✓
  - Round-trip equality: full structural, no carve-outs ✓
  - Two scenarios: multi-label happy path + IBAN/period-only (zero credits) ✓
  - Output non-deterministic, drift excludes `*.pdf` (already covered by existing pathspec) ✓
  - `printpdf` reuse, no second PDF write-side library ✓
  - Codec scope: 7 data-mapping literals only ✓
  - Surface independence: no shared traits/helpers/constants with Excel or fund-PDF codecs ✓
  - Existing `dev-fixtures` feature extended, not replaced ✓
  - Existing `generate_fixtures` binary extended with surface arg, not forked ✓
  - `PartialEq` derive added on both types — additive, IFC-103-compliant ✓
- **No contract-reviewer**: the contract is unchanged for this PR; contract-reviewer has already issued the no-change verdict.

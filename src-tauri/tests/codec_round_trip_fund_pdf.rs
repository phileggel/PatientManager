#![cfg(feature = "dev-fixtures")]
//! Round-trip integration tests for the Import Fixture Codec, fund-PDF surface.
//!
//! Spec: docs/spec/import-codec-fixtures.md, rules IFC-061, IFC-062, IFC-051.
//! Plan: docs/plan/codec-fund-pdf-plan.md, §Round-trip integration test.
//!
//! # Round-trip property (IFC-061)
//!
//! For every committed fund-PDF scenario:
//!
//!   `parse(extract_text(generate(scenario))) == scenario`
//!
//! Full structural equality — NO carve-outs. Unlike the Excel surface, `PdfParseResult`
//! carries no session-scoped fields, so every field (every `PdfProcedureGroup` member
//! including `is_total_valid`, every `NormalizedPdfLine` field including `line_index`,
//! `unparsed_line_count`, and the full contents of `unparsed_lines`) is compared
//! directly via `assert_eq!`.
//!
//! # Equality strategy
//!
//! Option A from the plan (§Round-trip integration test, ~line 430): `PartialEq` is
//! derived on `PdfParseResult` and `PdfProcedureGroup` in `api.rs`. `NormalizedPdfLine`
//! already derived `PartialEq` before this PR. `assert_eq!` therefore compiles and
//! produces a diff on failure.
//!
//! # Feature gate
//!
//! `#![cfg(feature = "dev-fixtures")]` (IFC-051). Standard `cargo test` (no features)
//! skips this file entirely. Only the dev-fixtures CI job enables the feature.

mod common;

use patient_manager_app::shared::pdf_extractor::extract_pdf_text;
use patient_manager_app::use_cases::fund_payment_reconciliation::parsing::pdf_parser;

// ---------------------------------------------------------------------------
// Scenario 1 — multi-fund happy path (IFC-062 §1)
// ---------------------------------------------------------------------------

/// Assert round-trip for the `happy_path_multi_fund` scenario.
///
/// Loads `(pdf_path, expected: PdfParseResult)` from the typed fixture helper
/// (IFC-050). Extracts text from the committed `.pdf` using the production
/// extractor (`parsing::extract_pdf_text`). Parses the extracted text using the
/// production parser (`pdf_parser::parse_pdf_text`). Asserts full structural
/// equality with no carve-outs (IFC-061).
///
/// This scenario covers:
/// - 2 `Total réglé le` blocks for two different funds.
/// - At least one `NormalizedPdfLine` with a period date range (`is_period = true`).
/// - Both groups have `is_total_valid = true`.
/// - `unparsed_line_count = 0` and `unparsed_lines` is empty.
#[test]
fn fund_pdf_happy_path_multi_fund_round_trips() {
    let (pdf_path, expected) = common::fixtures::fund_pdf::happy_path_multi_fund();

    let extracted = extract_pdf_text(&pdf_path)
        .expect("text extraction must succeed on a committed fixture PDF");

    let parsed = pdf_parser::parse_pdf_text(&extracted);

    assert_eq!(
        expected, parsed,
        "round-trip failed for happy_path_multi_fund: \
         parse(extract_text(generate(scenario))) must equal scenario on every field \
         (IFC-061 — no carve-outs)"
    );
}

// ---------------------------------------------------------------------------
// Scenario 2 — unparsed line present (IFC-062 §2)
// ---------------------------------------------------------------------------

/// Assert round-trip for the `unparsed_line_present` scenario.
///
/// This scenario's PDF contains a line that the parser classifies as unparsed:
/// a string containing `/`, at least one ASCII digit, and length > 30 that
/// matches neither the data-line nor the total-line pattern.
///
/// The scenario builder declares the exact expected `unparsed_lines` content
/// up-front (IFC-062 §2). The round-trip test verifies that:
/// 1. `unparsed_line_count >= 1` (the generator emitted the intended bad line).
/// 2. Full structural equality holds on all fields, including the declared
///    `unparsed_lines` content (IFC-061 — no carve-outs).
///
/// Without step 2, a trivially-passing scenario that emits no bad lines would
/// not be caught; the equality assertion on `unparsed_line_count` makes this
/// non-trivial.
#[test]
fn fund_pdf_unparsed_line_present_round_trips() {
    let (pdf_path, expected) = common::fixtures::fund_pdf::unparsed_line_present();

    let extracted = extract_pdf_text(&pdf_path)
        .expect("text extraction must succeed on a committed fixture PDF");

    let parsed = pdf_parser::parse_pdf_text(&extracted);

    // Non-trivial guard: if the generator failed to emit the intended unparsed
    // line, this assertion catches it before the full equality check below.
    assert!(
        parsed.unparsed_line_count >= 1,
        "unparsed_line_present scenario must produce at least one unparsed line; \
         got zero — the generator did not emit the intended unparsed line content"
    );

    assert_eq!(
        expected, parsed,
        "round-trip failed for unparsed_line_present: \
         parse(extract_text(generate(scenario))) must equal scenario on every field \
         including unparsed_lines content (IFC-061 — no carve-outs)"
    );
}

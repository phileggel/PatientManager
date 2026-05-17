#![cfg(feature = "dev-fixtures")]
//! Round-trip integration tests for the Import Fixture Codec, bank-PDF surface.
//!
//! Spec: docs/spec/import-codec-fixtures.md, rules IFC-101, IFC-102.
//! Plan: docs/plan/codec-bank-pdf-plan.md, §Round-trip integration test.
//!
//! # Round-trip property (IFC-101)
//!
//! For every committed bank-PDF scenario:
//!
//!   `parse(extract_text(generate(scenario))) == scenario`
//!
//! Full structural equality — no carve-outs. `BankStatementParseResult` carries
//! no session-scoped fields: `iban`, `period`, `credit_lines`, `total_credits`,
//! and `unparsed_count` (always 0) are all deterministic.
//!
//! # Round-trip target (IFC-101)
//!
//! The round-trip target is `parser::parse_bank_statement(text: &str)`, NOT the
//! Tauri command wrapper. The R26 NoVirSepaLines guard fires at the command layer
//! after the parser returns; it is out of codec scope.
//!
//! # Feature gate
//!
//! `#![cfg(feature = "dev-fixtures")]` (IFC-051). Standard `cargo test` skips
//! this file entirely; only the dev-fixtures CI job enables the feature.

mod common;

use patient_manager_app::shared::pdf_extractor::extract_pdf_text;
use patient_manager_app::use_cases::bank_statement_reconciliation::parser;

// ---------------------------------------------------------------------------
// Scenario 1 — multi-label happy path (IFC-102 §1)
// ---------------------------------------------------------------------------

/// Assert round-trip for the `happy_path_multi_label` scenario.
///
/// Loads `(pdf_path, expected: BankStatementParseResult)` from the typed fixture
/// helper (IFC-050). Extracts text from the committed `.pdf` using the production
/// extractor. Parses the extracted text using the production parser
/// (`bank_statement_reconciliation::parser::parse_bank_statement`). Asserts full
/// structural equality with no carve-outs (IFC-101).
///
/// This scenario covers:
/// - IBAN and period extracted from the PDF header.
/// - Multiple VIR SEPA credit lines with distinct fund labels.
/// - `total_credits` equals the sum of all credit line amounts.
/// - `unparsed_count = 0`.
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

// ---------------------------------------------------------------------------
// Scenario 2 — IBAN + period only, no credit lines (IFC-102 §2)
// ---------------------------------------------------------------------------

/// Assert round-trip for the `iban_period_only_no_credits` scenario.
///
/// This scenario's PDF contains a valid IBAN and period in the header but no
/// VIR SEPA credit lines. The parser returns a `BankStatementParseResult` with
/// `credit_lines: vec![]` and `total_credits: 0`.
///
/// Note: this shape would trigger the R26 NoVirSepaLines guard at the Tauri
/// command layer. That guard is out of codec scope — the round-trip target is
/// the parser function only (IFC-101 §round-trip target).
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
         (IFC-101 — no carve-outs)"
    );
}

//! Hardcoded scenario builders for the bank-PDF surface (IFC-031, IFC-102).
//!
//! Each builder returns a `BankStatementParseResult` value declaring the
//! expected parse output for its scenario. The writer module produces a
//! `.pdf` file that, when extracted via `pdf_extract::extract_text` and
//! parsed by `parser::parse_bank_statement`, yields exactly this value
//! (IFC-101 — full structural equality, no carve-outs).
//!
//! Unlike the fund-PDF parser, the bank-statement parser does NOT depend on
//! `line_index` — it walks `text.lines()` and filters by `contains("VIR")` /
//! `contains("SEPA")`. The spike-locked emission stride from PR #13
//! (2 leading blanks + 1 separator) is therefore round-trip-invariant for
//! this surface; we can emit each logical line in any order with any blank
//! padding, and the parser only sees the credit-line content.

use patient_manager_app::use_cases::bank_statement_reconciliation::bank_pdf_codec::{
    self as codec, BankStatementCreditLine, BankStatementParseResult,
};

/// Multi-label happy-path scenario per IFC-102 §1.
///
/// One IBAN-header line, one period line, three VIR SEPA credit lines:
/// - CPAM01 with no trailing-`SEPA` cleanup,
/// - MUTUELLEGENERALEEDUCATIONNAT with trailing-`SEPA` cleanup,
/// - CPAMHAUTSDESEINE with no trailing-`SEPA` cleanup.
///
/// `total_credits` equals the sum (225_000); `unparsed_count = 0`.
pub fn happy_path_multi_label() -> BankStatementParseResult {
    BankStatementParseResult {
        iban: Some("FR7600000000000000000000000".to_string()),
        period: Some("du 01/05/2025 au 30/05/2025".to_string()),
        credit_lines: vec![
            BankStatementCreditLine {
                date: "2025-05-02".to_string(),
                label: "CPAM01".to_string(),
                amount: 100_000,
            },
            BankStatementCreditLine {
                date: "2025-05-15".to_string(),
                label: "MUTUELLEGENERALEEDUCATIONNAT".to_string(),
                amount: 50_000,
            },
            BankStatementCreditLine {
                date: "2025-05-20".to_string(),
                label: "CPAMHAUTSDESEINE".to_string(),
                amount: 75_000,
            },
        ],
        total_credits: 225_000,
        unparsed_count: 0,
    }
}

/// IBAN + period only, no credit lines per IFC-102 §2.
///
/// IBAN-header line + period line emitted; no `VIR SEPA` lines emitted.
/// Models the input shape that triggers BAS R26 (`NoVirSepaLines`) at the
/// Tauri-command layer; R26 itself is enforced post-parse and is out of
/// codec scope (IFC-101 §round-trip target).
pub fn iban_period_only_no_credits() -> BankStatementParseResult {
    BankStatementParseResult {
        iban: Some("FR7600000000000000000000000".to_string()),
        period: Some("du 01/05/2025 au 30/05/2025".to_string()),
        credit_lines: vec![],
        total_credits: 0,
        unparsed_count: 0,
    }
}

// ---------------------------------------------------------------------------
// Emission order — the verbatim text the writer must emit, ONE entry per
// `Op::ShowText`, in document top-to-bottom order.
// ---------------------------------------------------------------------------

/// Returns the verbatim text the writer must emit, ONE entry per
/// `Op::ShowText`, in the order they should appear top-to-bottom on the page.
pub fn emission_order(scenario: &str, data: &BankStatementParseResult) -> Vec<String> {
    match scenario {
        "happy_path_multi_label" => emission_happy(data),
        "iban_period_only_no_credits" => emission_iban_only(data),
        other => panic!("unknown scenario: {other}"),
    }
}

fn emission_happy(data: &BankStatementParseResult) -> Vec<String> {
    let mut lines = Vec::new();
    lines.push(format_iban_header(data));
    lines.push(format_period_line(data));
    for credit in &data.credit_lines {
        lines.push(format_credit_line(credit));
    }
    lines
}

fn emission_iban_only(data: &BankStatementParseResult) -> Vec<String> {
    vec![format_iban_header(data), format_period_line(data)]
}

/// Format the IBAN header line, e.g. `B.I.C. TESTFRPPXXX I.B.A.N. FR7600000000000000000000000`.
///
/// The `B.I.C. TESTFRPPXXX` prefix mirrors real bank statements (and the
/// existing inline parser test fixture at `parser.rs:test_extract_iban`).
/// The parser's regex captures only the `FR\d[\d\s]*` portion — the BIC
/// prefix is decorative and the parser ignores everything before
/// `I.B.A.N.`.
fn format_iban_header(data: &BankStatementParseResult) -> String {
    let iban = data
        .iban
        .as_deref()
        .expect("scenario must declare an IBAN to emit the header line");
    format!(
        "B.I.C. TESTFRPPXXX {marker} {iban}",
        marker = codec::IBAN_HEADER_MARKER,
    )
}

/// Format the period line, e.g. `du 01/05/2025 au 30/05/2025`.
///
/// The scenario's `period` field already carries the canonical single-space
/// form (IFC-102 emit-side); we emit it verbatim so the parser's
/// reconstruction at `parser.rs:extract_period` returns byte-identical text.
fn format_period_line(data: &BankStatementParseResult) -> String {
    data.period
        .clone()
        .expect("scenario must declare a period to emit the period line")
}

/// Format one credit line, e.g. `02/05/2025 VIR SEPA CPAM01 02/05/2025 100,00`.
///
/// For labels whose declared `label` is what the parser produces AFTER trailing-
/// `SEPA` cleanup, the raw emission is `label + LABEL_TRAILING_SUFFIX` so the
/// parser strips the suffix and yields the declared value. Scenario builders
/// pre-mark which labels need this suffix-on-emit dance:
///
/// - `CPAM01` and `CPAMHAUTSDESEINE` already lack a trailing `SEPA`, so they
///   are emitted as-is.
/// - `MUTUELLEGENERALEEDUCATIONNAT` is emitted with a trailing `SEPA` so the
///   parser's cleanup yields the declared label.
///
/// The emit-side rule mirrors the real-world bank statements documented at
/// `parser.rs:test_extract_credit_lines_mgen`.
fn format_credit_line(credit: &BankStatementCreditLine) -> String {
    let date_dmy = iso_to_dmy(&credit.date);
    let label_raw = if needs_trailing_sepa_suffix(&credit.label) {
        format!("{}{}", credit.label, codec::LABEL_TRAILING_SUFFIX)
    } else {
        credit.label.clone()
    };
    format!(
        "{date} {marker} {label} {date} {amount}",
        date = date_dmy,
        marker = codec::VIR_SEPA_MARKER,
        label = label_raw,
        amount = format_french_amount(credit.amount),
    )
}

/// Whether a declared label needs the trailing-`SEPA` suffix on emission so
/// the parser's `ends_with(LABEL_TRAILING_SUFFIX)` cleanup yields the label.
///
/// MGEN is the canonical case (`MUTUELLEGENERALEEDUCATIONNAT` raw label gets
/// emitted as `MUTUELLEGENERALEEDUCATIONNATSEPA` for the round-trip).
fn needs_trailing_sepa_suffix(label: &str) -> bool {
    label == "MUTUELLEGENERALEEDUCATIONNAT"
}

/// Convert ISO YYYY-MM-DD to DD/MM/YYYY for emission.
fn iso_to_dmy(iso: &str) -> String {
    let parts: Vec<&str> = iso.split('-').collect();
    assert_eq!(
        parts.len(),
        3,
        "scenario date must be ISO YYYY-MM-DD: got {iso}"
    );
    format!("{}/{}/{}", parts[2], parts[1], parts[0])
}

/// French amount formatting: euros with comma decimal separator, two digits.
/// Scenarios respect the parser's centimes-precision contract by ensuring
/// `amount % 10 == 0` (no thousandths digit). Higher precision would not
/// round-trip — the parser reads `,XX` and multiplies by 1000.
fn format_french_amount(amount_thousandths: i64) -> String {
    debug_assert!(
        amount_thousandths % 10 == 0,
        "scenario amount {amount_thousandths} would lose precision in the parser's centimes \
         round-trip (must satisfy amount % 10 == 0)"
    );
    let cents = amount_thousandths / 10;
    let sign = if cents < 0 { "-" } else { "" };
    let cents_abs = cents.unsigned_abs();
    let euros = cents_abs / 100;
    let centimes = cents_abs % 100;
    format!(
        "{sign}{euros}{sep}{centimes:02}",
        sep = codec::FRENCH_AMOUNT_DECIMAL,
    )
}

//! Hardcoded scenario builders for the fund-PDF surface (IFC-031, IFC-062).
//!
//! Each builder returns a `PdfParseResult` value declaring the expected
//! parse output for its scenario. The writer module produces a `.pdf` file
//! that, when extracted via `pdf_extract::extract_text` and parsed by the
//! production parser, yields exactly this value (IFC-061 — full structural
//! equality, no carve-outs).
//!
//! The `line_index` values are locked by the spike (2026-05-08):
//! `pdf-extract` emits two leading blank lines plus one blank separator
//! between each `Op::ShowText` line. Content lines therefore land at
//! indices 2, 4, 6, 8, … in the extracted text.

use chrono::NaiveDate;
use patient_manager_app::use_cases::fund_payment_reconciliation::fund_pdf_codec::{
    self as codec, NormalizedPdfLine, PdfParseResult, PdfProcedureGroup,
};

fn date(y: i32, m: u32, d: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(y, m, d).expect("valid scenario date")
}

/// Multi-fund happy-path scenario per IFC-062 §1.
///
/// Two `Total réglé le` blocks for two different funds:
/// - CPAM n° 931 with two lines (one period date range)
/// - MGEN with one line
///
/// Both groups have `is_total_valid = true`; `unparsed_line_count = 0`.
///
/// Line index layout (indices set by the spike-locked emission pattern):
/// ```text
///   index 0: "" (leading blank)
///   index 1: "" (leading blank)
///   index 2: data line ALICE MARTIN
///   index 3: ""
///   index 4: data line BOB DURAND (period 28/04/2025 au 30/04/2025)
///   index 5: ""
///   index 6: total line for CPAM
///   index 7: ""
///   index 8: data line CAROL BERNARD
///   index 9: ""
///   index 10: total line for MGEN
/// ```
pub fn happy_path_multi_fund() -> PdfParseResult {
    let group_cpam = PdfProcedureGroup {
        fund_label: "CPAM n° 931".to_string(),
        fund_full_name: "la Caisse".to_string(),
        payment_date: date(2025, 5, 2),
        total_amount: 75_000,
        is_total_valid: true,
        lines: vec![
            NormalizedPdfLine {
                line_index: 2,
                payment_date: date(2025, 5, 2),
                invoice_number: "001".to_string(),
                fund_name: "CPAM n° 931".to_string(),
                patient_name: "ALICE MARTIN".to_string(),
                ssn: "1234567890123".to_string(),
                nature: "SF".to_string(),
                procedure_start_date: date(2025, 4, 28),
                procedure_end_date: date(2025, 4, 28),
                is_period: false,
                amount: 25_000,
            },
            NormalizedPdfLine {
                line_index: 4,
                payment_date: date(2025, 5, 2),
                invoice_number: "002".to_string(),
                fund_name: "CPAM n° 931".to_string(),
                patient_name: "BOB DURAND".to_string(),
                ssn: "9876543210987".to_string(),
                nature: "SF".to_string(),
                procedure_start_date: date(2025, 4, 28),
                procedure_end_date: date(2025, 4, 30),
                is_period: true,
                amount: 50_000,
            },
        ],
    };

    let group_mgen = PdfProcedureGroup {
        fund_label: "MGEN".to_string(),
        fund_full_name: "MGEN".to_string(),
        payment_date: date(2025, 5, 3),
        total_amount: 30_000,
        is_total_valid: true,
        lines: vec![NormalizedPdfLine {
            line_index: 8,
            payment_date: date(2025, 5, 3),
            invoice_number: "003".to_string(),
            fund_name: "MGEN".to_string(),
            patient_name: "CAROL BERNARD".to_string(),
            ssn: "5555555555555".to_string(),
            nature: "SF".to_string(),
            procedure_start_date: date(2025, 4, 28),
            procedure_end_date: date(2025, 4, 28),
            is_period: false,
            amount: 30_000,
        }],
    };

    PdfParseResult {
        groups: vec![group_cpam, group_mgen],
        unparsed_line_count: 0,
        unparsed_lines: vec![],
    }
}

/// Unparsed-line scenario per IFC-062 §2.
///
/// One valid procedure group containing one data line, plus one declared
/// unparsed line that triggers the parser's unparsed-line counter (contains
/// `/`, has ASCII digits, length above the parser's threshold, but matches
/// neither the data-line nor total-line patterns).
///
/// Line index layout:
/// ```text
///   index 0: ""
///   index 1: ""
///   index 2: data line ALICE MARTIN
///   index 3: ""
///   index 4: unparsed reference line
///   index 5: ""
///   index 6: total line for CPAM
/// ```
pub fn unparsed_line_present() -> PdfParseResult {
    let unparsed = "Reference 99/2025-MAL ill-formed receipt entry not data nor total".to_string();

    let group = PdfProcedureGroup {
        fund_label: "CPAM n° 931".to_string(),
        fund_full_name: "la Caisse".to_string(),
        payment_date: date(2025, 5, 2),
        total_amount: 25_000,
        is_total_valid: true,
        lines: vec![NormalizedPdfLine {
            line_index: 2,
            payment_date: date(2025, 5, 2),
            invoice_number: "001".to_string(),
            fund_name: "CPAM n° 931".to_string(),
            patient_name: "ALICE MARTIN".to_string(),
            ssn: "1234567890123".to_string(),
            nature: "SF".to_string(),
            procedure_start_date: date(2025, 4, 28),
            procedure_end_date: date(2025, 4, 28),
            is_period: false,
            amount: 25_000,
        }],
    };

    PdfParseResult {
        groups: vec![group],
        unparsed_line_count: 1,
        unparsed_lines: vec![unparsed],
    }
}

/// Reusable handle so the writer can iterate scenario lines in emission order
/// without re-walking `groups + unparsed_lines` for every scenario.
///
/// Returns the verbatim text the writer must emit, ONE entry per
/// `Op::ShowText`, in the order they should appear top-to-bottom on the page.
/// The order matches the locked `line_index` assignments in the scenario
/// builders above.
pub fn emission_order(scenario: &str, data: &PdfParseResult) -> Vec<String> {
    match scenario {
        "happy_path_multi_fund" => emission_happy(data),
        "unparsed_line_present" => emission_unparsed(data),
        other => panic!("unknown scenario: {other}"),
    }
}

fn emission_happy(data: &PdfParseResult) -> Vec<String> {
    let mut lines = Vec::new();
    for group in &data.groups {
        for line in &group.lines {
            lines.push(format_data_line(line));
        }
        lines.push(format_total_line(group));
    }
    lines
}

fn emission_unparsed(data: &PdfParseResult) -> Vec<String> {
    // Layout: data lines for the only group, then the unparsed line, then the
    // group's total. Placing the unparsed line BEFORE the total keeps it
    // associated with the correct group's text-line region; the parser still
    // counts it as unparsed because it matches neither pattern.
    let group = data.groups.first().expect("scenario has one group");
    let mut lines = Vec::new();
    for line in &group.lines {
        lines.push(format_data_line(line));
    }
    for unparsed in &data.unparsed_lines {
        lines.push(unparsed.clone());
    }
    lines.push(format_total_line(group));
    lines
}

fn format_data_line(line: &NormalizedPdfLine) -> String {
    let date_segment = if line.is_period {
        format!(
            "{start}{sep}{end}",
            start = line.procedure_start_date.format("%d/%m/%Y"),
            sep = codec::DATE_RANGE_SEPARATOR,
            end = line.procedure_end_date.format("%d/%m/%Y"),
        )
    } else {
        line.procedure_start_date.format("%d/%m/%Y").to_string()
    };
    format!(
        "{payment} {invoice} {fund} {patient} {ssn} {nature} {date} {amount} {currency}",
        payment = line.payment_date.format("%d/%m/%Y"),
        invoice = line.invoice_number,
        fund = line.fund_name,
        patient = line.patient_name,
        ssn = line.ssn,
        nature = line.nature,
        date = date_segment,
        amount = format_french_amount(line.amount),
        currency = codec::CURRENCY_SUFFIX,
    )
}

fn format_total_line(group: &PdfProcedureGroup) -> String {
    // Reconstruct the canonical total-line form. If the group's fund_label
    // contains a fund-number marker, emit the parenthetical between
    // TOTAL_LINE_FUND_NUMBER_OPEN and TOTAL_LINE_FUND_NUMBER_CLOSE.
    let fund_number_marker = extract_fund_number(&group.fund_label)
        .map(|n| {
            format!(
                " {open}{n}{close}",
                open = codec::TOTAL_LINE_FUND_NUMBER_OPEN,
                close = codec::TOTAL_LINE_FUND_NUMBER_CLOSE,
            )
        })
        .unwrap_or_default();
    format!(
        "{prefix}{date}{sep}{fund_full}{fund_number_marker} {amount} {currency}",
        prefix = codec::TOTAL_LINE_PREFIX,
        date = group.payment_date.format("%d/%m/%Y"),
        sep = codec::TOTAL_LINE_SEPARATOR,
        fund_full = group.fund_full_name,
        amount = format_french_amount(group.total_amount),
        currency = codec::CURRENCY_SUFFIX,
    )
}

/// French amount formatting: euros with comma decimal separator, two digits.
/// Scenarios respect the parser's centimes-precision contract by ensuring
/// `amount % 10 == 0` (no thousandths digit). Higher precision would not
/// round-trip — the parser reads `,XX €` and multiplies by 1000.
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
    format!("{sign}{euros},{centimes:02}")
}

/// Extract the digits from a fund_label like "CPAM n° 931" → "931".
/// Returns None when the label has no embedded fund number.
fn extract_fund_number(fund_label: &str) -> Option<String> {
    let after_marker = fund_label.split("n°").nth(1)?.trim();
    let digits: String = after_marker
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect();
    if digits.is_empty() {
        None
    } else {
        Some(digits)
    }
}

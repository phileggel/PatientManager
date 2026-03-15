use chrono::NaiveDate;
use regex::Regex;

use crate::use_cases::fund_payment_reconciliation::api::{
    NormalizedPdfLine, PdfParseResult, PdfProcedureGroup,
};
use crate::use_cases::fund_payment_reconciliation::parsing::dates::{
    convert_french_date_to_naive_date, parse_date_range,
};

/// Parse a French date string (DD/MM/YYYY) into NaiveDate.
/// Returns None on failure so callers can treat the line as unparsed.
fn parse_french_date(s: &str) -> Option<NaiveDate> {
    convert_french_date_to_naive_date(s).ok()
}

/// Data line regex pattern (SSN as anchor)
const DATA_LINE_PATTERN: &str = r"^\s*(\d{2}/\d{2}/\d{4})\s+(\d+)\s+(.+)\s+(\d{13})\s+([A-Z]{1,4})\s+(\d{2}/\d{2}/\d{4}(?:\s+au\s+\d{2}/\d{2}/\d{4})?)\s+(-?[\d\s]+,\d{2})\s*€?\s*$";

/// Parse a French-formatted amount string into i64 millièmes
fn parse_amount(raw: &str) -> Option<i64> {
    let cleaned: String = raw.chars().filter(|c| *c != ' ').collect();
    let normalized = cleaned.replace(',', ".");
    let euros: f64 = normalized.parse().ok()?;
    Some((euros * 1000.0).round() as i64)
}

/// Internal raw data line (private — never leaves this module)
struct RawDataLine {
    line_index: u32,
    payment_date_raw: String,
    invoice_number: String,
    fund_name: String,
    ssn: String,
    nature: String,
    procedure_date_raw: String,
    amount: i64,
}

fn parse_raw_data_line(line: &str, line_index: u32) -> Option<RawDataLine> {
    let re = Regex::new(DATA_LINE_PATTERN).ok()?;
    let line = line.trim();
    let caps = re.captures(line)?;
    let amount = parse_amount(caps.get(7)?.as_str())?;
    Some(RawDataLine {
        line_index,
        payment_date_raw: caps.get(1)?.as_str().to_string(),
        invoice_number: caps.get(2)?.as_str().to_string(),
        fund_name: caps.get(3)?.as_str().trim().to_string(),
        ssn: caps.get(4)?.as_str().to_string(),
        nature: caps.get(5)?.as_str().to_string(),
        procedure_date_raw: caps.get(6)?.as_str().to_string(),
        amount,
    })
}

/// Normalize a RawDataLine into a NormalizedPdfLine.
/// Returns None if date parsing fails (line counted as unparsed).
fn normalize_data_line(raw: RawDataLine, patient_name: String) -> Option<NormalizedPdfLine> {
    let payment_date = parse_french_date(&raw.payment_date_raw)?;
    let (procedure_start_date, procedure_end_date) =
        parse_date_range(&raw.procedure_date_raw).ok()?;
    let is_period = raw.procedure_date_raw.contains(" au ");

    Some(NormalizedPdfLine {
        line_index: raw.line_index,
        payment_date,
        invoice_number: raw.invoice_number,
        fund_name: raw.fund_name,
        patient_name,
        ssn: raw.ssn,
        nature: raw.nature,
        procedure_start_date,
        procedure_end_date,
        is_period,
        amount: raw.amount,
    })
}

// --- Total line ---

const TOTAL_LINE_PATTERN: &str = r"^Total réglé le (\d{2}/\d{2}/\d{4})\s+par\s+(.+?)\s*(?:\(n°\s*(\d+)\s*\))?\s+([\d\s]+,\d{2})\s*€?\s*$";

struct ParsedTotal {
    payment_date: NaiveDate,
    fund_full_name: String,
    fund_number: Option<String>,
    amount: i64,
}

fn parse_total_line(line: &str) -> Option<ParsedTotal> {
    let re = Regex::new(TOTAL_LINE_PATTERN).ok()?;
    let line = line.trim();
    let caps = re.captures(line)?;
    let amount = parse_amount(caps.get(4)?.as_str())?;
    let payment_date = parse_french_date(caps.get(1)?.as_str())?;
    Some(ParsedTotal {
        payment_date,
        fund_full_name: caps.get(2)?.as_str().trim().to_string(),
        fund_number: caps.get(3).map(|m| m.as_str().to_string()),
        amount,
    })
}

fn derive_fund_label(total: &ParsedTotal, raw_lines: &[&RawDataLine]) -> String {
    let first_raw = match raw_lines.first() {
        Some(line) => &line.fund_name,
        None => return total.fund_full_name.clone(),
    };

    if let Some(ref fund_num) = total.fund_number {
        let pattern = format!("n° {fund_num}");
        if let Some(pos) = first_raw.find(&pattern) {
            let end = pos + pattern.len();
            return first_raw[..end].trim().to_string();
        }
    }

    let fund_words: Vec<&str> = total.fund_full_name.split_whitespace().collect();
    for i in (1..=fund_words.len()).rev() {
        if let Some(slice) = fund_words.get(..i) {
            let candidate = slice.join(" ");
            if first_raw.starts_with(&candidate) {
                return candidate;
            }
        }
    }

    first_raw.clone()
}

fn split_fund_and_patient(raw: &str, fund_label: &str) -> (String, String) {
    if let Some(stripped) = raw.strip_prefix(fund_label) {
        (fund_label.to_string(), stripped.trim().to_string())
    } else {
        (raw.to_string(), String::new())
    }
}

/// Parse PDF text into a normalized PdfParseResult.
/// French date parsing happens here — lines with unparseable dates are counted
/// as unparsed rather than propagating errors.
pub fn parse_pdf_text(text: &str) -> PdfParseResult {
    let all_lines: Vec<&str> = text.lines().collect();

    let mut raw_data_lines: Vec<(usize, RawDataLine)> = Vec::new();
    let mut total_lines: Vec<(usize, ParsedTotal)> = Vec::new();
    let mut unparsed_line_count: u32 = 0;
    let mut unparsed_lines: Vec<String> = Vec::new();

    for (idx, line) in all_lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        if let Some(raw) = parse_raw_data_line(trimmed, idx as u32) {
            raw_data_lines.push((idx, raw));
        } else if let Some(total) = parse_total_line(trimmed) {
            total_lines.push((idx, total));
        } else if trimmed.contains('/')
            && trimmed.chars().any(|c| c.is_ascii_digit())
            && trimmed.len() > 30
        {
            unparsed_line_count += 1;
            if unparsed_lines.len() < 5 {
                unparsed_lines.push(trimmed.to_string());
            }
        }
    }

    let mut groups = Vec::new();
    let mut data_cursor = 0;

    for (total_idx, total) in total_lines {
        let group_start = data_cursor;
        while let Some((line_idx, _)) = raw_data_lines.get(data_cursor) {
            if *line_idx >= total_idx {
                break;
            }
            data_cursor += 1;
        }

        if group_start == data_cursor {
            continue;
        }

        let group_slice = raw_data_lines
            .get(group_start..data_cursor)
            .unwrap_or_default();
        let group_refs: Vec<&RawDataLine> = group_slice.iter().map(|(_, r)| r).collect();

        let fund_label = derive_fund_label(&total, &group_refs);

        let mut normalized_lines = Vec::new();
        for (_, raw) in group_slice {
            let (fund, patient) = split_fund_and_patient(&raw.fund_name, &fund_label);
            let resolved = RawDataLine {
                line_index: raw.line_index,
                payment_date_raw: raw.payment_date_raw.clone(),
                invoice_number: raw.invoice_number.clone(),
                fund_name: fund,
                ssn: raw.ssn.clone(),
                nature: raw.nature.clone(),
                procedure_date_raw: raw.procedure_date_raw.clone(),
                amount: raw.amount,
            };
            if let Some(normalized) = normalize_data_line(resolved, patient) {
                normalized_lines.push(normalized);
            } else {
                unparsed_line_count += 1;
            }
        }

        if normalized_lines.is_empty() {
            continue;
        }

        let sum: i64 = normalized_lines.iter().map(|l| l.amount).sum();
        let is_total_valid = sum == total.amount;

        groups.push(PdfProcedureGroup {
            fund_label,
            fund_full_name: total.fund_full_name,
            payment_date: total.payment_date,
            total_amount: total.amount,
            is_total_valid,
            lines: normalized_lines,
        });
    }

    PdfParseResult {
        groups,
        unparsed_line_count,
        unparsed_lines,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_data_line_valid() {
        let line = "02/05/2025 012345678 CPAM n° 931 DISCO ONE 1234567890123 SF 28/04/2025 38,40 €";
        let result = parse_raw_data_line(line, 42);
        assert!(result.is_some());
        let parsed = result.unwrap();
        assert_eq!(parsed.line_index, 42);
        assert_eq!(parsed.payment_date_raw, "02/05/2025");
        assert_eq!(parsed.ssn, "1234567890123");
        assert_eq!(parsed.amount, 38400);
    }

    #[test]
    fn test_parse_pdf_text_full_document() {
        let text = r#"
02/05/2025 012345678 CPAM n° 931 DISCO ONE 1234567890123 SF 28/04/2025 38,40 €
Total réglé le 02/05/2025 par la Caisse (n° 931) 38,40 €"#;

        let result = parse_pdf_text(text);
        assert_eq!(result.groups.len(), 1);
        let line = &result.groups[0].lines[0];
        assert_eq!(line.line_index, 1);
        assert_eq!(
            line.payment_date,
            NaiveDate::from_ymd_opt(2025, 5, 2).unwrap()
        );
        assert_eq!(
            line.procedure_start_date,
            NaiveDate::from_ymd_opt(2025, 4, 28).unwrap()
        );
        assert!(!line.is_period);
    }

    #[test]
    fn test_parse_amount_valid_formats() {
        assert_eq!(parse_amount("38,40").unwrap(), 38400);
        assert_eq!(parse_amount("100,00").unwrap(), 100000);
        assert_eq!(parse_amount("1 234,56").unwrap(), 1234560);
    }

    #[test]
    fn test_parse_amount_invalid() {
        assert_eq!(parse_amount("invalid"), None);
        assert_eq!(parse_amount(""), None);
    }

    #[test]
    fn test_parse_data_line_invalid() {
        let line = "This is not a valid data line";
        assert!(parse_raw_data_line(line, 0).is_none());
    }

    #[test]
    fn test_parse_data_line_with_period() {
        let line = "02/05/2025 012345678 CPAM n° 931 PATIENT TEST 1234567890123 SF 28/04/2025 au 30/04/2025 76,80 €";
        let raw = parse_raw_data_line(line, 0).unwrap();
        assert!(raw.procedure_date_raw.contains(" au "));
        let normalized = normalize_data_line(raw, "PATIENT TEST".to_string()).unwrap();
        assert!(normalized.is_period);
        assert_eq!(
            normalized.procedure_start_date,
            NaiveDate::from_ymd_opt(2025, 4, 28).unwrap()
        );
        assert_eq!(
            normalized.procedure_end_date,
            NaiveDate::from_ymd_opt(2025, 4, 30).unwrap()
        );
    }

    #[test]
    fn test_parse_pdf_multiple_lines_same_group() {
        let text = r#"
02/05/2025 001 CPAM n° 931 LINE ONE 1111111111111 SF 28/04/2025 25,00 €
02/05/2025 002 CPAM n° 931 LINE TWO 2222222222222 SF 28/04/2025 15,00 €
Total réglé le 02/05/2025 par la Caisse (n° 931) 40,00 €"#;

        let result = parse_pdf_text(text);
        assert_eq!(result.groups.len(), 1);
        assert_eq!(result.groups[0].lines.len(), 2);
        assert_eq!(result.groups[0].total_amount, 40000);
    }

    #[test]
    fn test_parse_pdf_multiple_groups() {
        let text = r#"
02/05/2025 001 CPAM n° 931 PATIENT ONE 1111111111111 SF 28/04/2025 25,00 €
Total réglé le 02/05/2025 par la Caisse (n° 931) 25,00 €
03/05/2025 002 MGEN PATIENT TWO 2222222222222 SF 28/04/2025 50,00 €
Total réglé le 03/05/2025 par MGEN 50,00 €"#;

        let result = parse_pdf_text(text);
        assert_eq!(result.groups.len(), 2);
    }

    #[test]
    fn test_parse_pdf_with_unparsed_lines() {
        let text = r#"
02/05/2025 001 CPAM n° 931 PATIENT 1234567890123 SF 28/04/2025 25,00 €
Malformed line with 02/05/2025 and some data 123456 that won't parse
Total réglé le 02/05/2025 par la Caisse (n° 931) 25,00 €"#;

        let result = parse_pdf_text(text);
        assert!(result.unparsed_line_count > 0);
        assert_eq!(result.groups.len(), 1);
    }

    #[test]
    fn test_parse_empty_pdf() {
        let result = parse_pdf_text("");
        assert_eq!(result.groups.len(), 0);
    }

    #[test]
    fn test_parse_pdf_invalid_total() {
        let text = r#"
02/05/2025 001 CPAM n° 931 PATIENT 1234567890123 SF 28/04/2025 25,00 €
Total réglé le 02/05/2025 par la Caisse (n° 931) 50,00 €"#;

        let result = parse_pdf_text(text);
        assert_eq!(result.groups.len(), 1);
        assert!(!result.groups[0].is_total_valid);
    }

    #[test]
    fn test_group_payment_date_is_naive_date() {
        let text = r#"
02/05/2025 001 CPAM n° 931 PATIENT 1234567890123 SF 28/04/2025 25,00 €
Total réglé le 02/05/2025 par la Caisse (n° 931) 25,00 €"#;

        let result = parse_pdf_text(text);
        assert_eq!(
            result.groups[0].payment_date,
            NaiveDate::from_ymd_opt(2025, 5, 2).unwrap()
        );
    }
}

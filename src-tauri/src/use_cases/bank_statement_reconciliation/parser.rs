use super::bank_pdf_codec::{self as codec, BankStatementCreditLine, BankStatementParseResult};
use crate::core::logger::BACKEND;
use regex::Regex;

// IFC-103: regexes are rebuilt per call from data-mapping constants. The
// regex meta-char skeleton (I\.?B\.?A\.?N\.?, \d{2}/\d{2}/\d{4}, etc.) stays
// inline — it is validation logic, not data mapping. Per-call compilation
// matches the codebase pattern (see fund-PDF parser) and keeps the parser
// fail-soft on a malformed regex (`.ok()?` propagates `None`).

/// Parse a bank statement PDF text into structured data.
///
/// The text is expected to come from pdf-extract which strips most spaces.
/// Continuation lines (references, etc.) are ignored.
pub fn parse_bank_statement(text: &str) -> BankStatementParseResult {
    let iban = extract_iban(text);
    let period = extract_period(text);
    let credit_lines: Vec<BankStatementCreditLine> = extract_credit_lines(text);
    let total_credits: i64 = credit_lines
        .iter()
        .inspect(|l| tracing::debug!(target: BACKEND, line = ?l))
        .map(|l| l.amount)
        .sum();

    BankStatementParseResult {
        iban,
        period,
        credit_lines,
        total_credits,
        unparsed_count: 0,
    }
}

/// Extract IBAN from PDF text.
/// Expected format: `I.B.A.N. FR7600000000000000000000000`
fn extract_iban(text: &str) -> Option<String> {
    let prefix = codec::IBAN_COUNTRY_PREFIX;
    let re = Regex::new(&format!(r"I\.?B\.?A\.?N\.?\s*({prefix}\d[\d\s]*)")).ok()?;
    let caps = re.captures(text)?;
    let raw = caps.get(1)?.as_str();
    let normalized = raw.replace(' ', "").trim().to_string();
    if normalized.len() >= 14 {
        Some(normalized)
    } else {
        None
    }
}

/// Extract statement period.
/// Format: `du DD/MM/YYYY au DD/MM/YYYY`
fn extract_period(text: &str) -> Option<String> {
    let prefix = codec::PERIOD_PREFIX.trim_end();
    let separator = codec::PERIOD_SEPARATOR.trim();
    let re = Regex::new(&format!(
        r"{prefix}\s*(\d{{2}}/\d{{2}}/\d{{4}})\s*{separator}\s*(\d{{2}}/\d{{2}}/\d{{4}})"
    ))
    .ok()?;
    let caps = re.captures(text)?;
    let start = caps.get(1)?.as_str();
    let end = caps.get(2)?.as_str();
    Some(format!(
        "{prefix}{start}{sep}{end}",
        prefix = codec::PERIOD_PREFIX,
        sep = codec::PERIOD_SEPARATOR,
    ))
}

/// Extract credit lines from VIR SEPA entries.
///
/// Pattern for a movement start line:
/// `DD/MM/YYYY VIR SEPA <LABEL> DD/MM/YYYY AMOUNT`
///
/// The label is everything between "VIR SEPA" and the second date, excluding
/// any trailing `SEPA` suffix (which some bank export formats append).
fn extract_credit_lines(text: &str) -> Vec<BankStatementCreditLine> {
    let mut results = Vec::new();

    // VIR_SEPA_MARKER is `VIR SEPA` (single space); split and rejoin with \s+
    // to preserve the parser's tolerance for arbitrary whitespace between
    // VIR and SEPA. The emitter uses the canonical single-space form.
    let marker = codec::VIR_SEPA_MARKER.replace(' ', r"\s+");
    let re = match Regex::new(&format!(
        r"^\d{{2}}/\d{{2}}/\d{{4}}\s+{marker}\s+(.+?)\s+(\d{{2}}/\d{{2}}/\d{{4}})\s+([\d\s]+,\d{{2}})"
    )) {
        Ok(r) => r,
        Err(_) => return results,
    };

    let mut virsepa_lines = Vec::new();
    let mut matched_lines = Vec::new();

    for line in text.lines() {
        let line = line.trim();
        if !line.contains("VIR") || !line.contains("SEPA") {
            continue;
        }

        virsepa_lines.push(line.to_string());

        if let Some(caps) = re.captures(line) {
            matched_lines.push(line.to_string());

            let label_raw = caps.get(1).map(|m| m.as_str()).unwrap_or_default();
            let date_str = caps.get(2).map(|m| m.as_str()).unwrap_or_default();
            let amount_str = caps.get(3).map(|m| m.as_str()).unwrap_or_default();

            // Clean up label: remove trailing suffix if present (IFC-103).
            let mut label = label_raw.to_string();
            if label.ends_with(codec::LABEL_TRAILING_SUFFIX) {
                label = label[..label.len() - codec::LABEL_TRAILING_SUFFIX.len()].to_string();
            }

            // Skip empty labels.
            if label.is_empty() {
                continue;
            }

            // Parse date DD/MM/YYYY → YYYY-MM-DD.
            let iso_date = match convert_date_to_iso(date_str) {
                Some(d) => d,
                None => continue,
            };

            // Parse French-formatted amount: "148,80" or "1 234,56" → i64 thousandths.
            let amount = match parse_french_amount(amount_str) {
                Some(euros) => (euros * 1000.0).round() as i64,
                None => continue,
            };

            results.push(BankStatementCreditLine {
                date: iso_date,
                label,
                amount,
            });
        }
    }

    // Log what we found.
    tracing::debug!(
        virsepa_count = virsepa_lines.len(),
        matched_count = matched_lines.len(),
        parsed_count = results.len(),
        "Credit lines extraction summary"
    );

    if !virsepa_lines.is_empty() {
        tracing::debug!(?virsepa_lines, "Found VIRSEPA lines");
    }

    if !matched_lines.is_empty() {
        tracing::debug!(?matched_lines, "Regex matched lines");
    }

    results
}

/// Convert DD/MM/YYYY to YYYY-MM-DD.
fn convert_date_to_iso(date: &str) -> Option<String> {
    let parts: Vec<&str> = date.split('/').collect();
    if parts.len() != 3 {
        return None;
    }
    Some(format!(
        "{}-{}-{}",
        parts.get(2)?,
        parts.get(1)?,
        parts.first()?
    ))
}

/// Parse French formatted amount: "148,80" or "1 234,56" → f64.
fn parse_french_amount(s: &str) -> Option<f64> {
    let cleaned = s
        .replace(' ', "")
        .replace(codec::FRENCH_AMOUNT_DECIMAL, ".");
    cleaned.parse::<f64>().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_iban() {
        let text = "B.I.C. TESTFRPPXXX I.B.A.N. FR7600000000000000000000000\nMOUVEMENTS";
        assert_eq!(
            extract_iban(text),
            Some("FR7600000000000000000000000".to_string())
        );
    }

    #[test]
    fn test_extract_iban_with_spaces() {
        let text = "I.B.A.N. FR76 0000 0000 0000 0000 0000 000";
        assert_eq!(
            extract_iban(text),
            Some("FR7600000000000000000000000".to_string())
        );
    }

    #[test]
    fn test_extract_period() {
        let text = "du 01/01/2025au 31/01/2025 1 000,00";
        assert_eq!(
            extract_period(text),
            Some("du 01/01/2025 au 31/01/2025".to_string())
        );
    }

    #[test]
    fn test_extract_period_with_spaces() {
        let text = "du 01/01/2025 au 31/01/2025";
        assert_eq!(
            extract_period(text),
            Some("du 01/01/2025 au 31/01/2025".to_string())
        );
    }

    #[test]
    fn test_convert_date_to_iso() {
        assert_eq!(
            convert_date_to_iso("01/01/2025"),
            Some("2025-01-01".to_string())
        );
    }

    #[test]
    fn test_parse_french_amount() {
        assert_eq!(parse_french_amount("148,80"), Some(148.80));
        assert_eq!(parse_french_amount("1 234,56"), Some(1234.56));
        assert_eq!(parse_french_amount("24,00"), Some(24.00));
    }

    #[test]
    fn test_extract_credit_lines_basic() {
        let text = r#"01/01/2025 VIR SEPA CPAM01 01/01/2025 100,00
0000000000000000000000000000
Ref000000000000000000
02/01/2025 VIR SEPA CPAM02 02/01/2025 50,00
0000000000000000000000000000"#;

        let lines = extract_credit_lines(text);
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].date, "2025-01-01");
        assert_eq!(lines[0].label, "CPAM01");
        assert_eq!(lines[0].amount, 100000);
        assert_eq!(lines[1].label, "CPAM02");
        assert_eq!(lines[1].amount, 50000);
    }

    #[test]
    fn test_extract_credit_lines_mgen() {
        let text =
            "01/01/2025 VIR SEPA MUTUELLEGENERALEEDUCATIONNAT 01/01/2025 50,00\nTP-00000000-000";
        let lines = extract_credit_lines(text);
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].label, "MUTUELLEGENERALEEDUCATIONNAT");
        assert_eq!(lines[0].amount, 50000);
    }

    #[test]
    fn test_extract_credit_lines_cpam75() {
        let text = "01/01/2025 VIR SEPA CPAM01PRESTATIONS 01/01/2025 50,00\n000000000";
        let lines = extract_credit_lines(text);
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].label, "CPAM01PRESTATIONS");
    }

    #[test]
    fn test_extract_credit_lines_cprpf() {
        let text = "01/01/2025 VIR SEPA CPRPFRG 01/01/2025 50,00\n0000000";
        let lines = extract_credit_lines(text);
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].label, "CPRPFRG");
    }

    #[test]
    fn test_extract_credit_lines_hauts_de_seine() {
        let text =
            "01/01/2025 VIR SEPA CPAMHAUTSDESEINE 01/01/2025 50,00\n0000000000000000000000000000";
        let lines = extract_credit_lines(text);
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].date, "2025-01-01");
        assert_eq!(lines[0].label, "CPAMHAUTSDESEINE");
        assert_eq!(lines[0].amount, 50000);
    }

    #[test]
    fn test_ignores_non_vir_sepa() {
        let text = r#"01/01/2025 PRLVSEPABOUYGUESTELECOM 01/01/2025 20,00
02/01/2025 CARTE01/01/25COMMERCECB*0000 02/01/2025 75,00
02/01/2025 VIRVirementinternedepuisPARTICULIER 02/01/2025 1 000,00"#;
        let lines = extract_credit_lines(text);
        // PRLVSEPA and CARTE should be filtered out.
        // "VIRVirement" doesn't have "VIRSEPA" pattern (no "SEPA" after "VIR").
        assert_eq!(lines.len(), 0);
    }

    #[test]
    fn test_full_parse() {
        let text = r#"B.I.C. TESTFRPPXXX I.B.A.N. FR7600000000000000000000000
du 01/01/2025au 31/01/2025 1 000,00
MOUVEMENTS EN EUR
01/01/2025 VIR SEPA CPAM01 01/01/2025 100,00
0000000000000000000000000000
02/01/2025 VIR SEPA CPAM02 02/01/2025 50,00
0000000000000000000000000000
02/01/2025 CARTE01/01/25COMMERCECB*0000 02/01/2025 75,00"#;

        let result = parse_bank_statement(text);
        assert_eq!(result.iban.as_deref(), Some("FR7600000000000000000000000"));
        assert_eq!(
            result.period.as_deref(),
            Some("du 01/01/2025 au 31/01/2025")
        );
        assert_eq!(result.credit_lines.len(), 2);
        assert_eq!(result.total_credits, 150000);
    }
}

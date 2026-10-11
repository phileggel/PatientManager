//! What may be said of a fund label read from a statement.
//!
//! On a group where the fund takes money back from one person, the label the
//! parser reads is the fund followed by that person's name. A label is therefore
//! never written to a log (B44): a log call names the fund by its identifier.

use regex::Regex;
use std::sync::OnceLock;

/// What a log says of a label that carries no fund number: the label itself is
/// then the fund identifier, and it may hold a name.
const UNNUMBERED: &str = "unnumbered";

/// Compile-time-constant fund-number pattern (e.g. "n° 931"), compiled once and
/// cached. The literal is always valid, but the crate denies `expect_used`, so
/// on the (unreachable) compile failure callers fall back to treating the whole
/// label as the identifier — never a panic. Mirrors the `Regex::new(...).ok()`
/// idiom used in `parsing/pdf_parser.rs`.
fn fund_number_regex() -> Option<&'static Regex> {
    static RE: OnceLock<Option<Regex>> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"n°\s*(\d+)").ok()).as_ref()
}

/// The fund number a label carries ("CPAM n° 931" → "931"), if any.
fn fund_number(fund_label: &str) -> Option<&str> {
    fund_number_regex()
        .and_then(|re| re.captures(fund_label))
        .and_then(|caps| caps.get(1))
        .map(|number| number.as_str())
}

/// The fund identifier a label resolves to: its number, or the whole label when
/// it carries none (e.g. "MGEN").
pub(crate) fn fund_identifier_of(fund_label: &str) -> String {
    fund_number(fund_label).map_or_else(|| fund_label.trim().to_string(), str::to_string)
}

/// The fund identifier as a log may write it: the number, never the label.
pub(crate) fn loggable_fund_identifier(fund_label: &str) -> &str {
    fund_number(fund_label).unwrap_or(UNNUMBERED)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_debt_051_a_label_followed_by_a_name_is_logged_as_its_number() {
        assert_eq!(loggable_fund_identifier("CPAM n° 931 NOM PRENOM"), "931");
    }

    #[test]
    fn test_debt_051_a_label_without_a_number_is_never_logged_as_written() {
        let logged = loggable_fund_identifier("MGEN NOM PRENOM");
        assert_eq!(logged, UNNUMBERED);
        assert!(!logged.contains("NOM"));
    }

    #[test]
    fn test_debt_051_the_identifier_a_label_resolves_to_is_unchanged() {
        assert_eq!(fund_identifier_of("CPAM n° 931"), "931");
        assert_eq!(fund_identifier_of("CPAM n°75 NOM PRENOM"), "75");
        assert_eq!(fund_identifier_of("  MGEN "), "MGEN");
    }

    /// The log calls of this use case, read as source: none writes a label read
    /// from a statement as a field value. A guard with two limits: it reads the
    /// five files listed, and a field (`name = %value`), not a label put into
    /// the message text.
    #[test]
    fn test_debt_051_no_log_call_of_the_use_case_writes_a_fund_label() {
        let sources = [
            ("orchestrator.rs", include_str!("orchestrator.rs")),
            ("service.rs", include_str!("service.rs")),
            ("api.rs", include_str!("api.rs")),
            (
                "reconciliation/reconciliation_pass.rs",
                include_str!("reconciliation/reconciliation_pass.rs"),
            ),
            (
                "parsing/pdf_parser.rs",
                include_str!("parsing/pdf_parser.rs"),
            ),
        ];
        let Ok(label_field) = Regex::new(
            r"\b(fund_label|pdf_fund_label|pdf_fund|fund_name|fund_identifier)\s*=\s*[%?]",
        ) else {
            panic!("the pattern is a constant");
        };
        let written: Vec<String> = sources
            .iter()
            .flat_map(|(file, source)| {
                source
                    .lines()
                    .enumerate()
                    .filter(|(_, line)| label_field.is_match(line))
                    .map(move |(index, _)| format!("{file}:{}", index + 1))
            })
            .collect();
        assert!(written.is_empty(), "a fund label is logged at {written:?}");
    }
}

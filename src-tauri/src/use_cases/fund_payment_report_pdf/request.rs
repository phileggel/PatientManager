use serde::{Deserialize, Serialize};
use specta::Type;

use super::error::ReportPdfError;

// ────────────────────────────────────────────────────────────────────────────
// ReportGenerationRequest — FPR-011, FPR-013, FPR-021
//
// The frontend resolves every translation, currency value, and date through
// its i18n / Intl pipeline before invoking the command. The backend therefore
// holds no language tables, no formatters, and no locale field — it is a
// pure data → PDF assembler.
// ────────────────────────────────────────────────────────────────────────────

/// Payload assembled by the frontend when the practitioner clicks Report.
///
/// All strings are pre-resolved: labels are already translated, dates are
/// already formatted, currency values are already grouped and suffixed.
/// The renderer only places strings; it never inspects content (FPR-013, FPR-021).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields)]
pub struct ReportGenerationRequest {
    /// Bold heading shown at the top of page 1 (FPR-020).
    pub title: String,
    /// Breadcrumb shown at the top of pages 2+, e.g. "Reconciliation Report (continued)".
    pub continuation_title: String,
    /// Lines rendered below the title on page 1 (period, generated-on, source-PDF, etc.).
    /// The frontend produces complete pre-formatted strings; the renderer prints them in order.
    pub header_lines: Vec<String>,
    /// Section 1 — unreconciled procedures (FPR-030 to FPR-033).
    pub unreconciled: UnreconciledSection,
    /// Heading for Section 2. Rendered only when `correction_groups` is non-empty.
    pub correction_section_heading: String,
    /// Section 2 — corrections grouped by type (FPR-040 to FPR-042).
    /// An empty list omits the entire section (FPR-040).
    pub correction_groups: Vec<CorrectionGroup>,
    /// Footer page-number label, e.g. "Page" — rendered as `"{label} {n} / {total}"` (FPR-022).
    pub page_label: String,
}

/// Section 1 content. Either an empty-state confirmation, or a table with rows + total.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type", content = "data")]
pub enum UnreconciledSection {
    /// FPR-032 — empty-state branch. No table, no total.
    Empty {
        heading: String,
        empty_message: String,
    },
    /// FPR-031, FPR-033 — populated table with header row, data rows, and total.
    Rows {
        heading: String,
        column_headers: UnreconciledColumns,
        rows: Vec<UnreconciledRow>,
        total_label: String,
        total_value: String,
    },
}

/// Column-header strings for the unreconciled table (FPR-031). Fixed 4 columns.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct UnreconciledColumns {
    pub date: String,
    pub patient: String,
    pub ssn: String,
    pub amount: String,
}

/// One row of the unreconciled table (FPR-031). All four cells are pre-formatted.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct UnreconciledRow {
    pub date: String,
    pub patient: String,
    pub ssn: String,
    pub amount: String,
}

/// One correction group within Section 2 (FPR-041, FPR-042).
///
/// Frontend joins each correction's columns into a single pre-formatted string
/// before sending — the renderer treats `rows` as opaque text lines.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CorrectionGroup {
    pub title: String,
    pub rows: Vec<String>,
}

// ────────────────────────────────────────────────────────────────────────────
// Validation
//
// The backend trusts the frontend for content (translation, formatting) but
// still guards the boundary against self-DoS via oversized payloads and
// against control characters that would break PDF text streams.
// ────────────────────────────────────────────────────────────────────────────

/// Maximum length of any single user-supplied string (label, cell, line).
/// Generous enough for any plausible legitimate value, tight enough to bound
/// an attacker's amplification factor.
const MAX_STRING_LEN: usize = 1024;

/// Header lines rendered below the document title.
const MAX_HEADER_LINES: usize = 16;

/// Rows in the unreconciled-procedures table.
const MAX_UNRECONCILED_ROWS: usize = 10_000;

/// Correction groups in Section 2.
const MAX_CORRECTION_GROUPS: usize = 16;

/// Rows in any single correction group.
const MAX_CORRECTION_ROWS_PER_GROUP: usize = 10_000;

/// Build an `InvalidRequest` error carrying a field-qualified diagnostic. The
/// detail is `#[serde(skip)]` on the wire — it stays for `Display`, `tracing`,
/// and the validator's unit tests.
fn invalid_request(detail: String) -> ReportPdfError {
    ReportPdfError::InvalidRequest { detail }
}

/// Reject empty, oversized, or control-character-bearing strings.
/// NUL bytes corrupt the PDF text stream; other control chars (besides tab)
/// produce visually wrong output.
fn validate_safe_string(s: &str, field: &str) -> Result<(), ReportPdfError> {
    if s.is_empty() {
        return Err(invalid_request(format!("{field} must not be empty")));
    }
    if s.len() > MAX_STRING_LEN {
        return Err(invalid_request(format!(
            "{field} exceeds maximum length of {MAX_STRING_LEN} bytes"
        )));
    }
    if s.chars().any(|c| c.is_control() && c != '\t') {
        return Err(invalid_request(format!(
            "{field} must not contain control characters"
        )));
    }
    Ok(())
}

/// Allow empty content (e.g. a value that intentionally renders as blank),
/// but still bound length and forbid control chars.
fn validate_optional_string(s: &str, field: &str) -> Result<(), ReportPdfError> {
    if s.len() > MAX_STRING_LEN {
        return Err(invalid_request(format!(
            "{field} exceeds maximum length of {MAX_STRING_LEN} bytes"
        )));
    }
    if s.chars().any(|c| c.is_control() && c != '\t') {
        return Err(invalid_request(format!(
            "{field} must not contain control characters"
        )));
    }
    Ok(())
}

impl ReportGenerationRequest {
    /// Validate the request structurally. On the first violation, returns
    /// `Err(InvalidRequest)` with a field-qualified message safe to surface
    /// to the caller (no echoed user input, only field names + bounds).
    pub fn validate(&self) -> Result<(), ReportPdfError> {
        validate_safe_string(&self.title, "title")?;
        validate_safe_string(&self.continuation_title, "continuation_title")?;
        validate_safe_string(&self.page_label, "page_label")?;
        validate_safe_string(
            &self.correction_section_heading,
            "correction_section_heading",
        )?;

        if self.header_lines.len() > MAX_HEADER_LINES {
            return Err(invalid_request(format!(
                "header_lines contains {} entries; maximum is {MAX_HEADER_LINES}",
                self.header_lines.len()
            )));
        }
        for (i, line) in self.header_lines.iter().enumerate() {
            validate_optional_string(line, &format!("header_lines[{i}]"))?;
        }

        self.unreconciled.validate()?;

        if self.correction_groups.len() > MAX_CORRECTION_GROUPS {
            return Err(invalid_request(format!(
                "correction_groups contains {} entries; maximum is {MAX_CORRECTION_GROUPS}",
                self.correction_groups.len()
            )));
        }
        for (i, group) in self.correction_groups.iter().enumerate() {
            group.validate(i)?;
        }

        Ok(())
    }
}

impl UnreconciledSection {
    fn validate(&self) -> Result<(), ReportPdfError> {
        match self {
            UnreconciledSection::Empty {
                heading,
                empty_message,
            } => {
                validate_safe_string(heading, "unreconciled.heading")?;
                validate_safe_string(empty_message, "unreconciled.empty_message")?;
            }
            UnreconciledSection::Rows {
                heading,
                column_headers,
                rows,
                total_label,
                total_value,
            } => {
                validate_safe_string(heading, "unreconciled.heading")?;
                validate_safe_string(&column_headers.date, "unreconciled.column_headers.date")?;
                validate_safe_string(
                    &column_headers.patient,
                    "unreconciled.column_headers.patient",
                )?;
                validate_safe_string(&column_headers.ssn, "unreconciled.column_headers.ssn")?;
                validate_safe_string(&column_headers.amount, "unreconciled.column_headers.amount")?;
                validate_safe_string(total_label, "unreconciled.total_label")?;
                validate_safe_string(total_value, "unreconciled.total_value")?;

                if rows.len() > MAX_UNRECONCILED_ROWS {
                    return Err(invalid_request(format!(
                        "unreconciled.rows contains {} entries; maximum is {MAX_UNRECONCILED_ROWS}",
                        rows.len()
                    )));
                }
                for (i, row) in rows.iter().enumerate() {
                    validate_optional_string(&row.date, &format!("unreconciled.rows[{i}].date"))?;
                    validate_optional_string(
                        &row.patient,
                        &format!("unreconciled.rows[{i}].patient"),
                    )?;
                    validate_optional_string(&row.ssn, &format!("unreconciled.rows[{i}].ssn"))?;
                    validate_optional_string(
                        &row.amount,
                        &format!("unreconciled.rows[{i}].amount"),
                    )?;
                }
            }
        }
        Ok(())
    }
}

impl CorrectionGroup {
    fn validate(&self, index: usize) -> Result<(), ReportPdfError> {
        validate_safe_string(&self.title, &format!("correction_groups[{index}].title"))?;
        if self.rows.len() > MAX_CORRECTION_ROWS_PER_GROUP {
            return Err(invalid_request(format!(
                "correction_groups[{index}].rows contains {} entries; maximum is {MAX_CORRECTION_ROWS_PER_GROUP}",
                self.rows.len()
            )));
        }
        for (i, row) in self.rows.iter().enumerate() {
            validate_optional_string(row, &format!("correction_groups[{index}].rows[{i}]"))?;
        }
        Ok(())
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Test helpers
// ────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
pub(crate) fn valid_request() -> ReportGenerationRequest {
    ReportGenerationRequest {
        title: "Rapport de rapprochement".into(),
        continuation_title: "Rapport de rapprochement (suite)".into(),
        header_lines: vec![
            "Période : 01/04/2026 → 30/04/2026".into(),
            "Généré le : 6 mai 2026, 16:42".into(),
            "Fichier PDF : statement.pdf".into(),
        ],
        unreconciled: UnreconciledSection::Empty {
            heading: "Actes non rapprochés".into(),
            empty_message: "Tous les actes de la période ont été rapprochés.".into(),
        },
        correction_section_heading: "Corrections appliquées".into(),
        correction_groups: vec![],
        page_label: "Page".into(),
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── happy path ───────────────────────────────────────────────────────────

    #[test]
    fn validate_accepts_fully_valid_request() {
        let req = valid_request();
        assert!(req.validate().is_ok());
    }

    #[test]
    fn validate_accepts_request_with_rows_and_corrections() {
        let req = ReportGenerationRequest {
            unreconciled: UnreconciledSection::Rows {
                heading: "Actes non rapprochés".into(),
                column_headers: UnreconciledColumns {
                    date: "Date".into(),
                    patient: "Patient".into(),
                    ssn: "INS".into(),
                    amount: "Montant".into(),
                },
                rows: vec![UnreconciledRow {
                    date: "01/04/2026".into(),
                    patient: "Alice Dupont".into(),
                    ssn: "1234567890123".into(),
                    amount: "85,00 €".into(),
                }],
                total_label: "Total".into(),
                total_value: "85,00 €".into(),
            },
            correction_groups: vec![CorrectionGroup {
                title: "Corrections de montant".into(),
                rows: vec!["Alice Dupont | 01/04/2026 | 85,00 € → 80,00 €".into()],
            }],
            ..valid_request()
        };
        assert!(req.validate().is_ok());
    }

    // ── required strings ─────────────────────────────────────────────────────

    #[test]
    fn validate_rejects_empty_title() {
        let req = ReportGenerationRequest {
            title: String::new(),
            ..valid_request()
        };
        let result = req.validate();
        assert!(
            matches!(result, Err(ReportPdfError::InvalidRequest { detail: ref m }) if m.contains("title")),
            "expected InvalidRequest mentioning 'title', got {result:?}"
        );
    }

    #[test]
    fn validate_rejects_empty_page_label() {
        let req = ReportGenerationRequest {
            page_label: String::new(),
            ..valid_request()
        };
        let result = req.validate();
        assert!(
            matches!(result, Err(ReportPdfError::InvalidRequest { detail: ref m }) if m.contains("page_label")),
            "expected InvalidRequest mentioning 'page_label', got {result:?}"
        );
    }

    #[test]
    fn validate_rejects_oversized_string() {
        let req = ReportGenerationRequest {
            title: "x".repeat(MAX_STRING_LEN + 1),
            ..valid_request()
        };
        let result = req.validate();
        assert!(
            matches!(result, Err(ReportPdfError::InvalidRequest { detail: ref m }) if m.contains("title")),
            "expected oversized title to fail, got {result:?}"
        );
    }

    #[test]
    fn validate_rejects_control_character() {
        let req = ReportGenerationRequest {
            title: "with\0nul".into(),
            ..valid_request()
        };
        let result = req.validate();
        assert!(
            matches!(result, Err(ReportPdfError::InvalidRequest { detail: ref m }) if m.contains("control")),
            "expected control-char rejection, got {result:?}"
        );
    }

    // ── DoS guards ───────────────────────────────────────────────────────────

    #[test]
    fn validate_rejects_too_many_header_lines() {
        let req = ReportGenerationRequest {
            header_lines: vec!["line".into(); MAX_HEADER_LINES + 1],
            ..valid_request()
        };
        let result = req.validate();
        assert!(
            matches!(result, Err(ReportPdfError::InvalidRequest { detail: ref m }) if m.contains("header_lines")),
            "expected header_lines count rejection, got {result:?}"
        );
    }

    #[test]
    fn validate_rejects_too_many_correction_groups() {
        let req = ReportGenerationRequest {
            correction_groups: vec![
                CorrectionGroup {
                    title: "X".into(),
                    rows: vec![],
                };
                MAX_CORRECTION_GROUPS + 1
            ],
            ..valid_request()
        };
        let result = req.validate();
        assert!(
            matches!(result, Err(ReportPdfError::InvalidRequest { detail: ref m }) if m.contains("correction_groups")),
            "expected correction_groups count rejection, got {result:?}"
        );
    }

    #[test]
    fn validate_rejects_too_many_unreconciled_rows() {
        let row = UnreconciledRow {
            date: "01/04/2026".into(),
            patient: "P".into(),
            ssn: "S".into(),
            amount: "1".into(),
        };
        let req = ReportGenerationRequest {
            unreconciled: UnreconciledSection::Rows {
                heading: "h".into(),
                column_headers: UnreconciledColumns {
                    date: "d".into(),
                    patient: "p".into(),
                    ssn: "s".into(),
                    amount: "a".into(),
                },
                rows: vec![row; MAX_UNRECONCILED_ROWS + 1],
                total_label: "Total".into(),
                total_value: "0".into(),
            },
            ..valid_request()
        };
        let result = req.validate();
        assert!(
            matches!(result, Err(ReportPdfError::InvalidRequest { detail: ref m }) if m.contains("unreconciled.rows")),
            "expected rows count rejection, got {result:?}"
        );
    }

    // ── empty-vs-populated section 1 ─────────────────────────────────────────

    #[test]
    fn validate_accepts_empty_section_1() {
        let req = valid_request(); // already uses Empty
        assert!(req.validate().is_ok());
    }

    // ── empty section 2 (FPR-040) ────────────────────────────────────────────

    #[test]
    fn validate_accepts_empty_correction_groups() {
        let req = valid_request();
        assert!(req.correction_groups.is_empty());
        assert!(req.validate().is_ok());
    }
}

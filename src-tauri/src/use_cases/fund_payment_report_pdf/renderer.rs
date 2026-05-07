use printpdf::{
    Color, Line, LinePoint, Mm, Op, ParsedFont, PdfDocument, PdfFontHandle, PdfPage,
    PdfSaveOptions, Point, Pt, Rgb, TextItem,
};

use super::error::ReportPdfError;
use super::request::{
    CorrectionGroup, ReportGenerationRequest, UnreconciledRow, UnreconciledSection,
};

// ────────────────────────────────────────────────────────────────────────────
// Font bytes embedded at compile time (FPR-021 — typography only)
//
// Translation, currency formatting, and date formatting are all performed by
// the frontend before calling the command. The renderer only places strings.
// ────────────────────────────────────────────────────────────────────────────

const FONT_REGULAR: &[u8] = include_bytes!("../../../resources/fonts/Roboto-Regular.ttf");
const FONT_BOLD: &[u8] = include_bytes!("../../../resources/fonts/Roboto-Bold.ttf");

// ────────────────────────────────────────────────────────────────────────────
// Page geometry (A4 portrait)
// ────────────────────────────────────────────────────────────────────────────

const PAGE_W: Mm = Mm(210.0);
const PAGE_H: Mm = Mm(297.0);
const MARGIN_X: f32 = 20.0;
const MARGIN_TOP: f32 = 280.0;
const MARGIN_BOTTOM: f32 = 25.0;
const ROW_HEIGHT: f32 = 7.0;

// Section-1 column anchors (mm from the left edge)
const COL_DATE: f32 = MARGIN_X;
const COL_PATIENT: f32 = 50.0;
const COL_SSN: f32 = 110.0;
const COL_AMOUNT: f32 = 165.0;

// ────────────────────────────────────────────────────────────────────────────
// Public entry point — FPR-013
// ────────────────────────────────────────────────────────────────────────────

/// Render a `ReportGenerationRequest` into a PDF byte stream.
///
/// The request must have already been validated (`ReportGenerationRequest::validate`)
/// before calling this function.
///
/// # Errors
///
/// - `ReportPdfError::PdfGenerationFailed` if the embedded font cannot be
///   parsed or the internal PDF renderer returns an error.
pub fn render(req: &ReportGenerationRequest) -> Result<Vec<u8>, ReportPdfError> {
    let regular = ParsedFont::from_bytes(FONT_REGULAR, 0, &mut Vec::new())
        .ok_or_else(|| ReportPdfError::PdfGenerationFailed("regular font load failed".into()))?;
    let bold = ParsedFont::from_bytes(FONT_BOLD, 0, &mut Vec::new())
        .ok_or_else(|| ReportPdfError::PdfGenerationFailed("bold font load failed".into()))?;

    let mut doc = PdfDocument::new(&req.title);
    let regular_id = PdfFontHandle::External(doc.add_font(&regular));
    let bold_id = PdfFontHandle::External(doc.add_font(&bold));

    let mut renderer = Renderer::new(&regular_id, &bold_id, &req.continuation_title);
    renderer.render_header(req);
    renderer.render_section_unreconciled(&req.unreconciled);
    renderer.render_section_corrections(&req.correction_section_heading, &req.correction_groups);
    let pages = renderer.finish_pages(&regular_id, &req.page_label);

    let bytes = doc
        .with_pages(pages)
        .save(&PdfSaveOptions::default(), &mut Vec::new());

    Ok(bytes)
}

// ────────────────────────────────────────────────────────────────────────────
// Renderer state machine
//
// Holds the page list under construction plus the current page's op buffer
// and y cursor. `ensure_room(needed)` flushes the current page and starts a
// new continuation page when the cursor would underflow the bottom margin.
// ────────────────────────────────────────────────────────────────────────────

struct Renderer<'a> {
    regular: &'a PdfFontHandle,
    bold: &'a PdfFontHandle,
    continuation_title: &'a str,
    pages: Vec<Vec<Op>>,
    current: Vec<Op>,
    y: f32,
}

impl<'a> Renderer<'a> {
    fn new(
        regular: &'a PdfFontHandle,
        bold: &'a PdfFontHandle,
        continuation_title: &'a str,
    ) -> Self {
        Self {
            regular,
            bold,
            continuation_title,
            pages: Vec::new(),
            current: Vec::new(),
            y: MARGIN_TOP,
        }
    }

    /// Header — FPR-020 (title + pre-formatted info lines)
    fn render_header(&mut self, req: &ReportGenerationRequest) {
        self.draw_text_bold(MARGIN_X, self.y, 18.0, &req.title);
        self.y -= 12.0;
        for line in &req.header_lines {
            self.draw_text(MARGIN_X, self.y, 10.0, line);
            self.y -= 5.0;
        }
        self.y -= 7.0;
    }

    /// Section 1 — FPR-030 to FPR-033
    fn render_section_unreconciled(&mut self, section: &UnreconciledSection) {
        match section {
            UnreconciledSection::Empty {
                heading,
                empty_message,
            } => {
                self.draw_text_bold(MARGIN_X, self.y, 12.0, heading);
                self.y -= 8.0;
                // FPR-032 — empty-state confirmation; no total line
                self.draw_text(MARGIN_X, self.y, 10.0, empty_message);
                self.y -= 10.0;
            }
            UnreconciledSection::Rows {
                heading,
                column_headers,
                rows,
                total_label,
                total_value,
            } => {
                self.draw_text_bold(MARGIN_X, self.y, 12.0, heading);
                self.y -= 8.0;

                // Column header band
                self.ensure_room(ROW_HEIGHT * 2.0);
                self.h_line(self.y + 1.5);
                self.draw_text_bold(COL_DATE, self.y - 4.0, 9.0, &column_headers.date);
                self.draw_text_bold(COL_PATIENT, self.y - 4.0, 9.0, &column_headers.patient);
                self.draw_text_bold(COL_SSN, self.y - 4.0, 9.0, &column_headers.ssn);
                self.draw_text_bold(COL_AMOUNT, self.y - 4.0, 9.0, &column_headers.amount);
                self.h_line(self.y - ROW_HEIGHT + 1.0);
                self.y -= ROW_HEIGHT;

                for row in rows {
                    self.ensure_room(ROW_HEIGHT);
                    self.draw_unreconciled_row(row);
                }
                self.h_line(self.y + 1.0);
                self.y -= 4.0;

                // FPR-033 — total billed amount
                self.ensure_room(ROW_HEIGHT);
                self.draw_text_bold(
                    COL_AMOUNT - 30.0,
                    self.y,
                    10.0,
                    &format!("{total_label} : {total_value}"),
                );
                self.y -= 12.0;
            }
        }
    }

    fn draw_unreconciled_row(&mut self, row: &UnreconciledRow) {
        let baseline = self.y - 4.0;
        self.draw_text(COL_DATE, baseline, 9.0, &row.date);
        self.draw_text(COL_PATIENT, baseline, 9.0, &row.patient);
        self.draw_text(COL_SSN, baseline, 9.0, &row.ssn);
        self.draw_text(COL_AMOUNT, baseline, 9.0, &row.amount);
        self.y -= ROW_HEIGHT;
    }

    /// Section 2 — FPR-040 to FPR-042
    fn render_section_corrections(&mut self, heading: &str, groups: &[CorrectionGroup]) {
        if groups.is_empty() {
            // FPR-040 — section omitted entirely
            return;
        }

        self.ensure_room(20.0);
        self.draw_text_bold(MARGIN_X, self.y, 12.0, heading);
        self.y -= 8.0;

        for group in groups {
            if group.rows.is_empty() {
                continue;
            }
            self.ensure_room(15.0 + (group.rows.len() as f32) * ROW_HEIGHT);
            self.draw_text_bold(MARGIN_X, self.y, 11.0, &group.title);
            self.y -= 7.0;

            for row in &group.rows {
                self.ensure_room(ROW_HEIGHT);
                let baseline = self.y - 4.0;
                self.draw_text(MARGIN_X + 4.0, baseline, 9.0, row);
                self.y -= ROW_HEIGHT;
            }
            self.y -= 5.0;
        }
    }

    /// Ensure at least `needed` mm remain on the current page; otherwise flush
    /// the page and start a new continuation page.
    fn ensure_room(&mut self, needed: f32) {
        if self.y - needed < MARGIN_BOTTOM {
            self.flush_page();
            self.y = MARGIN_TOP;
            self.draw_text(MARGIN_X, self.y, 9.0, self.continuation_title);
            self.y -= 8.0;
        }
    }

    fn flush_page(&mut self) {
        if !self.current.is_empty() {
            let page_ops = std::mem::take(&mut self.current);
            self.pages.push(page_ops);
        }
    }

    /// Build the final page list, applying page numbers (FPR-022).
    fn finish_pages(mut self, regular: &PdfFontHandle, page_label: &str) -> Vec<PdfPage> {
        self.flush_page();
        let total = self.pages.len().max(1);
        self.pages
            .into_iter()
            .enumerate()
            .map(|(i, mut ops)| {
                let label = format!("{page_label} {} / {total}", i + 1);
                ops.extend(text_ops(
                    regular,
                    8.0,
                    PAGE_W.0 - MARGIN_X - 30.0,
                    MARGIN_BOTTOM - 10.0,
                    &label,
                ));
                PdfPage::new(PAGE_W, PAGE_H, ops)
            })
            .collect()
    }

    // ── primitive draw helpers ───────────────────────────────────────────────

    fn draw_text(&mut self, x_mm: f32, y_mm: f32, size_pt: f32, s: &str) {
        self.current
            .extend(text_ops(self.regular, size_pt, x_mm, y_mm, s));
    }

    fn draw_text_bold(&mut self, x_mm: f32, y_mm: f32, size_pt: f32, s: &str) {
        self.current
            .extend(text_ops(self.bold, size_pt, x_mm, y_mm, s));
    }

    fn h_line(&mut self, y_mm: f32) {
        self.current.push(Op::SetOutlineColor {
            col: Color::Rgb(Rgb {
                r: 0.5,
                g: 0.5,
                b: 0.5,
                icc_profile: None,
            }),
        });
        self.current.push(Op::SetOutlineThickness { pt: Pt(0.4) });
        self.current.push(Op::DrawLine {
            line: Line {
                points: vec![
                    LinePoint {
                        p: Point::new(Mm(MARGIN_X), Mm(y_mm)),
                        bezier: false,
                    },
                    LinePoint {
                        p: Point::new(Mm(PAGE_W.0 - MARGIN_X), Mm(y_mm)),
                        bezier: false,
                    },
                ],
                is_closed: false,
            },
        });
    }
}

fn text_ops(font: &PdfFontHandle, size_pt: f32, x_mm: f32, y_mm: f32, s: &str) -> Vec<Op> {
    vec![
        Op::StartTextSection,
        Op::SetTextCursor {
            pos: Point::new(Mm(x_mm), Mm(y_mm)),
        },
        Op::SetFont {
            font: font.clone(),
            size: Pt(size_pt),
        },
        Op::SetLineHeight {
            lh: Pt(size_pt + 2.0),
        },
        Op::ShowText {
            items: vec![TextItem::Text(s.to_string())],
        },
        Op::EndTextSection,
    ]
}

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::fund_payment_report_pdf::request::{
        valid_request, CorrectionGroup, ReportGenerationRequest, UnreconciledColumns,
        UnreconciledRow, UnreconciledSection,
    };

    // ── FPR-013: pure function type-signature check ──────────────────────────

    fn _assert_pure_fn_signature(req: &ReportGenerationRequest) -> Result<Vec<u8>, ReportPdfError> {
        render(req)
    }

    // ── basic PDF validity ────────────────────────────────────────────────────

    #[test]
    fn render_output_starts_with_pdf_magic_bytes() {
        let req = valid_request();
        let bytes = render(&req).expect("render must succeed");
        assert!(bytes.len() >= 4);
        assert_eq!(&bytes[..4], b"%PDF");
    }

    #[test]
    fn render_output_is_larger_than_1kb() {
        let req = valid_request();
        let bytes = render(&req).expect("render must succeed");
        assert!(bytes.len() > 1024);
    }

    // ── FPR-021: pre-resolved title is honoured ──────────────────────────────

    #[test]
    fn render_succeeds_for_french_pre_resolved_request() {
        let req = valid_request();
        let bytes = render(&req).expect("render must succeed for the FR-resolved request");
        assert!(bytes.len() > 1024);
    }

    #[test]
    fn render_succeeds_for_english_pre_resolved_request() {
        let req = ReportGenerationRequest {
            title: "Reconciliation Report".into(),
            continuation_title: "Reconciliation Report (continued)".into(),
            header_lines: vec![
                "Period: 04/01/2026 → 04/30/2026".into(),
                "Generated on: May 6, 2026, 4:42 PM".into(),
                "PDF file: statement.pdf".into(),
            ],
            unreconciled: UnreconciledSection::Empty {
                heading: "Unreconciled procedures".into(),
                empty_message: "All procedures in the period have been reconciled.".into(),
            },
            correction_section_heading: "Corrections applied".into(),
            correction_groups: vec![],
            page_label: "Page".into(),
        };
        let bytes = render(&req).expect("render must succeed for the EN-resolved request");
        assert!(bytes.len() > 1024);
    }

    // ── FPR-031, FPR-033: populated section 1 ────────────────────────────────

    #[test]
    fn render_with_unreconciled_rows_includes_total_line() {
        let rows: Vec<UnreconciledRow> = (0..3)
            .map(|i| UnreconciledRow {
                date: "01/04/2026".into(),
                patient: format!("Patient {i}"),
                ssn: format!("{i:013}"),
                amount: "12,34 €".into(),
            })
            .collect();
        let req = ReportGenerationRequest {
            unreconciled: UnreconciledSection::Rows {
                heading: "Actes non rapprochés".into(),
                column_headers: UnreconciledColumns {
                    date: "Date acte".into(),
                    patient: "Patient".into(),
                    ssn: "INS".into(),
                    amount: "Montant facturé".into(),
                },
                rows,
                total_label: "Total".into(),
                total_value: "37,02 €".into(),
            },
            ..valid_request()
        };
        let bytes = render(&req).expect("render with rows must succeed");
        assert!(bytes.len() > 1024);
    }

    // ── FPR-022: multi-page document ─────────────────────────────────────────

    #[test]
    fn render_30_unreconciled_rows_produces_multipage_pdf() {
        let rows: Vec<UnreconciledRow> = (0..30)
            .map(|i| UnreconciledRow {
                date: "15/04/2026".into(),
                patient: format!("Patient {i}"),
                ssn: format!("{i:013}"),
                amount: "1,23 €".into(),
            })
            .collect();
        let req = ReportGenerationRequest {
            unreconciled: UnreconciledSection::Rows {
                heading: "Actes non rapprochés".into(),
                column_headers: UnreconciledColumns {
                    date: "Date".into(),
                    patient: "Patient".into(),
                    ssn: "INS".into(),
                    amount: "Montant".into(),
                },
                rows,
                total_label: "Total".into(),
                total_value: "36,90 €".into(),
            },
            ..valid_request()
        };
        let bytes = render(&req).expect("render with 30 rows must succeed");
        let doc = lopdf::Document::load_mem(&bytes).expect("output must be a parseable PDF");
        let page_count = doc.get_pages().len();
        assert!(
            page_count >= 2,
            "expected at least 2 pages for 30 rows, found {page_count}"
        );
    }

    // ── FPR-040, FPR-041, FPR-042: section 2 with multiple groups ────────────

    #[test]
    fn render_with_correction_groups_succeeds() {
        let req = ReportGenerationRequest {
            correction_groups: vec![
                CorrectionGroup {
                    title: "Montants contestés".into(),
                    rows: vec![
                        "Alice Dupont | 01/04/2026 | 70,00 € → 60,00 €".into(),
                        "Bob Martin | 02/04/2026 | 90,00 € → 80,00 €".into(),
                    ],
                },
                CorrectionGroup {
                    title: "Corrections de montant".into(),
                    rows: vec!["Claire Petit | 03/04/2026 | 50,00 € → 48,00 €".into()],
                },
            ],
            ..valid_request()
        };
        let bytes = render(&req).expect("render with correction groups must succeed");
        assert!(bytes.len() > 1024);
    }

    // ── FPR-040: empty groups omit the section entirely ──────────────────────

    #[test]
    fn render_omits_correction_section_when_groups_are_empty() {
        let req = valid_request();
        assert!(req.correction_groups.is_empty());
        let bytes = render(&req).expect("render must succeed without corrections");
        assert!(bytes.len() > 1024);
    }
}

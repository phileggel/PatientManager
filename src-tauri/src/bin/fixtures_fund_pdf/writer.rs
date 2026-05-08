//! Fund-PDF writer (IFC-060, IFC-064, IFC-065).
//!
//! Turns a `PdfParseResult` value plus its scenario emission order into a
//! `.pdf` file whose `pdf_extract::extract_text` output, fed to
//! `pdf_parser::parse_pdf_text`, yields the ORIGINAL `PdfParseResult` under
//! full structural equality (IFC-061 — no carve-outs).
//!
//! The writer reuses `printpdf` (already a prod dep for the
//! fund-payment-report renderer) per IFC-065 — the carve-out exempts
//! existing-prod-consumer libraries from IFC-013's "no prod inflation" rule.
//!
//! # Emission contract (spike-locked, 2026-05-08)
//!
//! `pdf-extract` emits two leading blank lines plus one blank separator
//! between each `Op::ShowText` line. Content lines therefore land at
//! indices 2, 4, 6, 8, … in the extracted text. The scenario builders'
//! `line_index` values rely on this pattern; the writer MUST emit one
//! `Op::ShowText` per logical line in `emission_order`, each in its own
//! `StartTextSection`/`EndTextSection` block.

use anyhow::{Context, Result};
use patient_manager_app::use_cases::fund_payment_reconciliation::fund_pdf_codec::PdfParseResult;
use printpdf::{
    Mm, Op, ParsedFont, PdfDocument, PdfFontHandle, PdfPage, PdfSaveOptions, Point, Pt, TextItem,
};
use std::path::{Path, PathBuf};

use super::scenarios;

// Reuse the same Roboto regular font shipped with the prod FPR renderer.
// The path resolves from src/bin/fixtures_fund_pdf/ → src-tauri/resources/fonts/
// (one extra `..` compared to use_cases/fund_payment_report_pdf/renderer.rs).
const FONT_REGULAR: &[u8] = include_bytes!("../../../resources/fonts/Roboto-Regular.ttf");

// A4 portrait — same geometry as the FPR renderer.
const PAGE_W: Mm = Mm(210.0);
const PAGE_H: Mm = Mm(297.0);
const MARGIN_X: f32 = 20.0;
const MARGIN_TOP: f32 = 280.0;
const LINE_STEP: f32 = 8.0;
const FONT_SIZE_PT: f32 = 9.0;

/// Render the scenario's PDF to `path` atomically.
///
/// `scenario_name` selects the emission order; `data` is the `PdfParseResult`
/// whose round-trip the PDF must satisfy. Both come from the same scenario
/// builder so they cannot drift.
pub fn write_pdf(scenario_name: &str, data: &PdfParseResult, path: &Path) -> Result<()> {
    let lines = scenarios::emission_order(scenario_name, data);
    let bytes = render_pdf_bytes(scenario_name, &lines)?;
    atomic_write_bytes(path, &bytes)
}

/// Write the JSON snapshot of the contract value (IFC-030, "expected.json").
/// Pretty-printed with a trailing newline for clean diffs.
pub fn write_expected_json(data: &PdfParseResult, path: &Path) -> Result<()> {
    let mut json = serde_json::to_string_pretty(data).context("serialize PdfParseResult")?;
    json.push('\n');
    atomic_write_bytes(path, json.as_bytes())
}

// --- rendering --------------------------------------------------------------

fn render_pdf_bytes(scenario_name: &str, lines: &[String]) -> Result<Vec<u8>> {
    let regular = ParsedFont::from_bytes(FONT_REGULAR, 0, &mut Vec::new())
        .context("parse Roboto-Regular for fund-PDF writer")?;

    let mut doc = PdfDocument::new(&format!("fund-pdf-fixture: {scenario_name}"));
    let regular_id = PdfFontHandle::External(doc.add_font(&regular));

    let mut ops: Vec<Op> = Vec::with_capacity(lines.len() * 6);
    let mut y = MARGIN_TOP;
    for line in lines {
        ops.extend(text_ops(&regular_id, FONT_SIZE_PT, MARGIN_X, y, line));
        y -= LINE_STEP;
    }

    let pages = vec![PdfPage::new(PAGE_W, PAGE_H, ops)];
    let bytes = doc
        .with_pages(pages)
        .save(&PdfSaveOptions::default(), &mut Vec::new());
    Ok(bytes)
}

/// Emit one logical text op per line — its own `StartTextSection`/`EndTextSection`
/// envelope is what makes `pdf_extract::extract_text` insert the blank
/// separator the spike-locked `line_index` values depend on.
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

// --- atomic write helpers (IFC-034) -----------------------------------------

fn atomic_write_bytes(final_path: &Path, contents: &[u8]) -> Result<()> {
    let temp_path = temp_path_for(final_path)?;
    let result = (|| -> Result<()> {
        if let Some(parent) = final_path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("create parent dir {}", parent.display()))?;
        }
        std::fs::write(&temp_path, contents)
            .with_context(|| format!("write {}", temp_path.display()))?;
        std::fs::rename(&temp_path, final_path)
            .with_context(|| format!("rename {} -> {}", temp_path.display(), final_path.display()))
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temp_path);
    }
    result
}

fn temp_path_for(final_path: &Path) -> Result<PathBuf> {
    let parent = final_path
        .parent()
        .context("fixture path must have a parent directory")?
        .to_path_buf();
    let name = final_path
        .file_name()
        .context("fixture path must have a file name")?
        .to_string_lossy();
    Ok(parent.join(format!(".{name}.tmp")))
}

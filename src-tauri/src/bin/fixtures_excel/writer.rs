//! Excel writer — turns a `ParsedExcelData` value into an `.xlsx` workbook
//! whose re-parse equals the input under the IFC-021 carve-out (IFC-020,
//! IFC-021, IFC-025).
//!
//! The writer follows the parser's expected layout (`use_cases::excel_import::parser`):
//!
//! - **`Patiente` sheet**: header-less. Col A = name, col C = SSN, col D =
//!   latest_fund (or `"0"` for None).
//! - **`Secu` sheet**: header-less. Col A = identifier, col B = name, col C =
//!   address.
//! - **Monthly sheets** (Jan..Déc): row 0 = header (`CODE | NOM | NOM SECU |
//!   CAISSE | ADRESSE | TARIF | DATE | ENVOI | T | REMBSE | Versé | En
//!   attente`); row 1+ = procedure data. The writer ALWAYS creates all twelve
//!   canonical month sheets so the parser never reports a missing sheet,
//!   keeping `parsing_issues.missing_sheets` empty.

use anyhow::{Context, Result};
use patient_manager_app::use_cases::excel_import::{
    ExcelFund, ExcelPatient, ExcelProcedure, ParsedExcelData,
};
use rust_xlsxwriter::{DocProperties, ExcelDateTime, Workbook};
use std::collections::HashMap;
use std::path::Path;

/// Canonical monthly sheet names in fixed order (matches the parser's
/// `monthly_sheet_variations` canonical entries).
const CANONICAL_MONTHS: &[&str] = &[
    "Jan", "Fév", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc",
];

/// Write the workbook to `path` atomically (IFC-034). On any failure the
/// partial temp file is removed so `tests/fixtures/` is never observed in a
/// half-written state.
pub fn write_xlsx(data: &ParsedExcelData, path: &Path) -> Result<()> {
    let mut workbook = Workbook::new();

    // Pin workbook creation time to a fixed value (IFC-040). The zip mtime
    // may still vary between runs; if so, IFC-040's fallback applies and we
    // rely solely on the round-trip property (IFC-021), not on byte equality.
    let fixed_dt = ExcelDateTime::from_ymd(2026, 1, 1)
        .context("build fixed creation datetime")?
        .and_hms(0, 0, 0)
        .context("set fixed creation time")?;
    let properties = DocProperties::new().set_creation_datetime(&fixed_dt);
    workbook.set_properties(&properties);

    // Sheet order is fixed: Patiente, Secu, then Jan..Déc. Stable order keeps
    // the central directory of the .xlsx zip stable across regenerations.
    write_patiente_sheet(&mut workbook, &data.patients)?;
    write_secu_sheet(&mut workbook, &data.funds)?;
    write_all_monthly_sheets(&mut workbook, data)?;

    atomic_save(&mut workbook, path)
}

/// Write the JSON snapshot of the contract value (IFC-030, "expected.json").
/// Pretty-printed with a trailing newline for clean diffs.
pub fn write_expected_json(data: &ParsedExcelData, path: &Path) -> Result<()> {
    let mut json = serde_json::to_string_pretty(data).context("serialize ParsedExcelData")?;
    json.push('\n');
    atomic_write_bytes(path, json.as_bytes())
}

// --- atomic write helpers (IFC-034) -----------------------------------------

fn atomic_save(workbook: &mut Workbook, final_path: &Path) -> Result<()> {
    let temp_path = temp_path_for(final_path)?;
    let result = (|| -> Result<()> {
        if let Some(parent) = final_path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("create parent dir {}", parent.display()))?;
        }
        workbook
            .save(&temp_path)
            .with_context(|| format!("save xlsx to {}", temp_path.display()))?;
        std::fs::rename(&temp_path, final_path)
            .with_context(|| format!("rename {} -> {}", temp_path.display(), final_path.display()))
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temp_path);
    }
    result
}

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

fn temp_path_for(final_path: &Path) -> Result<std::path::PathBuf> {
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

// --- sheet writers ----------------------------------------------------------

fn write_patiente_sheet(workbook: &mut Workbook, patients: &[ExcelPatient]) -> Result<()> {
    let sheet = workbook.add_worksheet();
    sheet.set_name("Patiente").context("name Patiente sheet")?;
    for (idx, p) in patients.iter().enumerate() {
        let row = idx as u32;
        sheet.write_string(row, 0, &p.name)?;
        // col 1: unused by the parser
        sheet.write_string(row, 2, &p.ssn)?;
        let fund_value = p.latest_fund.as_deref().unwrap_or("0");
        sheet.write_string(row, 3, fund_value)?;
    }
    Ok(())
}

fn write_secu_sheet(workbook: &mut Workbook, funds: &[ExcelFund]) -> Result<()> {
    let sheet = workbook.add_worksheet();
    sheet.set_name("Secu").context("name Secu sheet")?;
    for (idx, f) in funds.iter().enumerate() {
        let row = idx as u32;
        sheet.write_string(row, 0, &f.fund_identifier)?;
        sheet.write_string(row, 1, &f.fund_name)?;
        if let Some(addr) = &f.fund_address {
            sheet.write_string(row, 2, addr)?;
        }
    }
    Ok(())
}

fn write_all_monthly_sheets(workbook: &mut Workbook, data: &ParsedExcelData) -> Result<()> {
    let patient_map: HashMap<&str, &ExcelPatient> = data
        .patients
        .iter()
        .map(|p| (p.temp_id.as_str(), p))
        .collect();
    let fund_map: HashMap<&str, &ExcelFund> =
        data.funds.iter().map(|f| (f.temp_id.as_str(), f)).collect();

    // Group procedures by their declared sheet_month (deterministic via
    // CANONICAL_MONTHS iteration order).
    let mut by_month: HashMap<&str, Vec<&ExcelProcedure>> = HashMap::new();
    for p in &data.procedures {
        by_month.entry(p.sheet_month.as_str()).or_default().push(p);
    }

    for month in CANONICAL_MONTHS {
        let sheet = workbook.add_worksheet();
        sheet
            .set_name(*month)
            .with_context(|| format!("name {month} sheet"))?;
        write_monthly_header(sheet)?;

        // Determine procedures for this month, plus any extras the scenario
        // explicitly demands skipped rows for. Skipped-rows-by-design come
        // from the scenario's `parsing_issues.skipped_rows` entries that
        // target this sheet — see write_skipped_rows_for_month below.
        let procedures = by_month.get(*month).cloned().unwrap_or_default();
        let mut row_cursor: u32 = 1;
        for proc in procedures {
            write_procedure_row(sheet, row_cursor, proc, &patient_map, &fund_map)?;
            row_cursor += 1;
        }

        // Write any rows the scenario expects the parser to SKIP on this
        // monthly sheet. Each `SkippedRow` declares the row_number it MUST
        // appear at when re-parsed, plus the parser's expected reason.
        write_skipped_rows_for_month(sheet, month, &data.parsing_issues.skipped_rows, row_cursor)?;
    }

    Ok(())
}

fn write_monthly_header(sheet: &mut rust_xlsxwriter::Worksheet) -> Result<()> {
    let header = [
        "CODE",
        "NOM",
        "NOM SECU",
        "CAISSE",
        "ADRESSE",
        "TARIF",
        "DATE",
        "ENVOI",
        "T",
        "REMBSE",
        "Versé",
        "En attente",
    ];
    for (col, label) in header.iter().enumerate() {
        sheet.write_string(0, col as u16, *label)?;
    }
    Ok(())
}

fn write_procedure_row(
    sheet: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    proc: &ExcelProcedure,
    patients: &HashMap<&str, &ExcelPatient>,
    funds: &HashMap<&str, &ExcelFund>,
) -> Result<()> {
    let patient = patients
        .get(proc.patient_temp_id.as_str())
        .with_context(|| {
            format!(
                "scenario references unknown patient_temp_id={}",
                proc.patient_temp_id
            )
        })?;

    sheet.write_string(row, 0, &patient.ssn)?;
    sheet.write_string(row, 1, &patient.name)?;
    // col 2: NOM SECU (unused by parser)
    if let Some(fid) = &proc.fund_temp_id {
        let fund = funds
            .get(fid.as_str())
            .with_context(|| format!("scenario references unknown fund_temp_id={fid}"))?;
        sheet.write_string(row, 3, &fund.fund_identifier)?;
    }
    // col 4: ADRESSE (unused by parser)
    sheet.write_number(row, 5, proc.amount as f64 / 1000.0)?;
    sheet.write_string(row, 6, &proc.procedure_date)?;
    // col 7: ENVOI (unused by parser)
    if let Some(pm) = &proc.payment_method {
        sheet.write_string(row, 8, pm)?;
    }
    if let Some(cpd) = &proc.confirmed_payment_date {
        sheet.write_string(row, 9, cpd)?;
    }
    if let Some(pa) = proc.paid_amount {
        sheet.write_number(row, 10, pa as f64 / 1000.0)?;
    }
    if let Some(aa) = proc.awaited_amount {
        sheet.write_number(row, 11, aa as f64 / 1000.0)?;
    }
    Ok(())
}

/// Write rows the scenario expects the parser to skip with a known reason.
///
/// The scenario's `parsing_issues.skipped_rows` declares for each bad row:
/// `(sheet, row_number, reason)`. The writer must place the bad row at the
/// declared `row_number` AND craft its content so that the parser produces
/// exactly the declared `reason`.
///
/// This implementation handles the reasons the IFC-032 §2 scenarios use.
/// New reasons require extending this match arm.
fn write_skipped_rows_for_month(
    sheet: &mut rust_xlsxwriter::Worksheet,
    month: &str,
    skipped_rows: &[patient_manager_app::use_cases::excel_import::SkippedRow],
    next_row_cursor: u32,
) -> Result<()> {
    for sr in skipped_rows.iter().filter(|sr| sr.sheet == month) {
        if sr.row_number == 0 {
            anyhow::bail!(
                "scenario inconsistency on sheet '{month}': row_number 0 is reserved for \
                 the header row (the parser counts rows from 1)"
            );
        }
        // Row index in calamine is 0-based; the parser reports row_number =
        // row_idx + 1, so target_row_idx = row_number - 1.
        let target_row_idx = sr.row_number - 1;
        if target_row_idx < next_row_cursor {
            anyhow::bail!(
                "scenario inconsistency on sheet '{month}': skipped row_number {} would \
                 collide with an earlier valid procedure row (next free row is {})",
                sr.row_number,
                next_row_cursor + 1
            );
        }
        match sr.reason.as_str() {
            // EXI R2 (date format): non-empty patient + amount, but the date
            // cell is non-empty and unparseable.
            r if r.starts_with("Unrecognized date format:") => {
                let bad_date =
                    extract_quoted(r).with_context(|| format!("malformed reason: {r}"))?;
                sheet.write_string(target_row_idx, 0, "1234567890123")?;
                sheet.write_string(target_row_idx, 1, "Alice Martin")?;
                sheet.write_string(target_row_idx, 3, "FUND-A")?;
                sheet.write_number(target_row_idx, 5, 50.0)?;
                sheet.write_string(target_row_idx, 6, bad_date)?;
            }
            other => anyhow::bail!(
                "scenario declares an unsupported skip reason on sheet '{month}': {other}"
            ),
        }
    }
    Ok(())
}

fn extract_quoted(s: &str) -> Option<&str> {
    let start = s.find('\'')?;
    let rest = &s[start + 1..];
    let end = rest.rfind('\'')?;
    Some(&rest[..end])
}

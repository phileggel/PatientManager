//! Excel surface of the dev fixture generator (IFC-023, IFC-031).
//!
//! Owns the scenario builders (hardcoded `ParsedExcelData` values) and the
//! Excel writer that turns each scenario into an `.xlsx` file plus a sibling
//! `.expected.json` snapshot. Other surfaces (fund-PDF, bank-PDF) live in
//! sibling modules when added.

pub mod scenarios;
pub mod writer;

use anyhow::{Context, Result};
use patient_manager_app::use_cases::excel_import::ParsedExcelData;
use std::path::Path;

/// Regenerate one or all scenarios for the Excel surface.
///
/// `out_root` is the directory under which `{scenario}.xlsx` and
/// `{scenario}.expected.json` are written. If `scenario` is `None`, every
/// scenario in the registry is regenerated. If it names an unknown scenario,
/// returns an error listing the known names.
type ScenarioBuilder = fn() -> ParsedExcelData;
type ScenarioEntry = (&'static str, ScenarioBuilder);

pub fn regenerate(out_root: &Path, scenario: Option<&str>) -> Result<()> {
    std::fs::create_dir_all(out_root)
        .with_context(|| format!("create output dir {}", out_root.display()))?;

    let registry: &[ScenarioEntry] = &[
        (
            "happy_path_3_patients_2_funds",
            scenarios::happy_path_3_patients_2_funds,
        ),
        (
            "skipped_rows_invalid_dates",
            scenarios::skipped_rows_invalid_dates,
        ),
    ];

    let to_run: Vec<&ScenarioEntry> = match scenario {
        None => registry.iter().collect(),
        Some(name) => registry.iter().filter(|(n, _)| *n == name).collect(),
    };

    if to_run.is_empty() {
        anyhow::bail!(
            "unknown scenario for surface 'excel': {}\nKnown: {}",
            scenario.unwrap_or("(none)"),
            registry
                .iter()
                .map(|(n, _)| *n)
                .collect::<Vec<_>>()
                .join(", ")
        );
    }

    for (name, builder) in to_run {
        let data = builder();
        let xlsx_path = out_root.join(format!("{name}.xlsx"));
        let json_path = out_root.join(format!("{name}.expected.json"));

        writer::write_xlsx(&data, &xlsx_path)
            .with_context(|| format!("write xlsx for scenario {name}"))?;
        writer::write_expected_json(&data, &json_path)
            .with_context(|| format!("write expected.json for scenario {name}"))?;

        println!(
            "wrote {} -> {} + {}",
            name,
            xlsx_path
                .strip_prefix(
                    out_root
                        .parent()
                        .and_then(|p| p.parent())
                        .unwrap_or(out_root)
                )
                .unwrap_or(&xlsx_path)
                .display(),
            json_path.file_name().unwrap_or_default().to_string_lossy(),
        );
    }

    Ok(())
}

//! Bank-PDF surface of the dev fixture generator (IFC-023, IFC-031, IFC-100).
//!
//! Owns the scenario builders (hardcoded `BankStatementParseResult` values)
//! and the PDF writer that turns each scenario into a `.pdf` file plus a
//! sibling `.expected.json` snapshot. Sibling to `fixtures_excel` and
//! `fixtures_fund_pdf` per IFC-023 — the three surfaces share NO traits,
//! helpers, or constants.

pub mod scenarios;
pub mod writer;

use anyhow::{Context, Result};
use patient_manager_app::use_cases::bank_statement_reconciliation::bank_pdf_codec::BankStatementParseResult;
use std::path::Path;

type ScenarioBuilder = fn() -> BankStatementParseResult;
type ScenarioEntry = (&'static str, ScenarioBuilder);

/// Regenerate one or all scenarios for the bank-PDF surface.
///
/// `out_root` is the directory under which `{scenario}.pdf` and
/// `{scenario}.expected.json` are written. If `scenario` is `None`, every
/// scenario in the registry is regenerated. If it names an unknown scenario,
/// returns an error listing the known names.
pub fn regenerate(out_root: &Path, scenario: Option<&str>) -> Result<()> {
    std::fs::create_dir_all(out_root)
        .with_context(|| format!("create output dir {}", out_root.display()))?;

    let registry: &[ScenarioEntry] = &[
        (
            "happy_path_multi_label",
            scenarios::happy_path_multi_label as ScenarioBuilder,
        ),
        (
            "iban_period_only_no_credits",
            scenarios::iban_period_only_no_credits as ScenarioBuilder,
        ),
    ];

    let to_run: Vec<&ScenarioEntry> = match scenario {
        None => registry.iter().collect(),
        Some(name) => registry.iter().filter(|(n, _)| *n == name).collect(),
    };

    if to_run.is_empty() {
        anyhow::bail!(
            "unknown scenario for surface 'bank-pdf': {}\nKnown: {}",
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
        let pdf_path = out_root.join(format!("{name}.pdf"));
        let json_path = out_root.join(format!("{name}.expected.json"));

        writer::write_pdf(name, &data, &pdf_path)
            .with_context(|| format!("write pdf for scenario {name}"))?;
        writer::write_expected_json(&data, &json_path)
            .with_context(|| format!("write expected.json for scenario {name}"))?;

        println!(
            "wrote {} -> {} + {}",
            name,
            pdf_path
                .strip_prefix(
                    out_root
                        .parent()
                        .and_then(|p| p.parent())
                        .unwrap_or(out_root)
                )
                .unwrap_or(&pdf_path)
                .display(),
            json_path.file_name().unwrap_or_default().to_string_lossy(),
        );
    }

    Ok(())
}

#![cfg(feature = "dev-fixtures")]
//! Dev fixture generator (IFC-010, IFC-012).
//!
//! Inverse of the production import parsers. Per surface, takes a hardcoded
//! scenario value of the surface's contract type and writes a fixture file the
//! parser would have produced from. Output lands under
//! `src-tauri/tests/fixtures/{surface}/`. Run with `just regen-fixtures` (or
//! the surface-scoped recipe).
//!
//! This binary is feature-gated and never linked into the prod app
//! (IFC-013).

mod fixtures_excel;

use anyhow::{Context, Result};
use std::env;
use std::path::PathBuf;
use std::process::ExitCode;

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("error: {e:#}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<()> {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.is_empty() {
        print_usage();
        anyhow::bail!("missing surface argument");
    }

    let surface = args[0].as_str();
    let scenario = args.get(1).map(String::as_str);

    let manifest_dir = env::var("CARGO_MANIFEST_DIR")
        .context("CARGO_MANIFEST_DIR not set; run via `cargo run`")?;
    let out_root = PathBuf::from(manifest_dir)
        .join("tests")
        .join("fixtures")
        .join(surface);

    match surface {
        "excel" => fixtures_excel::regenerate(&out_root, scenario),
        other => {
            print_usage();
            anyhow::bail!("unknown surface: {other}")
        }
    }
}

fn print_usage() {
    eprintln!("Usage: generate_fixtures <surface> [scenario]");
    eprintln!();
    eprintln!("Surfaces:");
    eprintln!("  excel    Excel xlsx fixtures");
    eprintln!();
    eprintln!("If <scenario> is omitted, regenerates every scenario for the surface.");
}

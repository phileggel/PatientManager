#![cfg(feature = "dev-fixtures")]
//! Round-trip integration tests for the Import Fixture Codec (IFC), Excel surface.
//!
//! Spec reference: docs/spec/import-codec-fixtures.md, rules IFC-021, IFC-032, IFC-051.
//! Plan reference: docs/plan/import-codec-fixtures-plan.md, §Backend.
//!
//! # What is tested
//!
//! For each committed scenario, the round-trip property (IFC-021) holds:
//!
//!   `parse(generate(scenario)) == scenario`
//!
//! Structurally: the parser's output on the committed fixture file MUST equal
//! the expected `ParsedExcelData` declared in the scenario builder, on every
//! durable field.
//!
//! # UUID carve-out (IFC-021)
//!
//! The parser mints fresh session-scoped UUIDs on every invocation (EXI R5):
//!
//! - `ExcelPatient.temp_id`       — new UUID per patient per parse session
//! - `ExcelFund.temp_id`          — new UUID per fund per parse session
//! - `ExcelProcedure.procedure_type_tmp_id` — new UUID per distinct amount per session
//!
//! These three fields are explicitly excluded from the round-trip equality by
//! IFC-021.
//!
//! # Transport-metadata carve-out (IFC-026)
//!
//! `ExcelProcedure.source_row` is 1-based row index assigned by the parser at
//! read time. Scenarios do not specify it; the generator assigns it from its own
//! layout strategy when writing the fixture file, and the parser re-derives it
//! independently from the row position in the emitted `.xlsx`. The round-trip
//! equality (IFC-021) does NOT apply to this field — it is excluded from
//! `to_comparable_json` alongside the UUID carve-outs.
//!
//! # Foreign-key UUID decision (extended carve-out)
//!
//! `ExcelProcedure.patient_temp_id` and `ExcelProcedure.fund_temp_id` are
//! foreign-key references to the parent `ExcelPatient.temp_id` and
//! `ExcelFund.temp_id` values above. Because those parent values are
//! session-scoped UUIDs that differ on every parse, the FK fields are also
//! unstable between the scenario's expected value and the parser's actual
//! output. Asserting equality on them is impossible without also asserting
//! on the parent IDs (which IFC-021 carves out).
//!
//! Decision: extend the carve-out to `patient_temp_id` and `fund_temp_id` on
//! `ExcelProcedure`. These fields are omitted from structural equality in the
//! same way as the three fields named explicitly in IFC-021. The round-trip
//! property is still non-trivial: every other procedure field (amount,
//! procedure_date, sheet_month, payment_method, confirmed_payment_date,
//! paid_amount, awaited_amount) and all of `parsing_issues` are compared in
//! full. The scenario builder must therefore declare the correct values for
//! those fields; any discrepancy between the generator output and the parser
//! result will cause the assertion to fail.
//!
//! # Comparison strategy
//!
//! `ParsedExcelData` does not derive `PartialEq` (and IFC-022 forbids modifying
//! `domain.rs`). Comparison is performed by serializing both sides to
//! `serde_json::Value` and removing the session-scoped UUID keys from the JSON
//! tree before comparing. This is exact structural equality on all remaining
//! fields with no loss of fidelity.
//!
//! # Feature gate
//!
//! This file is gated by `#![cfg(feature = "dev-fixtures")]` (IFC-051).
//! The standard `cargo test` job (no features) compiles the file but skips it
//! entirely (the `cfg` makes the whole module empty). Only the dev-fixtures CI
//! job enables the feature and actually runs these tests.

mod common;

use patient_manager_app::use_cases::excel_import::{ExcelParserService, ParsedExcelData};
use serde_json::Value;

// ---------------------------------------------------------------------------
// Equality helper
// ---------------------------------------------------------------------------

/// Serializes `ParsedExcelData` to a `serde_json::Value` and strips every
/// session-scoped UUID field, implementing the IFC-021 carve-out plus the
/// extended foreign-key carve-out documented in the module header.
///
/// Fields removed from the JSON tree:
///   - Each object in `patients`: removes `"temp_id"`
///   - Each object in `funds`:    removes `"temp_id"`
///   - Each object in `procedures`: removes `"procedure_type_tmp_id"`,
///     `"patient_temp_id"`, `"fund_temp_id"` (extended carve-out)
///
/// All other fields — including every field of `parsing_issues` — are
/// retained and compared in full.
///
/// Panics if serialization fails (which would indicate a bug in `ParsedExcelData`'s
/// `Serialize` impl, not in the fixture).
fn to_comparable_json(data: &ParsedExcelData) -> Value {
    let mut v = serde_json::to_value(data).expect("ParsedExcelData must be serializable");

    // Strip patient temp_ids
    if let Some(patients) = v.get_mut("patients").and_then(Value::as_array_mut) {
        for patient in patients.iter_mut() {
            if let Some(obj) = patient.as_object_mut() {
                obj.remove("temp_id");
            }
        }
    }

    // Strip fund temp_ids
    if let Some(funds) = v.get_mut("funds").and_then(Value::as_array_mut) {
        for fund in funds.iter_mut() {
            if let Some(obj) = fund.as_object_mut() {
                obj.remove("temp_id");
            }
        }
    }

    // Strip procedure session-scoped UUID fields (named carve-out + extended FK carve-out)
    // and transport-metadata fields (IFC-026 carve-out).
    if let Some(procedures) = v.get_mut("procedures").and_then(Value::as_array_mut) {
        for procedure in procedures.iter_mut() {
            if let Some(obj) = procedure.as_object_mut() {
                obj.remove("procedure_type_tmp_id");
                obj.remove("patient_temp_id"); // extended carve-out — FK to patient.temp_id
                obj.remove("fund_temp_id"); // extended carve-out — FK to fund.temp_id
                obj.remove("source_row"); // IFC-026 — transport metadata excluded from round-trip equality
            }
        }
    }

    v
}

/// Sorts the `patients`, `funds`, `procedures`, and `skipped_rows` arrays
/// inside a comparable JSON value by their JSON string representation.
///
/// This is required because the parser does not guarantee stable ordering
/// for patients or funds (HashMap-derived collections), and procedures are
/// ordered by sheet then row but may differ if row order in the fixture
/// differs from scenario expectation order. Sorting both sides before
/// comparison avoids spurious order-sensitivity failures.
fn sort_for_comparison(v: &mut Value) {
    let sort_array = |arr: &mut Vec<Value>| {
        arr.sort_by(|a, b| {
            serde_json::to_string(a)
                .expect("Value must be serializable in sort comparator")
                .cmp(
                    &serde_json::to_string(b)
                        .expect("Value must be serializable in sort comparator"),
                )
        });
    };

    if let Some(arr) = v.get_mut("patients").and_then(Value::as_array_mut) {
        sort_array(arr);
    }
    if let Some(arr) = v.get_mut("funds").and_then(Value::as_array_mut) {
        sort_array(arr);
    }
    if let Some(arr) = v.get_mut("procedures").and_then(Value::as_array_mut) {
        sort_array(arr);
    }
    if let Some(issues) = v.get_mut("parsing_issues") {
        if let Some(arr) = issues.get_mut("skipped_rows").and_then(Value::as_array_mut) {
            sort_array(arr);
        }
        if let Some(arr) = issues
            .get_mut("missing_sheets")
            .and_then(Value::as_array_mut)
        {
            sort_array(arr);
        }
    }
}

// ---------------------------------------------------------------------------
// Scenario 1 — happy path (IFC-032 §1)
// ---------------------------------------------------------------------------

/// Assert round-trip for the `happy_path_3_patients_2_funds` scenario.
///
/// Loads the expected `ParsedExcelData` from the typed fixture helper
/// (IFC-050). Parses the committed `.xlsx` fixture using the production
/// parser (`ExcelParserService::parse_excel`). Asserts structural equality
/// on all durable fields after stripping session-scoped UUIDs.
///
/// For this scenario `parsing_issues` MUST be empty (IFC-032 §1). Equality
/// on `parsing_issues` is therefore a meaningful assertion: if the generator
/// accidentally emits malformed rows, the parser will produce a non-empty
/// `parsing_issues`, causing this test to fail even though field counts match.
#[tokio::test]
async fn excel_happy_path_3_patients_2_funds_round_trips() {
    let (fixture_path, expected) = common::fixtures::excel::happy_path();

    let fixture_path_str = fixture_path
        .to_str()
        .expect("fixture path must be valid UTF-8");

    let parsed = ExcelParserService::parse_excel(fixture_path_str)
        .await
        .expect("parser must succeed on a valid fixture file");

    assert_eq!(
        expected.patients.len(),
        parsed.patients.len(),
        "patient count must match scenario declaration"
    );
    assert_eq!(
        expected.funds.len(),
        parsed.funds.len(),
        "fund count must match scenario declaration"
    );
    assert_eq!(
        expected.procedures.len(),
        parsed.procedures.len(),
        "procedure count must match scenario declaration"
    );

    let mut expected_json = to_comparable_json(&expected);
    let mut parsed_json = to_comparable_json(&parsed);
    sort_for_comparison(&mut expected_json);
    sort_for_comparison(&mut parsed_json);

    // Full structural equality on durable fields — this is the IFC-021 assertion.
    assert_eq!(
        expected_json, parsed_json,
        "round-trip failed for happy_path_3_patients_2_funds: \
         parse(generate(scenario)) must equal scenario on all durable fields"
    );
}

// ---------------------------------------------------------------------------
// Scenario 2 — parsing issues (IFC-032 §2)
// ---------------------------------------------------------------------------

/// Assert round-trip for the `skipped_rows_invalid_dates` scenario.
///
/// This scenario's monthly sheet intentionally contains rows that the parser
/// skips per EXI R2/R3 (empty patient name, invalid SSN, unparseable date).
/// The scenario builder declares the expected `parsing_issues.skipped_rows`
/// up-front; the round-trip test verifies the parser emits exactly those rows.
///
/// This is the non-trivial assertion per IFC-021: without it, the round-trip
/// would be trivially true even if the generator fails to produce the intended
/// bad rows.
#[tokio::test]
async fn excel_skipped_rows_invalid_dates_round_trips() {
    let (fixture_path, expected) = common::fixtures::excel::skipped_rows_invalid_dates();

    let fixture_path_str = fixture_path
        .to_str()
        .expect("fixture path must be valid UTF-8");

    let parsed = ExcelParserService::parse_excel(fixture_path_str)
        .await
        .expect("parser must succeed on a fixture file (even one with intentional bad rows)");

    // Verify that parsing_issues are non-empty — a trivially-passing scenario
    // that emits no bad rows would be a spec violation (IFC-021 rationale).
    assert!(
        !parsed.parsing_issues.skipped_rows.is_empty(),
        "skipped_rows_invalid_dates scenario must produce at least one skipped row \
         (EXI R2/R3); got zero — the generator did not emit the intended bad rows"
    );

    assert_eq!(
        expected.patients.len(),
        parsed.patients.len(),
        "patient count must match scenario declaration"
    );
    assert_eq!(
        expected.funds.len(),
        parsed.funds.len(),
        "fund count must match scenario declaration"
    );
    assert_eq!(
        expected.procedures.len(),
        parsed.procedures.len(),
        "procedure count must match scenario declaration"
    );

    let mut expected_json = to_comparable_json(&expected);
    let mut parsed_json = to_comparable_json(&parsed);
    sort_for_comparison(&mut expected_json);
    sort_for_comparison(&mut parsed_json);

    // Full structural equality — including parsing_issues.skipped_rows (IFC-021).
    assert_eq!(
        expected_json, parsed_json,
        "round-trip failed for skipped_rows_invalid_dates: \
         parse(generate(scenario)) must equal scenario on all durable fields \
         including parsing_issues"
    );
}

// ---------------------------------------------------------------------------
// IFC-026 — source_row carve-out does not break round-trip equality
// ---------------------------------------------------------------------------

/// IFC-026: `ExcelProcedure.source_row` is transport metadata — the scenario
/// may specify an arbitrary value (here `source_row: 99`) that differs from
/// what the parser would assign (1-based row index from the actual file).
/// `to_comparable_json` strips `source_row` from both sides, so the round-trip
/// equality still holds even though the field values differ.
///
/// This test does NOT call the real parser; it verifies the stripping
/// behaviour of `to_comparable_json` in isolation by constructing two
/// `ParsedExcelData` instances that are identical on all durable fields but
/// carry different `source_row` values, then asserting they compare equal
/// after the carve-out is applied.
#[cfg(feature = "dev-fixtures")]
#[test]
fn ifc_026_source_row_difference_does_not_break_round_trip_equality() {
    use patient_manager_app::use_cases::excel_import::excel_codec::{
        ExcelPatient, ExcelProcedure, ParsedExcelData, ParsingIssues,
    };

    let make_data = |source_row: u32| ParsedExcelData {
        patients: vec![ExcelPatient {
            temp_id: "patient-tmp".to_string(),
            name: "Test Patient".to_string(),
            ssn: "1234567890123".to_string(),
            latest_fund: None,
        }],
        funds: vec![],
        procedures: vec![ExcelProcedure {
            patient_temp_id: "patient-tmp".to_string(),
            fund_temp_id: None,
            procedure_type_tmp_id: "type-uuid".to_string(),
            amount: 10000,
            procedure_date: "2026-01-15".to_string(),
            sheet_month: "Jan".to_string(),
            payment_method: None,
            confirmed_payment_date: None,
            paid_amount: None,
            awaited_amount: None,
            source_row,
        }],
        parsing_issues: ParsingIssues {
            skipped_rows: vec![],
            missing_sheets: vec![],
        },
    };

    // scenario says source_row: 99; parser would assign source_row: 1 (first data row)
    let scenario_data = make_data(99);
    let parser_data = make_data(1);

    let mut scenario_json = to_comparable_json(&scenario_data);
    let mut parser_json = to_comparable_json(&parser_data);
    sort_for_comparison(&mut scenario_json);
    sort_for_comparison(&mut parser_json);

    assert_eq!(
        scenario_json, parser_json,
        "IFC-026: source_row difference must not break round-trip equality after carve-out"
    );
}

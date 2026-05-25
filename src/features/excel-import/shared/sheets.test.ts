import { describe, expect, it } from "vitest";
import type { ParseExcelResponse } from "@/bindings";
import { extractSheets, SHEET_ORDER } from "./sheets";

function makeParsedData(sheetMonths: string[]): ParseExcelResponse {
  return {
    patients: [],
    funds: [],
    procedures: sheetMonths.map((sheet_month, i) => ({
      patient_temp_id: `pat-${i}`,
      fund_temp_id: null,
      procedure_type_tmp_id: `type-${i}`,
      amount: 1000,
      procedure_date: "2026-01-15",
      sheet_month,
      payment_method: null,
      confirmed_payment_date: null,
      paid_amount: null,
      awaited_amount: null,
      source_row: i + 2,
    })),
    total_records: sheetMonths.length,
    parsing_issues: { skipped_rows: [], missing_sheets: [] },
  };
}

// ---------------------------------------------------------------------------
// extractSheets — EXI-110 / EXI-270
// ---------------------------------------------------------------------------

describe("extractSheets", () => {
  // EXI-110 — reads sheet_month directly (canonical name), not procedure_date substring
  it("returns unique canonical sheet names from proc.sheet_month", () => {
    const data = makeParsedData(["Jan", "Jan", "Fév", "Mars"]);
    const result = extractSheets(data);
    expect(result).toContain("Jan");
    expect(result).toContain("Fév");
    expect(result).toContain("Mars");
    expect(result).toHaveLength(3);
  });

  // Sort order — uses SHEET_ORDER canonical month order, not lexicographic
  it("sorts returned sheets by canonical SHEET_ORDER, not alphabetically", () => {
    // Alphabetically: "Avr" < "Fév" < "Jan" — canonical order: Jan(1) < Fév(2) < Avr(4)
    const data = makeParsedData(["Avr", "Fév", "Jan"]);
    const result = extractSheets(data);
    expect(result).toEqual(["Jan", "Fév", "Avr"]);
  });

  // Non-consecutive months — correct canonical order preserved
  it("returns sheets sorted by canonical order when months are non-consecutive", () => {
    const data = makeParsedData(["Déc", "Jan", "Juin"]);
    const result = extractSheets(data);
    expect(result).toEqual(["Jan", "Juin", "Déc"]);
  });

  // Empty procedures — returns empty array
  it("returns empty array when there are no procedures", () => {
    const data = makeParsedData([]);
    expect(extractSheets(data)).toEqual([]);
  });

  // Single sheet, multiple rows — deduplicated to one entry
  it("deduplicates when all procedures share the same sheet", () => {
    const data = makeParsedData(["Mars", "Mars", "Mars"]);
    expect(extractSheets(data)).toEqual(["Mars"]);
  });

  // EXI-110 — does NOT derive from procedure_date.substring(0,7) (old behaviour)
  it("does not produce YYYY-MM strings — sheet_month is already canonical", () => {
    const data = makeParsedData(["Jan"]);
    const result = extractSheets(data);
    for (const sheet of result) {
      expect(sheet).not.toMatch(/^\d{4}-\d{2}$/);
    }
  });

  // Branch coverage: rows with empty sheet_month are skipped
  it("skips procedures whose sheet_month is an empty string", () => {
    const data = makeParsedData(["Jan", "", "Fév"]);
    const result = extractSheets(data);
    expect(result).toEqual(["Jan", "Fév"]);
    expect(result).not.toContain("");
  });

  // Branch coverage: unknown sheet names sort to the end via the `?? 99` fallback
  it("places unknown sheet names after canonical ones via the order fallback", () => {
    const data = makeParsedData(["UnknownA", "Jan", "UnknownZ"]);
    const result = extractSheets(data);
    // Jan (canonical, order 1) must come first; unknown sheets fall back to 99
    expect(result[0]).toBe("Jan");
    expect(result.slice(1).sort()).toEqual(["UnknownA", "UnknownZ"].sort());
  });
});

// ---------------------------------------------------------------------------
// SHEET_ORDER constant — shared with ParsingReportModal
// ---------------------------------------------------------------------------

describe("SHEET_ORDER", () => {
  it("exports a record mapping canonical sheet names to numeric order", () => {
    expect(typeof SHEET_ORDER).toBe("object");
    expect(SHEET_ORDER["Jan"]).toBeDefined();
    expect(SHEET_ORDER["Déc"]).toBeDefined();
  });

  it("covers all 12 canonical sheet names", () => {
    const expected = [
      "Jan",
      "Fév",
      "Mars",
      "Avr",
      "Mai",
      "Juin",
      "Juil",
      "Août",
      "Sep",
      "Oct",
      "Nov",
      "Déc",
    ];
    for (const name of expected) {
      expect(SHEET_ORDER[name]).toBeDefined();
    }
  });

  it("assigns Jan the lowest value and Déc the highest", () => {
    const jan = SHEET_ORDER["Jan"];
    const dec = SHEET_ORDER["Déc"];
    if (jan === undefined || dec === undefined) {
      throw new Error("Jan and Déc must be in SHEET_ORDER");
    }
    expect(jan).toBeLessThan(dec);
  });
});

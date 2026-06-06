import { describe, expect, it } from "vitest";
import type { ExcelProcedure } from "@/bindings";
import { deriveProcedureMappings } from "./mappings";

function makeProc(overrides: Partial<ExcelProcedure>): ExcelProcedure {
  return {
    patient_temp_id: "pat-1",
    fund_temp_id: null,
    procedure_type_tmp_id: "type-1",
    amount: 25000,
    procedure_date: "2026-05-15",
    sheet_month: "Mai",
    payment_method: null,
    confirmed_payment_date: null,
    paid_amount: null,
    awaited_amount: null,
    source_row: 2,
    ...overrides,
  };
}

describe("deriveProcedureMappings", () => {
  // The bug this fixes: a June 0.75 amount was prompted for mapping even when
  // only "Mai" was selected, because the list was built from all sheets.
  it("excludes amounts whose only occurrence is in an unselected sheet", () => {
    const procedures = [
      makeProc({ procedure_type_tmp_id: "type-mai", amount: 25000, sheet_month: "Mai" }),
      makeProc({ procedure_type_tmp_id: "type-juin", amount: 750, sheet_month: "Juin" }),
    ];

    const result = deriveProcedureMappings(procedures, ["Mai"]);

    expect(result).toEqual([{ tmp_id: "type-mai", amount: 25000 }]);
    expect(result.some((m) => m.amount === 750)).toBe(false);
  });

  it("includes amounts present in a selected sheet", () => {
    const procedures = [
      makeProc({ procedure_type_tmp_id: "type-mai", amount: 25000, sheet_month: "Mai" }),
      makeProc({ procedure_type_tmp_id: "type-juin", amount: 750, sheet_month: "Juin" }),
    ];

    const result = deriveProcedureMappings(procedures, ["Mai", "Juin"]);

    expect(result).toEqual([
      { tmp_id: "type-mai", amount: 25000 },
      { tmp_id: "type-juin", amount: 750 },
    ]);
  });

  it("dedups a tmp_id appearing across multiple selected sheets into one row", () => {
    const procedures = [
      makeProc({ procedure_type_tmp_id: "type-shared", amount: 25000, sheet_month: "Mai" }),
      makeProc({ procedure_type_tmp_id: "type-shared", amount: 25000, sheet_month: "Juin" }),
    ];

    const result = deriveProcedureMappings(procedures, ["Mai", "Juin"]);

    expect(result).toEqual([{ tmp_id: "type-shared", amount: 25000 }]);
  });

  // A tmp_id present in both a selected and an unselected sheet: the unselected
  // occurrence must neither suppress the selected one nor leak its own amount.
  it("keeps a tmp_id seen in a selected sheet even when it also appears unselected", () => {
    const procedures = [
      makeProc({ procedure_type_tmp_id: "type-shared", amount: 25000, sheet_month: "Mai" }),
      makeProc({ procedure_type_tmp_id: "type-shared", amount: 25000, sheet_month: "Juin" }),
    ];

    const result = deriveProcedureMappings(procedures, ["Mai"]);

    expect(result).toEqual([{ tmp_id: "type-shared", amount: 25000 }]);
  });

  it("returns an empty list when no sheets are selected", () => {
    const procedures = [makeProc({ sheet_month: "Mai" })];
    expect(deriveProcedureMappings(procedures, [])).toEqual([]);
  });

  it("returns an empty list when there are no procedures", () => {
    expect(deriveProcedureMappings([], ["Mai"])).toEqual([]);
  });
});

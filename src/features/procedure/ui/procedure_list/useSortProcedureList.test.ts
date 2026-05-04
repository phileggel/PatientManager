import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProcedureRow } from "../../model/procedure-row.types";
import { useSortProcedureList } from "./useSortProcedureList";

function makeRow(overrides: Partial<ProcedureRow> = {}): ProcedureRow {
  return {
    rowId: "r-1",
    isDraft: false,
    draftPeriod: null,
    patientId: null,
    patientName: null,
    ssn: null,
    fundId: null,
    fundIdentifier: null,
    fundName: null,
    procedureTypeId: null,
    procedureName: null,
    procedureDate: null,
    procedureAmount: null,
    effectiveAmount: null,
    paymentMethod: null,
    confirmedPaymentDate: null,
    actualPaymentAmount: null,
    awaitedAmount: null,
    status: null,
    ...overrides,
  };
}

describe("useSortProcedureList", () => {
  it("returns rows unchanged with no sort applied", () => {
    const rows = [
      makeRow({ rowId: "r-1", patientName: "Dupont" }),
      makeRow({ rowId: "r-2", patientName: "Arnaud" }),
    ];
    const { result } = renderHook(() => useSortProcedureList(rows));
    expect(result.current.sortedRows).toEqual(rows);
    expect(result.current.sortConfig).toEqual({ key: null, direction: null });
  });

  it("sorts by patientName asc on first click", () => {
    const rows = [
      makeRow({ rowId: "r-1", patientName: "Dupont" }),
      makeRow({ rowId: "r-2", patientName: "Arnaud" }),
      makeRow({ rowId: "r-3", patientName: "Martin" }),
    ];
    const { result } = renderHook(() => useSortProcedureList(rows));

    act(() => result.current.handleSort("patientName"));

    expect(result.current.sortConfig).toEqual({ key: "patientName", direction: "asc" });
    expect(result.current.sortedRows[0]?.rowId).toBe("r-2"); // Arnaud
    expect(result.current.sortedRows[2]?.rowId).toBe("r-3"); // Martin
  });

  it("sorts by patientName desc on second click", () => {
    const rows = [
      makeRow({ rowId: "r-1", patientName: "Dupont" }),
      makeRow({ rowId: "r-2", patientName: "Arnaud" }),
    ];
    const { result } = renderHook(() => useSortProcedureList(rows));

    act(() => result.current.handleSort("patientName"));
    act(() => result.current.handleSort("patientName"));

    expect(result.current.sortConfig).toEqual({ key: "patientName", direction: "desc" });
    expect(result.current.sortedRows[0]?.patientName).toBe("Dupont");
  });

  it("resets sort on third click (same key)", () => {
    const rows = [makeRow({ rowId: "r-1" }), makeRow({ rowId: "r-2" })];
    const { result } = renderHook(() => useSortProcedureList(rows));

    act(() => result.current.handleSort("patientName"));
    act(() => result.current.handleSort("patientName"));
    act(() => result.current.handleSort("patientName"));

    expect(result.current.sortConfig).toEqual({ key: null, direction: null });
  });

  it("resets to asc when switching to a different key", () => {
    const rows = [makeRow({ rowId: "r-1" })];
    const { result } = renderHook(() => useSortProcedureList(rows));

    act(() => result.current.handleSort("patientName"));
    act(() => result.current.handleSort("patientName")); // now desc
    act(() => result.current.handleSort("procedureDate")); // different key → asc

    expect(result.current.sortConfig).toEqual({ key: "procedureDate", direction: "asc" });
  });

  it("sorts procedureAmount numerically (asc)", () => {
    const rows = [
      makeRow({ rowId: "r-1", procedureAmount: 300 }),
      makeRow({ rowId: "r-2", procedureAmount: 100 }),
      makeRow({ rowId: "r-3", procedureAmount: 200 }),
    ];
    const { result } = renderHook(() => useSortProcedureList(rows));

    act(() => result.current.handleSort("procedureAmount"));

    expect(result.current.sortedRows[0]?.rowId).toBe("r-2");
    expect(result.current.sortedRows[1]?.rowId).toBe("r-3");
    expect(result.current.sortedRows[2]?.rowId).toBe("r-1");
  });

  it("sorts procedureAmount numerically (desc)", () => {
    const rows = [
      makeRow({ rowId: "r-1", procedureAmount: 100 }),
      makeRow({ rowId: "r-2", procedureAmount: 300 }),
    ];
    const { result } = renderHook(() => useSortProcedureList(rows));

    act(() => result.current.handleSort("procedureAmount"));
    act(() => result.current.handleSort("procedureAmount"));

    expect(result.current.sortedRows[0]?.rowId).toBe("r-2");
  });

  it("puts null patientName last when sorting asc", () => {
    const rows = [
      makeRow({ rowId: "r-1", patientName: null }),
      makeRow({ rowId: "r-2", patientName: "Arnaud" }),
    ];
    const { result } = renderHook(() => useSortProcedureList(rows));

    act(() => result.current.handleSort("patientName"));

    expect(result.current.sortedRows[0]?.rowId).toBe("r-2");
    expect(result.current.sortedRows[1]?.rowId).toBe("r-1");
  });

  it("does not mutate the original array", () => {
    const rows = [
      makeRow({ rowId: "r-1", patientName: "Zola" }),
      makeRow({ rowId: "r-2", patientName: "Arnaud" }),
    ];
    const original = [...rows];
    const { result } = renderHook(() => useSortProcedureList(rows));

    act(() => result.current.handleSort("patientName"));

    expect(rows[0]?.rowId).toBe(original[0]?.rowId);
  });
});

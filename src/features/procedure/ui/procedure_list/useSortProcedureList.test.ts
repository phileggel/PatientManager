import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeProcedureRow } from "@/tests/procedure.factory";
import { useSortProcedureList } from "./useSortProcedureList";

const makeRow = makeProcedureRow;

describe("useSortProcedureList", () => {
  it("PRO-170: opens sorted by procedure date, oldest first", () => {
    const rows = [
      makeRow({ rowId: "r-1", procedureDate: "2026-03-10" }),
      makeRow({ rowId: "r-2", procedureDate: "2026-01-05" }),
      makeRow({ rowId: "r-3", procedureDate: "2026-02-20" }),
    ];
    const { result } = renderHook(() => useSortProcedureList(rows));
    expect(result.current.sortedRows.map((r) => r.rowId)).toEqual(["r-2", "r-3", "r-1"]);
    expect(result.current.sortConfig).toEqual({ key: "procedureDate", direction: "asc" });
  });

  it("PRO-170B: the date column goes from the default to descending, then back", () => {
    const rows = [
      makeRow({ rowId: "r-1", procedureDate: "2026-01-05" }),
      makeRow({ rowId: "r-2", procedureDate: "2026-03-10" }),
    ];
    const { result } = renderHook(() => useSortProcedureList(rows));

    act(() => result.current.handleSort("procedureDate"));
    expect(result.current.sortConfig).toEqual({ key: "procedureDate", direction: "desc" });
    expect(result.current.sortedRows[0]?.rowId).toBe("r-2");

    act(() => result.current.handleSort("procedureDate"));
    expect(result.current.sortConfig).toEqual({ key: "procedureDate", direction: "asc" });
    expect(result.current.sortedRows[0]?.rowId).toBe("r-1");
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

  it("PRO-170B: leaving another column's sort returns to the default", () => {
    const rows = [
      makeRow({ rowId: "r-1", procedureDate: "2026-03-10" }),
      makeRow({ rowId: "r-2", procedureDate: "2026-01-05" }),
    ];
    const { result } = renderHook(() => useSortProcedureList(rows));

    act(() => result.current.handleSort("patientName"));
    act(() => result.current.handleSort("patientName"));
    act(() => result.current.handleSort("patientName"));

    expect(result.current.sortConfig).toEqual({ key: "procedureDate", direction: "asc" });
    expect(result.current.sortedRows[0]?.rowId).toBe("r-2");
  });

  it("resets to asc when switching to a different key", () => {
    const rows = [makeRow({ rowId: "r-1" })];
    const { result } = renderHook(() => useSortProcedureList(rows));

    act(() => result.current.handleSort("patientName"));
    act(() => result.current.handleSort("patientName")); // now desc
    act(() => result.current.handleSort("procedureDate")); // different key → asc

    expect(result.current.sortConfig).toEqual({ key: "procedureDate", direction: "asc" });
  });

  it("sorts billedAmount numerically (asc)", () => {
    const rows = [
      makeRow({ rowId: "r-1", billedAmount: 300 }),
      makeRow({ rowId: "r-2", billedAmount: 100 }),
      makeRow({ rowId: "r-3", billedAmount: 200 }),
    ];
    const { result } = renderHook(() => useSortProcedureList(rows));

    act(() => result.current.handleSort("billedAmount"));

    expect(result.current.sortedRows[0]?.rowId).toBe("r-2");
    expect(result.current.sortedRows[1]?.rowId).toBe("r-3");
    expect(result.current.sortedRows[2]?.rowId).toBe("r-1");
  });

  it("sorts billedAmount numerically (desc)", () => {
    const rows = [
      makeRow({ rowId: "r-1", billedAmount: 100 }),
      makeRow({ rowId: "r-2", billedAmount: 300 }),
    ];
    const { result } = renderHook(() => useSortProcedureList(rows));

    act(() => result.current.handleSort("billedAmount"));
    act(() => result.current.handleSort("billedAmount"));

    expect(result.current.sortedRows[0]?.rowId).toBe("r-2");
  });

  it("PRO-170D: puts null patientName last when sorting asc", () => {
    const rows = [
      makeRow({ rowId: "r-1", patientName: null }),
      makeRow({ rowId: "r-2", patientName: "Arnaud" }),
    ];
    const { result } = renderHook(() => useSortProcedureList(rows));

    act(() => result.current.handleSort("patientName"));

    expect(result.current.sortedRows[0]?.rowId).toBe("r-2");
    expect(result.current.sortedRows[1]?.rowId).toBe("r-1");
  });

  it("PRO-170C: rows with an equal date keep the order they came in", () => {
    const rows = [
      makeRow({ rowId: "r-1", procedureDate: "2026-01-05" }),
      makeRow({ rowId: "r-2", procedureDate: "2026-01-05" }),
    ];
    const { result } = renderHook(() => useSortProcedureList(rows));
    expect(result.current.sortedRows.map((r) => r.rowId)).toEqual(["r-1", "r-2"]);
  });

  it("PRO-170E: a new list opens on the default again", () => {
    const rows = [makeRow({ rowId: "r-1" })];
    const first = renderHook(() => useSortProcedureList(rows));
    act(() => first.result.current.handleSort("status"));
    first.unmount();

    const { result } = renderHook(() => useSortProcedureList(rows));

    expect(result.current.sortConfig).toEqual({ key: "procedureDate", direction: "asc" });
  });

  it("PRO-170G: text ignores case and accents", () => {
    const rows = [
      makeRow({ rowId: "r-1", patientName: "Zoé" }),
      makeRow({ rowId: "r-2", patientName: "émile" }),
      makeRow({ rowId: "r-3", patientName: "Alice" }),
    ];
    const { result } = renderHook(() => useSortProcedureList(rows));
    act(() => result.current.handleSort("patientName"));
    expect(result.current.sortedRows.map((r) => r.rowId)).toEqual(["r-3", "r-2", "r-1"]);
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

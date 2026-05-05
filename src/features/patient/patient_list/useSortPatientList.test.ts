import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PatientRow } from "../shared/types";
import { useSortPatientList } from "./useSortPatientList";

function makeRow(overrides: Partial<PatientRow> = {}): PatientRow {
  return {
    rowId: "row-1",
    id: "p-1",
    name: "Dupont Jean",
    ssn: "123456789",
    latestFund: "CPAM",
    latestDate: "2025-01-15",
    isAnonymous: false,
    ...overrides,
  };
}

describe("useSortPatientList — sort by column", () => {
  const rows = [
    makeRow({
      rowId: "r-3",
      id: "p-3",
      name: "Zola Marc",
      ssn: "333",
      latestFund: "MSA",
      latestDate: "2025-03-01",
    }),
    makeRow({
      rowId: "r-1",
      id: "p-1",
      name: "Dupont Jean",
      ssn: "111",
      latestFund: "CPAM",
      latestDate: "2025-01-01",
    }),
    makeRow({
      rowId: "r-2",
      id: "p-2",
      name: "Martin Alice",
      ssn: "222",
      latestFund: "MGEN",
      latestDate: "2025-02-01",
    }),
  ];

  it("sorts by name asc", () => {
    const { result } = renderHook(() => useSortPatientList(rows, ""));

    act(() => result.current.handleSort("name"));

    expect(result.current.sortedAndFilteredPatients.map((r) => r.name)).toEqual([
      "Dupont Jean",
      "Martin Alice",
      "Zola Marc",
    ]);
  });

  it("sorts by name desc", () => {
    const { result } = renderHook(() => useSortPatientList(rows, ""));

    act(() => result.current.handleSort("name"));
    act(() => result.current.handleSort("name"));

    expect(result.current.sortedAndFilteredPatients.map((r) => r.name)).toEqual([
      "Zola Marc",
      "Martin Alice",
      "Dupont Jean",
    ]);
  });

  it("sorts by ssn asc", () => {
    const { result } = renderHook(() => useSortPatientList(rows, ""));

    act(() => result.current.handleSort("ssn"));

    expect(result.current.sortedAndFilteredPatients.map((r) => r.ssn)).toEqual([
      "111",
      "222",
      "333",
    ]);
  });

  it("sorts by latestFund asc", () => {
    const { result } = renderHook(() => useSortPatientList(rows, ""));

    act(() => result.current.handleSort("latestFund"));

    expect(result.current.sortedAndFilteredPatients.map((r) => r.latestFund)).toEqual([
      "CPAM",
      "MGEN",
      "MSA",
    ]);
  });

  it("sorts by latestDate asc", () => {
    const { result } = renderHook(() => useSortPatientList(rows, ""));

    act(() => result.current.handleSort("latestDate"));

    expect(result.current.sortedAndFilteredPatients.map((r) => r.latestDate)).toEqual([
      "2025-01-01",
      "2025-02-01",
      "2025-03-01",
    ]);
  });

  it("null name sorts last in asc order", () => {
    const rowsWithNull = [
      makeRow({ rowId: "r-2", id: "p-2", name: "Alpha", ssn: "222" }),
      makeRow({ rowId: "r-1", id: "p-1", name: null, ssn: "111" }),
    ];
    const { result } = renderHook(() => useSortPatientList(rowsWithNull, ""));

    act(() => result.current.handleSort("name"));

    expect(result.current.sortedAndFilteredPatients[0]?.name).toBe("Alpha");
    expect(result.current.sortedAndFilteredPatients[1]?.name).toBeNull();
  });

  it("equal name values preserve original input order", () => {
    const tied = [
      makeRow({ rowId: "r-1", id: "p-1", name: "Alpha" }),
      makeRow({ rowId: "r-2", id: "p-2", name: "Alpha" }),
    ];
    const { result } = renderHook(() => useSortPatientList(tied, ""));

    act(() => result.current.handleSort("name"));

    expect(result.current.sortedAndFilteredPatients.map((r) => r.id)).toEqual(["p-1", "p-2"]);
  });

  it("third click on same key resets sort to unsorted", () => {
    const rowsToReset = [
      makeRow({ rowId: "r-2", id: "p-2", name: "Zola" }),
      makeRow({ rowId: "r-1", id: "p-1", name: "Alpha" }),
    ];
    const { result } = renderHook(() => useSortPatientList(rowsToReset, ""));

    act(() => result.current.handleSort("name"));
    act(() => result.current.handleSort("name"));
    act(() => result.current.handleSort("name"));

    expect(result.current.sortConfig).toEqual({ key: null, direction: null });
    expect(result.current.sortedAndFilteredPatients.map((r) => r.id)).toEqual(["p-2", "p-1"]);
  });
});

describe("useSortPatientList — search filter", () => {
  const rows = [
    makeRow({ rowId: "r-1", id: "p-1", name: "Dupont Jean", ssn: "111456" }),
    makeRow({ rowId: "r-2", id: "p-2", name: "Martin Alice", ssn: "222789" }),
    makeRow({ rowId: "r-3", id: "p-3", name: null, ssn: "333999" }),
  ];

  it("filters by patient name (case-insensitive)", () => {
    const { result } = renderHook(() => useSortPatientList(rows, "dupont"));

    expect(result.current.sortedAndFilteredPatients).toHaveLength(1);
    expect(result.current.sortedAndFilteredPatients[0]?.id).toBe("p-1");
  });

  it("filters by ssn substring", () => {
    const { result } = renderHook(() => useSortPatientList(rows, "222"));

    expect(result.current.sortedAndFilteredPatients).toHaveLength(1);
    expect(result.current.sortedAndFilteredPatients[0]?.id).toBe("p-2");
  });

  it("null name does not crash — ssn still matched", () => {
    const { result } = renderHook(() => useSortPatientList(rows, "333"));

    expect(result.current.sortedAndFilteredPatients).toHaveLength(1);
    expect(result.current.sortedAndFilteredPatients[0]?.ssn).toBe("333999");
  });
});

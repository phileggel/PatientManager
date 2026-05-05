import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FundPaymentRow } from "../shared/types";
import { useSortFundPaymentList } from "./useSortFundPaymentList";

function makeRow(overrides: Partial<FundPaymentRow> = {}): FundPaymentRow {
  return {
    rowId: "row-1",
    id: "g-1",
    fundId: "fund-1",
    fundName: "CPAM",
    paymentDate: "2025-01-15",
    totalAmount: 100,
    procedureCount: 2,
    isLocked: false,
    ...overrides,
  };
}

describe("useSortFundPaymentList — handleSort cycle", () => {
  it("first click on a key sets asc", () => {
    const { result } = renderHook(() => useSortFundPaymentList([], ""));

    act(() => result.current.handleSort("fundName"));

    expect(result.current.sortConfig).toEqual({ key: "fundName", direction: "asc" });
  });

  it("second click on same key cycles to desc", () => {
    const { result } = renderHook(() => useSortFundPaymentList([], ""));

    act(() => result.current.handleSort("fundName"));
    act(() => result.current.handleSort("fundName"));

    expect(result.current.sortConfig).toEqual({ key: "fundName", direction: "desc" });
  });

  it("third click on same key resets to no sort and restores original order", () => {
    const rows = [
      makeRow({ id: "g-2", rowId: "r-2", fundName: "MGEN" }),
      makeRow({ id: "g-1", rowId: "r-1", fundName: "CPAM" }),
    ];
    const { result } = renderHook(() => useSortFundPaymentList(rows, ""));

    act(() => result.current.handleSort("fundName"));
    act(() => result.current.handleSort("fundName"));
    act(() => result.current.handleSort("fundName"));

    expect(result.current.sortConfig).toEqual({ key: null, direction: null });
    expect(result.current.sortedAndFilteredGroups.map((r) => r.id)).toEqual(["g-2", "g-1"]);
  });

  it("switching to a different key resets to asc on the new key", () => {
    const { result } = renderHook(() => useSortFundPaymentList([], ""));

    act(() => result.current.handleSort("fundName"));
    act(() => result.current.handleSort("fundName")); // now desc
    act(() => result.current.handleSort("totalAmount")); // new key → asc

    expect(result.current.sortConfig).toEqual({ key: "totalAmount", direction: "asc" });
  });
});

describe("useSortFundPaymentList — sort by column", () => {
  const rows = [
    makeRow({
      id: "g-3",
      rowId: "r-3",
      fundName: "MGEN",
      paymentDate: "2025-03-01",
      totalAmount: 300,
      procedureCount: 3,
    }),
    makeRow({
      id: "g-1",
      rowId: "r-1",
      fundName: "CPAM",
      paymentDate: "2025-01-01",
      totalAmount: 100,
      procedureCount: 1,
    }),
    makeRow({
      id: "g-2",
      rowId: "r-2",
      fundName: "MSA",
      paymentDate: "2025-02-01",
      totalAmount: 200,
      procedureCount: 2,
    }),
  ];

  it("sorts by fundName asc", () => {
    const { result } = renderHook(() => useSortFundPaymentList(rows, ""));

    act(() => result.current.handleSort("fundName"));

    const names = result.current.sortedAndFilteredGroups.map((r) => r.fundName);
    expect(names).toEqual(["CPAM", "MGEN", "MSA"]);
  });

  it("sorts by fundName desc", () => {
    const { result } = renderHook(() => useSortFundPaymentList(rows, ""));

    act(() => result.current.handleSort("fundName"));
    act(() => result.current.handleSort("fundName"));

    const names = result.current.sortedAndFilteredGroups.map((r) => r.fundName);
    expect(names).toEqual(["MSA", "MGEN", "CPAM"]);
  });

  it("sorts by paymentDate asc", () => {
    const { result } = renderHook(() => useSortFundPaymentList(rows, ""));

    act(() => result.current.handleSort("paymentDate"));

    const dates = result.current.sortedAndFilteredGroups.map((r) => r.paymentDate);
    expect(dates).toEqual(["2025-01-01", "2025-02-01", "2025-03-01"]);
  });

  it("sorts by totalAmount asc", () => {
    const { result } = renderHook(() => useSortFundPaymentList(rows, ""));

    act(() => result.current.handleSort("totalAmount"));

    const amounts = result.current.sortedAndFilteredGroups.map((r) => r.totalAmount);
    expect(amounts).toEqual([100, 200, 300]);
  });

  it("sorts by procedureCount asc", () => {
    const { result } = renderHook(() => useSortFundPaymentList(rows, ""));

    act(() => result.current.handleSort("procedureCount"));

    const counts = result.current.sortedAndFilteredGroups.map((r) => r.procedureCount);
    expect(counts).toEqual([1, 2, 3]);
  });

  it("equal totalAmount values preserve original input order", () => {
    const tied = [
      makeRow({ id: "g-1", rowId: "r-1", totalAmount: 100 }),
      makeRow({ id: "g-2", rowId: "r-2", totalAmount: 100 }),
    ];
    const { result } = renderHook(() => useSortFundPaymentList(tied, ""));

    act(() => result.current.handleSort("totalAmount"));

    expect(result.current.sortedAndFilteredGroups.map((r) => r.id)).toEqual(["g-1", "g-2"]);
  });
});

describe("useSortFundPaymentList — search filter", () => {
  const rows = [
    makeRow({ rowId: "r-1", fundName: "CPAM Loire", paymentDate: "2025-01-15" }),
    makeRow({ rowId: "r-2", fundName: "MGEN Santé", paymentDate: "2025-03-20" }),
  ];

  it("filters by fundName (case-insensitive)", () => {
    const { result } = renderHook(() => useSortFundPaymentList(rows, "cpam"));

    expect(result.current.sortedAndFilteredGroups).toHaveLength(1);
    expect(result.current.sortedAndFilteredGroups[0]?.fundName).toBe("CPAM Loire");
  });

  it("filters by paymentDate substring", () => {
    const { result } = renderHook(() => useSortFundPaymentList(rows, "03-20"));

    expect(result.current.sortedAndFilteredGroups).toHaveLength(1);
    expect(result.current.sortedAndFilteredGroups[0]?.fundName).toBe("MGEN Santé");
  });

  it("blank search term returns all rows unchanged", () => {
    const { result } = renderHook(() => useSortFundPaymentList(rows, "   "));

    expect(result.current.sortedAndFilteredGroups).toHaveLength(2);
  });
});

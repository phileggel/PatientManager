import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BankAccountRow } from "../shared/types";
import { useSortBankAccountList } from "./useSortBankAccountList";

function makeRow(overrides: Partial<BankAccountRow> = {}): BankAccountRow {
  return {
    rowId: "row-1",
    id: "acc-1",
    name: "Main Account",
    iban: "FR76123",
    ...overrides,
  };
}

describe("useSortBankAccountList — sort", () => {
  const rows = [
    makeRow({ rowId: "r-2", id: "acc-2", name: "Zeta Bank", iban: "FR00999" }),
    makeRow({ rowId: "r-1", id: "acc-1", name: "Alpha Bank", iban: "FR00111" }),
  ];

  it("sorts by name asc", () => {
    const { result } = renderHook(() => useSortBankAccountList(rows, ""));

    act(() => result.current.handleSort("name"));

    expect(result.current.sortedAndFilteredAccounts.map((r) => r.name)).toEqual([
      "Alpha Bank",
      "Zeta Bank",
    ]);
  });

  it("sorts by name desc", () => {
    const { result } = renderHook(() => useSortBankAccountList(rows, ""));

    act(() => result.current.handleSort("name"));
    act(() => result.current.handleSort("name"));

    expect(result.current.sortedAndFilteredAccounts.map((r) => r.name)).toEqual([
      "Zeta Bank",
      "Alpha Bank",
    ]);
  });

  it("third click on same key resets sort", () => {
    const { result } = renderHook(() => useSortBankAccountList(rows, ""));

    act(() => result.current.handleSort("name"));
    act(() => result.current.handleSort("name"));
    act(() => result.current.handleSort("name"));

    expect(result.current.sortConfig).toEqual({ key: null, direction: null });
  });

  it("sorts by iban asc (null iban normalizes to empty string and sorts first)", () => {
    const rowsWithNull = [
      makeRow({ rowId: "r-2", id: "acc-2", name: "Beta", iban: "FR00999" }),
      makeRow({ rowId: "r-1", id: "acc-1", name: "Alpha", iban: null }),
    ];
    const { result } = renderHook(() => useSortBankAccountList(rowsWithNull, ""));

    act(() => result.current.handleSort("iban"));

    // null iban → "" → sorts before "FR00999"
    expect(result.current.sortedAndFilteredAccounts.map((r) => r.iban)).toEqual([null, "FR00999"]);
  });

  it("equal iban values preserve original input order", () => {
    const tiedRows = [
      makeRow({ rowId: "r-1", id: "acc-1", name: "A", iban: "FR001" }),
      makeRow({ rowId: "r-2", id: "acc-2", name: "B", iban: "FR001" }),
    ];
    const { result } = renderHook(() => useSortBankAccountList(tiedRows, ""));

    act(() => result.current.handleSort("iban"));

    expect(result.current.sortedAndFilteredAccounts.map((r) => r.id)).toEqual(["acc-1", "acc-2"]);
  });
});

describe("useSortBankAccountList — search filter", () => {
  const rows = [
    makeRow({ rowId: "r-1", id: "acc-1", name: "Alpha Bank", iban: "FR00111" }),
    makeRow({ rowId: "r-2", id: "acc-2", name: "Beta Corp", iban: "DE00222" }),
    makeRow({ rowId: "r-3", id: "acc-3", name: "Gamma", iban: null }),
  ];

  it("filters by account name (case-insensitive)", () => {
    const { result } = renderHook(() => useSortBankAccountList(rows, "alpha"));

    expect(result.current.sortedAndFilteredAccounts).toHaveLength(1);
    expect(result.current.sortedAndFilteredAccounts[0]?.name).toBe("Alpha Bank");
  });

  it("filters by iban substring", () => {
    const { result } = renderHook(() => useSortBankAccountList(rows, "DE00"));

    expect(result.current.sortedAndFilteredAccounts).toHaveLength(1);
    expect(result.current.sortedAndFilteredAccounts[0]?.name).toBe("Beta Corp");
  });

  it("null iban does not match an iban search term", () => {
    const { result } = renderHook(() => useSortBankAccountList(rows, "gamma-iban"));

    // "Gamma" has null iban; iban search yields no match
    expect(result.current.sortedAndFilteredAccounts).toHaveLength(0);
  });

  it("blank search returns all rows", () => {
    const { result } = renderHook(() => useSortBankAccountList(rows, "  "));

    expect(result.current.sortedAndFilteredAccounts).toHaveLength(3);
  });
});

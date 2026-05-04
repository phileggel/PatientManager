import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FundRow } from "../shared/types";
import { useSortFundList } from "./useSortFundList";

const makeRow = (partial: Partial<FundRow>): FundRow => ({
  rowId: crypto.randomUUID(),
  fundIdentifier: null,
  fundName: null,
  ...partial,
});

const alpha = makeRow({ fundIdentifier: "CPAM-01", fundName: "Alpha Fund" });
const beta = makeRow({ fundIdentifier: "MGEN-02", fundName: "Beta Fund" });
const gamma = makeRow({ fundIdentifier: "APRIA-03", fundName: "Gamma Fund" });
const funds = [beta, gamma, alpha];

describe("useSortFundList", () => {
  describe("filtering", () => {
    it("returns all funds when search term is empty", () => {
      const { result } = renderHook(() => useSortFundList(funds, ""));
      expect(result.current.sortedAndFilteredFunds).toHaveLength(3);
    });

    it("filters by fundIdentifier case-insensitively", () => {
      const { result } = renderHook(() => useSortFundList(funds, "cpam"));
      expect(result.current.sortedAndFilteredFunds).toHaveLength(1);
      expect(result.current.sortedAndFilteredFunds[0]?.fundIdentifier).toBe("CPAM-01");
    });

    it("filters by fundName case-insensitively", () => {
      const { result } = renderHook(() => useSortFundList(funds, "gamma"));
      expect(result.current.sortedAndFilteredFunds).toHaveLength(1);
      expect(result.current.sortedAndFilteredFunds[0]?.fundName).toBe("Gamma Fund");
    });

    it("returns empty when no match", () => {
      const { result } = renderHook(() => useSortFundList(funds, "xyz"));
      expect(result.current.sortedAndFilteredFunds).toHaveLength(0);
    });
  });

  describe("sorting", () => {
    it("starts with no sort applied", () => {
      const { result } = renderHook(() => useSortFundList(funds, ""));
      expect(result.current.sortConfig).toEqual({ key: null, direction: null });
    });

    it("sorts by fundIdentifier asc on first click", () => {
      const { result } = renderHook(() => useSortFundList(funds, ""));

      act(() => result.current.handleSort("fundIdentifier"));

      const identifiers = result.current.sortedAndFilteredFunds.map((f) => f.fundIdentifier);
      expect(identifiers).toEqual(["APRIA-03", "CPAM-01", "MGEN-02"]);
    });

    it("sorts by fundIdentifier desc on second click", () => {
      const { result } = renderHook(() => useSortFundList(funds, ""));

      act(() => result.current.handleSort("fundIdentifier"));
      act(() => result.current.handleSort("fundIdentifier"));

      const identifiers = result.current.sortedAndFilteredFunds.map((f) => f.fundIdentifier);
      expect(identifiers).toEqual(["MGEN-02", "CPAM-01", "APRIA-03"]);
    });

    it("resets sort on third click (same key)", () => {
      const { result } = renderHook(() => useSortFundList(funds, ""));

      act(() => result.current.handleSort("fundIdentifier"));
      act(() => result.current.handleSort("fundIdentifier"));
      act(() => result.current.handleSort("fundIdentifier"));

      expect(result.current.sortConfig).toEqual({ key: null, direction: null });
    });

    it("sorts asc when switching to a different key", () => {
      const { result } = renderHook(() => useSortFundList(funds, ""));

      act(() => result.current.handleSort("fundIdentifier"));
      act(() => result.current.handleSort("fundName"));

      expect(result.current.sortConfig).toEqual({ key: "fundName", direction: "asc" });
    });

    it("puts null values last when sorting", () => {
      const withNull = [
        makeRow({ fundIdentifier: "Z-99", fundName: "Zebra" }),
        makeRow({ fundIdentifier: null, fundName: "Null Fund" }),
        makeRow({ fundIdentifier: "A-01", fundName: "Alpha" }),
      ];
      const { result } = renderHook(() => useSortFundList(withNull, ""));

      act(() => result.current.handleSort("fundIdentifier"));

      const last = result.current.sortedAndFilteredFunds.at(-1);
      expect(last?.fundIdentifier).toBeNull();
    });
  });
});

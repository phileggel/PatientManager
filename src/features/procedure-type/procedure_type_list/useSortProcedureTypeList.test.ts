import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProcedureTypeRow } from "../shared/types";
import { useSortProcedureTypeList } from "./useSortProcedureTypeList";

const makeRow = (partial: Partial<ProcedureTypeRow>): ProcedureTypeRow => ({
  rowId: crypto.randomUUID(),
  id: crypto.randomUUID(),
  name: "Default",
  defaultAmount: 0,
  category: null,
  ...partial,
});

const consultation = makeRow({ name: "Consultation", defaultAmount: 25, category: "General" });
const radio = makeRow({ name: "Radiologie", defaultAmount: 80, category: "Imaging" });
const bio = makeRow({ name: "Biologie", defaultAmount: 15, category: "Lab" });
const rows = [radio, consultation, bio];

describe("useSortProcedureTypeList", () => {
  describe("filtering", () => {
    it("returns all rows when search term is empty", () => {
      const { result } = renderHook(() => useSortProcedureTypeList(rows, ""));
      expect(result.current.sortedAndFilteredProcedureTypes).toHaveLength(3);
    });

    it("filters by name case-insensitively", () => {
      const { result } = renderHook(() => useSortProcedureTypeList(rows, "radio"));
      expect(result.current.sortedAndFilteredProcedureTypes).toHaveLength(1);
      expect(result.current.sortedAndFilteredProcedureTypes[0]?.name).toBe("Radiologie");
    });

    it("filters by category case-insensitively", () => {
      const { result } = renderHook(() => useSortProcedureTypeList(rows, "imaging"));
      expect(result.current.sortedAndFilteredProcedureTypes).toHaveLength(1);
      expect(result.current.sortedAndFilteredProcedureTypes[0]?.name).toBe("Radiologie");
    });

    it("returns empty when no match", () => {
      const { result } = renderHook(() => useSortProcedureTypeList(rows, "xyz"));
      expect(result.current.sortedAndFilteredProcedureTypes).toHaveLength(0);
    });

    it("handles null category in filter without error", () => {
      const withNullCategory = [makeRow({ name: "Test", category: null })];
      const { result } = renderHook(() => useSortProcedureTypeList(withNullCategory, "test"));
      expect(result.current.sortedAndFilteredProcedureTypes).toHaveLength(1);
    });
  });

  describe("sorting", () => {
    it("starts with no sort", () => {
      const { result } = renderHook(() => useSortProcedureTypeList(rows, ""));
      expect(result.current.sortConfig).toEqual({ key: null, direction: null });
    });

    it("sorts by name asc on first click", () => {
      const { result } = renderHook(() => useSortProcedureTypeList(rows, ""));

      act(() => result.current.handleSort("name"));

      const names = result.current.sortedAndFilteredProcedureTypes.map((r) => r.name);
      expect(names).toEqual(["Biologie", "Consultation", "Radiologie"]);
    });

    it("sorts by name desc on second click", () => {
      const { result } = renderHook(() => useSortProcedureTypeList(rows, ""));

      act(() => result.current.handleSort("name"));
      act(() => result.current.handleSort("name"));

      const names = result.current.sortedAndFilteredProcedureTypes.map((r) => r.name);
      expect(names).toEqual(["Radiologie", "Consultation", "Biologie"]);
    });

    it("resets sort on third click", () => {
      const { result } = renderHook(() => useSortProcedureTypeList(rows, ""));

      act(() => result.current.handleSort("name"));
      act(() => result.current.handleSort("name"));
      act(() => result.current.handleSort("name"));

      expect(result.current.sortConfig).toEqual({ key: null, direction: null });
    });

    it("sorts by defaultAmount asc", () => {
      const { result } = renderHook(() => useSortProcedureTypeList(rows, ""));

      act(() => result.current.handleSort("defaultAmount"));

      const amounts = result.current.sortedAndFilteredProcedureTypes.map((r) => r.defaultAmount);
      expect(amounts).toEqual([15, 25, 80]);
    });

    it("sorts by defaultAmount desc", () => {
      const { result } = renderHook(() => useSortProcedureTypeList(rows, ""));

      act(() => result.current.handleSort("defaultAmount"));
      act(() => result.current.handleSort("defaultAmount"));

      const amounts = result.current.sortedAndFilteredProcedureTypes.map((r) => r.defaultAmount);
      expect(amounts).toEqual([80, 25, 15]);
    });
  });
});

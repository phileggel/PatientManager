import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useComboboxField } from "./useComboboxField";

const ITEMS = [
  { id: "1", label: "Martin Claire" },
  { id: "2", label: "Durand Paul" },
];

describe("useComboboxField", () => {
  it("PRO-150: a search of two characters or more that finds nothing reports no result", () => {
    const { result } = renderHook(() => useComboboxField(ITEMS, "label", "id", ""));
    act(() => result.current.setQuery("zzz"));
    expect(result.current.filteredItems).toHaveLength(0);
    expect(result.current.isNoResult).toBe(true);
  });

  it("PRO-150: a search that finds an item does not report no result", () => {
    const { result } = renderHook(() => useComboboxField(ITEMS, "label", "id", ""));
    act(() => result.current.setQuery("Mart"));
    expect(result.current.isNoResult).toBe(false);
  });

  it("PRO-150: a search shorter than two characters does not report no result", () => {
    const { result } = renderHook(() => useComboboxField(ITEMS, "label", "id", ""));
    act(() => result.current.setQuery("z"));
    expect(result.current.isNoResult).toBe(false);
  });

  it("PRO-150: a search by SSN finds the patient whose label carries it", () => {
    const items = [{ id: "1", label: "MARTIN Claire (2 85 03 75 123 456)" }];
    const { result } = renderHook(() => useComboboxField(items, "label", "id", ""));
    act(() => result.current.setQuery("2 85 03"));
    expect(result.current.filteredItems).toHaveLength(1);
  });
});

import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useFuzzySearch } from "./useFuzzySearch";

interface Item {
  name: string;
}

const items: Item[] = [{ name: "Dupont Jean" }, { name: "Martin Alice" }, { name: "Bernard Paul" }];
const keys = ["name"];

describe("useFuzzySearch", () => {
  it("returns empty array when query is shorter than 2 characters", () => {
    const { result } = renderHook(() => useFuzzySearch("D", items, keys));

    expect(result.current).toEqual([]);
  });

  it("returns matching item when query is exactly 2 characters", () => {
    const { result } = renderHook(() => useFuzzySearch("Du", items, keys));

    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toMatchObject({ name: "Dupont Jean" });
  });

  it("returns the correct match for a longer query", () => {
    const { result } = renderHook(() => useFuzzySearch("Jean", items, keys));

    expect(result.current.some((r) => r.name === "Dupont Jean")).toBe(true);
  });

  it("returns empty array when no item matches", () => {
    const { result } = renderHook(() => useFuzzySearch("zzz", items, keys));

    expect(result.current).toHaveLength(0);
  });
});

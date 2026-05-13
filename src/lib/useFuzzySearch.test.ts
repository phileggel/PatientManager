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

  describe("priorityKey", () => {
    interface Patient {
      name: string;
      hasSsn: boolean;
    }
    const patients: Patient[] = [
      { name: "Dupont", hasSsn: false },
      { name: "Duponty", hasSsn: true },
      { name: "Dupuy", hasSsn: true },
      { name: "Duprat", hasSsn: false },
    ];

    it("promotes items with truthy priority field above falsy ones", () => {
      const { result } = renderHook(() => useFuzzySearch("dup", patients, ["name"], 0.3, "hasSsn"));

      // All four match "dup"; the two with hasSsn=true must land first.
      const ssnTrueIndices = result.current
        .map((p, i) => (p.hasSsn ? i : -1))
        .filter((i) => i >= 0);
      const ssnFalseIndices = result.current
        .map((p, i) => (!p.hasSsn ? i : -1))
        .filter((i) => i >= 0);

      expect(ssnTrueIndices.length).toBeGreaterThan(0);
      expect(ssnFalseIndices.length).toBeGreaterThan(0);
      expect(Math.max(...ssnTrueIndices)).toBeLessThan(Math.min(...ssnFalseIndices));
    });

    it("preserves Fuse match-score order within each priority bucket (stable sort)", () => {
      // Without priorityKey, Fuse ranks by match score — capture the baseline order.
      const { result: noPriority } = renderHook(() => useFuzzySearch("dup", patients, ["name"]));
      const baselineOrderInTrueBucket = noPriority.current
        .filter((p) => p.hasSsn)
        .map((p) => p.name);
      const baselineOrderInFalseBucket = noPriority.current
        .filter((p) => !p.hasSsn)
        .map((p) => p.name);

      const { result: prioritised } = renderHook(() =>
        useFuzzySearch("dup", patients, ["name"], 0.3, "hasSsn"),
      );
      const prioritisedTrueBucket = prioritised.current.filter((p) => p.hasSsn).map((p) => p.name);
      const prioritisedFalseBucket = prioritised.current
        .filter((p) => !p.hasSsn)
        .map((p) => p.name);

      expect(prioritisedTrueBucket).toEqual(baselineOrderInTrueBucket);
      expect(prioritisedFalseBucket).toEqual(baselineOrderInFalseBucket);
    });

    it("is a no-op when omitted (current callers are unaffected)", () => {
      const { result: withoutKey } = renderHook(() => useFuzzySearch("dup", patients, ["name"]));
      const { result: withUndefinedKey } = renderHook(() =>
        useFuzzySearch("dup", patients, ["name"], 0.3, undefined),
      );

      expect(withUndefinedKey.current.map((p) => p.name)).toEqual(
        withoutKey.current.map((p) => p.name),
      );
    });
  });
});

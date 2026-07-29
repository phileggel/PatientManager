import { describe, expect, it } from "vitest";
import type { Fund } from "@/bindings";
import { sortFundsByName } from "./fundOptions";

function fund(id: string, name: string): Fund {
  return { id, fund_identifier: id, name, temp_id: null };
}

describe("sortFundsByName", () => {
  it("orders funds alphabetically regardless of insertion order", () => {
    const funds = [fund("1", "Mutuelle Générale"), fund("2", "CPAM 93"), fund("3", "CPAM 75")];
    expect(sortFundsByName(funds).map((f) => f.name)).toEqual([
      "CPAM 75",
      "CPAM 93",
      "Mutuelle Générale",
    ]);
  });

  it("does not mutate the input array", () => {
    const funds = [fund("1", "B"), fund("2", "A")];
    sortFundsByName(funds);
    expect(funds.map((f) => f.name)).toEqual(["B", "A"]);
  });
});

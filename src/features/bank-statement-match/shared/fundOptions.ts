import type { Fund } from "@/bindings";

/** Locale-aware alphabetical ordering for fund selection dropdowns. */
export function sortFundsByName(funds: Fund[]): Fund[] {
  return funds.toSorted((a, b) => a.name.localeCompare(b.name));
}

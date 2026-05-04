import type { Fund } from "@/bindings";

export function makeFund(overrides?: Partial<Fund>): Fund {
  return {
    id: "fund-1",
    fund_identifier: "440",
    name: "CPAM Loire-Atlantique",
    ...overrides,
  };
}

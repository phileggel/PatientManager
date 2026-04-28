/// <reference types="vitest/globals" />

import { describe, expect, it } from "vitest";
import { isBlockingStatus } from "./procedure-row.types";

describe("isBlockingStatus", () => {
  it.each([
    "RECONCILED",
    "PARTIALLY_RECONCILED",
    "FUND_PAID",
    "PARTIALLY_FUND_PAID",
    "DIRECTLY_PAID",
  ])("returns true for blocking status %s", (status) => {
    expect(isBlockingStatus(status)).toBe(true);
  });

  it.each([
    "CREATED",
    "NONE",
    "IMPORT_DIRECTLY_PAID",
    "IMPORT_FUND_PAID",
  ])("returns false for non-blocking status %s", (status) => {
    expect(isBlockingStatus(status)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isBlockingStatus(null)).toBe(false);
  });
});

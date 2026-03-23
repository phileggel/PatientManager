/// <reference types="vitest/globals" />

import { describe, expect, it } from "vitest";
import { isBlockingStatus } from "./procedure-row.types";

describe("isBlockingStatus", () => {
  it.each([
    "RECONCILIATED",
    "PARTIALLY_RECONCILED",
    "FUND_PAYED",
    "PARTIALLY_FUND_PAYED",
    "DIRECTLY_PAYED",
  ])("returns true for blocking status %s", (status) => {
    expect(isBlockingStatus(status)).toBe(true);
  });

  it.each([
    "CREATED",
    "NONE",
    "IMPORT_DIRECTLY_PAYED",
    "IMPORT_FUND_PAYED",
  ])("returns false for non-blocking status %s", (status) => {
    expect(isBlockingStatus(status)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isBlockingStatus(null)).toBe(false);
  });
});

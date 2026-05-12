import { describe, expect, it } from "vitest";

import { formatShortDate } from "./formatters";

describe("formatShortDate", () => {
  it("renders fr-FR as dd/mm/yyyy", () => {
    expect(formatShortDate("2026-01-15", "fr-FR")).toBe("15/01/2026");
  });

  it("renders en-GB as dd/mm/yyyy", () => {
    expect(formatShortDate("2026-01-15", "en-GB")).toBe("15/01/2026");
  });

  it("renders en-US as mm/dd/yyyy", () => {
    expect(formatShortDate("2026-01-15", "en-US")).toBe("01/15/2026");
  });

  it("uses local-calendar parsing, never UTC-shifted", () => {
    // `new Date("2026-01-01")` parses as UTC midnight; in negative-offset
    // timezones the calendar day flips to 2025-12-31. The helper must use
    // `new Date(y, m - 1, d)` so January 1 stays January 1 everywhere.
    expect(formatShortDate("2026-01-01", "fr-FR")).toBe("01/01/2026");
  });

  it("falls back to the raw input when the ISO string is malformed", () => {
    expect(formatShortDate("not-a-date", "fr-FR")).toBe("not-a-date");
    expect(formatShortDate("2026/01/15", "fr-FR")).toBe("2026/01/15");
    expect(formatShortDate("", "fr-FR")).toBe("");
  });

  it("falls back to the raw input when any ISO component is zero or NaN", () => {
    expect(formatShortDate("2026-00-15", "fr-FR")).toBe("2026-00-15");
    expect(formatShortDate("0000-01-15", "fr-FR")).toBe("0000-01-15");
    expect(formatShortDate("2026-xx-15", "fr-FR")).toBe("2026-xx-15");
  });

  it("falls back to the raw input when the locale tag is invalid", () => {
    // `Intl.DateTimeFormat` throws on a malformed tag; the helper catches
    // and returns the raw input rather than propagating.
    expect(formatShortDate("2026-01-15", "not a locale")).toBe("2026-01-15");
  });
});

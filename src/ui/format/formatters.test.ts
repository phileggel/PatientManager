import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import i18n from "@/i18n/config";
import { formatCurrency, formatShortDate, useFormatters } from "./formatters";

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

describe("formatCurrency", () => {
  // Intl.NumberFormat inserts a narrow-no-break space (U+202F, sometimes
  // U+00A0 on older ICU) between the number and `€` in fr-FR. Tests use a
  // permissive `\s` to stay robust across Node/ICU versions.

  it("renders fr-FR with number-space-symbol order", () => {
    expect(formatCurrency(100000, "fr-FR")).toMatch(/^100,00\s€$/);
  });

  it("renders en-GB with symbol-prefix and dot decimal", () => {
    expect(formatCurrency(100000, "en-GB")).toBe("€100.00");
  });

  it("renders en-US with symbol-prefix and dot decimal", () => {
    expect(formatCurrency(100000, "en-US")).toBe("€100.00");
  });

  it("always renders exactly two fraction digits", () => {
    // 100 thousandths = 0.10 euros — the helper must pad to two decimals
    // so column alignment in tables stays stable regardless of value.
    expect(formatCurrency(100, "en-GB")).toBe("€0.10");
    expect(formatCurrency(1000, "en-GB")).toBe("€1.00");
  });

  it("formats zero", () => {
    expect(formatCurrency(0, "en-GB")).toBe("€0.00");
    expect(formatCurrency(0, "fr-FR")).toMatch(/^0,00\s€$/);
  });

  it("formats negative amounts", () => {
    expect(formatCurrency(-12500, "en-GB")).toBe("-€12.50");
    expect(formatCurrency(-12500, "fr-FR")).toMatch(/^-12,50\s€$/);
  });

  it("formats very large amounts with locale-aware grouping", () => {
    // 1,234,567 euros in thousandths
    expect(formatCurrency(1_234_567_000, "en-GB")).toBe("€1,234,567.00");
    expect(formatCurrency(1_234_567_000, "fr-FR")).toMatch(/^1\s234\s567,00\s€$/);
  });
});

describe("useFormatters", () => {
  // Test setup pins i18n.language to "en"; restore it after every case so
  // language changes don't leak between tests.
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("returns en-GB-bound formatters when i18n.language is 'en'", () => {
    const { result } = renderHook(() => useFormatters());

    expect(result.current.locale).toBe("en-GB");
    expect(result.current.formatCurrency(100000)).toBe("€100.00");
    expect(result.current.formatDate("2026-01-15")).toBe("15/01/2026");
    expect(result.current.formatNumber(1234)).toBe("1,234");
  });

  it("returns fr-FR-bound formatters when i18n.language is 'fr'", async () => {
    await i18n.changeLanguage("fr");

    const { result } = renderHook(() => useFormatters());

    expect(result.current.locale).toBe("fr-FR");
    expect(result.current.formatCurrency(100000)).toMatch(/^100,00\s€$/);
    expect(result.current.formatDate("2026-01-15")).toBe("15/01/2026");
    expect(result.current.formatNumber(1234)).toMatch(/^1\s234$/);
  });

  it("falls back to fr-FR when i18n.language is unmapped (e.g. 'de')", async () => {
    // Exercises the `?? "fr-FR"` branch of `getIntlLocale`. fr-FR is the
    // documented default — projects ship in French first, English second.
    await i18n.changeLanguage("de");

    const { result } = renderHook(() => useFormatters());

    expect(result.current.locale).toBe("fr-FR");
  });

  it("returns an empty string from formatDate when the ISO is empty", () => {
    const { result } = renderHook(() => useFormatters());

    // The empty-string guard short-circuits before formatShortDate. The pure
    // function would echo the empty input, but the hook returns "" verbatim.
    expect(result.current.formatDate("")).toBe("");
  });
});

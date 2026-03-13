/// <reference types="vitest/globals" />

import { formatDateDisplay, formatDayToIso, getDayFromIso } from "./date.logic";

// ============================================================================
// getDayFromIso Tests
// ============================================================================

describe("getDayFromIso", () => {
  test("extracts day from valid ISO date", () => {
    expect(getDayFromIso("2026-01-15")).toBe(15);
    expect(getDayFromIso("2026-12-31")).toBe(31);
    expect(getDayFromIso("2026-06-01")).toBe(1);
  });

  test("handles day with leading zero", () => {
    expect(getDayFromIso("2026-01-05")).toBe(5);
    expect(getDayFromIso("2026-03-09")).toBe(9);
  });

  test("returns 0 for null input", () => {
    expect(getDayFromIso(null)).toBe(0);
  });

  test("returns 0 for undefined input", () => {
    expect(getDayFromIso(undefined)).toBe(0);
  });

  test("returns 0 for empty string", () => {
    expect(getDayFromIso("")).toBe(0);
  });

  test("returns 0 for malformed date (not 3 parts)", () => {
    expect(getDayFromIso("2026-01")).toBe(0);
    expect(getDayFromIso("2026")).toBe(0);
    expect(getDayFromIso("invalid-date-format")).toBe(0);
  });

  test("returns 0 for non-numeric day part", () => {
    expect(getDayFromIso("2026-01-XX")).toBe(0);
    expect(getDayFromIso("2026-01-abc")).toBe(0);
  });

  test("handles ISO datetime (extracts day despite time suffix)", () => {
    // Edge case: if someone passes ISO with time
    // splits by "-", gets ["2026", "01", "15T10:30:00"]
    // parseInt("15T10:30:00") stops at first non-digit and returns 15
    expect(getDayFromIso("2026-01-15T10:30:00")).toBe(15);
  });
});

// ============================================================================
// formatDayToIso Tests
// ============================================================================

describe("formatDayToIso", () => {
  test("formats single-digit day with leading zero", () => {
    expect(formatDayToIso(1, "2026-01-")).toBe("2026-01-01");
    expect(formatDayToIso(5, "2026-06-")).toBe("2026-06-05");
    expect(formatDayToIso(9, "2026-12-")).toBe("2026-12-09");
  });

  test("formats double-digit day without modification", () => {
    expect(formatDayToIso(10, "2026-01-")).toBe("2026-01-10");
    expect(formatDayToIso(25, "2026-03-")).toBe("2026-03-25");
    expect(formatDayToIso(31, "2026-12-")).toBe("2026-12-31");
  });

  test("handles day 0 (edge case)", () => {
    expect(formatDayToIso(0, "2026-01-")).toBe("2026-01-00");
  });

  test("handles negative day (edge case)", () => {
    // Note: This is technically invalid but tests actual behavior
    expect(formatDayToIso(-5, "2026-01-")).toBe("2026-01--5");
  });

  test("handles day > 31 (no validation, just formatting)", () => {
    expect(formatDayToIso(99, "2026-01-")).toBe("2026-01-99");
  });

  test("works with different month prefixes", () => {
    expect(formatDayToIso(15, "2025-02-")).toBe("2025-02-15");
    expect(formatDayToIso(15, "2027-11-")).toBe("2027-11-15");
  });
});

// ============================================================================
// formatDateDisplay Tests
// ============================================================================

describe("formatDateDisplay", () => {
  test("formats valid ISO date to DD/MM/YYYY", () => {
    expect(formatDateDisplay("2026-01-15")).toBe("15/01/2026");
    expect(formatDateDisplay("2026-12-31")).toBe("31/12/2026");
    expect(formatDateDisplay("2025-06-05")).toBe("05/06/2025");
  });

  test("returns em dash for null input", () => {
    expect(formatDateDisplay(null)).toBe("—");
  });

  test("returns em dash for undefined input", () => {
    expect(formatDateDisplay(undefined)).toBe("—");
  });

  test("returns em dash for empty string", () => {
    expect(formatDateDisplay("")).toBe("—");
  });

  test("handles malformed date (splits by dash, may produce unexpected output)", () => {
    // Note: No validation, just splits by "-"
    // This tests actual behavior, not necessarily desired behavior
    expect(formatDateDisplay("2026-01")).toBe("undefined/01/2026");
    expect(formatDateDisplay("invalid")).toBe("undefined/undefined/invalid");
  });

  test("handles dates with single-digit components", () => {
    // If input doesn't have leading zeros (technically invalid ISO but tests robustness)
    expect(formatDateDisplay("2026-1-5")).toBe("5/1/2026");
  });
});

// ============================================================================
// Integration Tests - Round-trip conversions
// ============================================================================

describe("date.logic - Integration", () => {
  test("round-trip: ISO to day and back", () => {
    const originalIso = "2026-01-15";
    const day = getDayFromIso(originalIso);
    const reconstructed = formatDayToIso(day, "2026-01-");

    expect(reconstructed).toBe(originalIso);
  });

  test("round-trip works for all days in a month", () => {
    const isoPrefix = "2026-06-";

    for (let day = 1; day <= 30; day++) {
      const iso = formatDayToIso(day, isoPrefix);
      const extracted = getDayFromIso(iso);
      expect(extracted).toBe(day);
    }
  });

  test("formatDateDisplay handles output from formatDayToIso", () => {
    const isoDate = formatDayToIso(15, "2026-03-");
    const display = formatDateDisplay(isoDate);

    expect(display).toBe("15/03/2026");
  });
});

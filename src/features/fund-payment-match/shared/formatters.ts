// ────────────────────────────────────────────────────────────────────────────
// Locale-aware formatters for the post-reconciliation report (FPR, ADR-006).
// The frontend resolves all currency / date strings before sending the
// `ReportGenerationRequest` to the backend.
// ────────────────────────────────────────────────────────────────────────────

export { formatCurrency, formatShortDate } from "@/lib/formatters";

/**
 * Format a `Date` as a locale-aware long-form date-time, e.g.
 * `7 mai 2025 à 16:42` (fr) / `May 7, 2025 at 4:42 PM` (en).
 * Falls back to the ISO string on failure.
 */
export function formatLongDateTime(date: Date, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "long",
      timeStyle: "short",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

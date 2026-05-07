// ────────────────────────────────────────────────────────────────────────────
// Locale-aware formatters for the post-reconciliation report (FPR, ADR-006).
// The frontend resolves all currency / date strings before sending the
// `ReportGenerationRequest` to the backend.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Format an amount in thousandths-of-a-euro as a locale-aware currency
 * string, e.g. `85,00 €` (fr) / `€85.00` (en).
 */
export function formatCurrency(thousandths: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(thousandths / 1000);
}

/**
 * Format an ISO `YYYY-MM-DD` date as a locale-aware short date.
 * Falls back to the raw ISO string if parsing fails.
 */
export function formatShortDate(iso: string, locale: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts.map(Number);
  if (!y || !m || !d) return iso;
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(y, m - 1, d));
  } catch {
    return iso;
  }
}

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

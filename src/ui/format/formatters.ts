import { useTranslation } from "react-i18next";

const LOCALE_MAP: Record<string, string> = {
  fr: "fr-FR",
  en: "en-GB",
};

function getIntlLocale(lang: string): string {
  return LOCALE_MAP[lang] ?? "fr-FR";
}

/**
 * Format an ISO `YYYY-MM-DD` date as a locale-aware short date.
 * Falls back to the raw ISO string if parsing fails.
 *
 * Parses with `new Date(y, m - 1, d)` (local-calendar) rather than
 * `new Date(iso)` (UTC) so callers always see the calendar date the user
 * typed, never a day-before/after shift from timezone math.
 *
 * `locale` is a BCP47 tag (`fr-FR`, `en-GB`, …). Component callers
 * generally use `useFormatters().formatDate(iso)` instead.
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
 * Format an amount stored in thousandths-of-a-euro as a locale-aware
 * currency string, e.g. `100,00 €` (fr) / `€100.00` (en). Always renders
 * exactly two fraction digits so the output is stable for table alignment.
 *
 * `locale` is a BCP47 tag. Component callers generally use
 * `useFormatters().formatCurrency(thousandths)` instead.
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
 * Hook providing locale-aware formatters for currency, dates and numbers.
 * Re-renders automatically when the i18n language changes.
 */
export function useFormatters() {
  const { i18n } = useTranslation();
  const intlLocale = getIntlLocale(i18n.language);

  return {
    formatCurrency: (thousandths: number) => formatCurrency(thousandths, intlLocale),
    formatDate: (isoDate: string) => (isoDate ? formatShortDate(isoDate, intlLocale) : ""),
    formatNumber: (n: number) => new Intl.NumberFormat(intlLocale).format(n),
    locale: intlLocale,
  };
}

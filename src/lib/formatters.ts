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
 * Hook providing locale-aware formatters for currency, dates and numbers.
 * Re-renders automatically when the i18n language changes.
 */
export function useFormatters() {
  const { i18n } = useTranslation();
  const intlLocale = getIntlLocale(i18n.language);

  const formatCurrency = (amount: number): string =>
    new Intl.NumberFormat(intlLocale, {
      style: "currency",
      currency: "EUR",
    }).format(amount / 1000);

  const formatDate = (isoDate: string): string =>
    isoDate ? formatShortDate(isoDate, intlLocale) : "";

  const formatNumber = (n: number): string => new Intl.NumberFormat(intlLocale).format(n);

  return { formatCurrency, formatDate, formatNumber, locale: intlLocale };
}

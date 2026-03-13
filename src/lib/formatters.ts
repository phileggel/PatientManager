import { useTranslation } from "react-i18next";

const LOCALE_MAP: Record<string, string> = {
  fr: "fr-FR",
  en: "en-GB",
};

function getIntlLocale(lang: string): string {
  return LOCALE_MAP[lang] ?? "fr-FR";
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

  const formatDate = (isoDate: string): string => {
    if (!isoDate) return "";
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return isoDate;
    return new Intl.DateTimeFormat(intlLocale).format(date);
  };

  const formatNumber = (n: number): string => new Intl.NumberFormat(intlLocale).format(n);

  return { formatCurrency, formatDate, formatNumber };
}

/**
 * Standalone currency formatter (no hook, uses fr-FR by default).
 * Use this in non-component contexts or where the locale is always French.
 */
export function formatCurrencyFR(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(amount / 1000);
}

/**
 * ReadingWarningsNotice — what of the fund's PDF statement could not be read
 * (FPA-020, FPA-030): the groups whose total does not match their lines, and the
 * unparsed lines with their samples. It informs; it never blocks the validation.
 */
import { useTranslation } from "react-i18next";
import { useFormatters } from "@/ui/format/formatters";
import type { ReadingWarnings } from "../shared/readingWarningsPresenter";

interface ReadingWarningsNoticeProps {
  warnings: ReadingWarnings | null;
}

export function ReadingWarningsNotice({ warnings }: ReadingWarningsNoticeProps) {
  const { t } = useTranslation("fund-payment-match");
  const { formatCurrency, formatDate } = useFormatters();

  if (!warnings) return null;

  return (
    <div
      id="reconciliation-modal-reading-warnings"
      role="alert"
      className="mb-4 block rounded-lg bg-m3-error-container/40 px-5 py-4 text-sm text-m3-on-error-container"
    >
      <p className="font-medium">{t("modal.reading_warnings.title")}</p>
      {warnings.mismatched.length > 0 && (
        <>
          <p className="mt-2 font-medium">
            {t("modal.reading_warnings.mismatched", { count: warnings.mismatched.length })}
          </p>
          <ul className="mt-1 space-y-1">
            {warnings.mismatched.map((group) => (
              <li key={`${group.fundLabel}-${group.paymentDate}`} className="tabular-nums">
                {t("modal.reading_warnings.mismatched_row", {
                  fund: group.fundLabel,
                  date: formatDate(group.paymentDate),
                  stated: formatCurrency(group.statedTotal),
                  sum: formatCurrency(group.linesSum),
                })}
              </li>
            ))}
          </ul>
        </>
      )}
      {warnings.unparsedCount > 0 && (
        <>
          <p className="mt-3 font-medium">
            {t("modal.reading_warnings.unparsed", { count: warnings.unparsedCount })}
          </p>
          <ul className="mt-1 space-y-1 font-mono text-xs">
            {warnings.samples.map((sample, index) => (
              // The samples may repeat: their place is their identity.
              // biome-ignore lint/suspicious/noArrayIndexKey: samples have no id of their own
              <li key={index}>{sample}</li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-3">{t("modal.reading_warnings.note")}</p>
    </div>
  );
}

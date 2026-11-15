import { useTranslation } from "react-i18next";
import type { BankStatementRecap } from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";
import { Button } from "@/ui/components/button";
import { Tag } from "@/ui/components/tag/Tag";
import { useFormatters } from "@/ui/format/formatters";

interface RecapStepProps {
  recap: BankStatementRecap;
  isBusy: boolean;
  errorText: string | null;
  onCancel: () => void;
  onBack: () => void;
  onValidate: () => void;
}

/**
 * #692, step 4 — what validate takes into account: the statement's month (or
 * the period covered), the lines taken into account and their full amount,
 * bold on green; then the lines partly paid, their reliquat in orange. Nothing
 * is written before « Valider le rapprochement ».
 */
export function RecapStep({
  recap,
  isBusy,
  errorText,
  onCancel,
  onBack,
  onValidate,
}: RecapStepProps) {
  const { t } = useTranslation("bank");
  const { formatCurrency, formatDate, formatMonth } = useFormatters();
  const funds = useCacheStore((s) => s.funds);

  const month = recap.period_month ? formatMonth(recap.period_month) : null;
  const period =
    recap.period_start && recap.period_end
      ? `${formatDate(recap.period_start)} – ${formatDate(recap.period_end)}`
      : null;
  const figure = "leading-10 font-bold tabular-nums";
  const big = `${figure} text-[2rem]`;

  return (
    <div className="flex flex-col flex-1 gap-6 min-h-0">
      <div
        id="recap-figures"
        className="grid grid-cols-[1.5fr_1fr_1fr] items-end rounded-2xl bg-[var(--color-snackbar-success-bg)] px-6 py-5 text-[var(--color-snackbar-success-text)]"
      >
        <div>
          <p className="text-sm">{month ? t("recap.month") : t("recap.period")}</p>
          <p
            id="recap-period"
            className={`${figure} whitespace-nowrap ${month ? "text-[2rem]" : "text-2xl"}`}
          >
            {month ?? period ?? "—"}
          </p>
        </div>
        <div className="text-center">
          <p className="text-sm">{t("recap.lines_taken")}</p>
          <p id="recap-lines-taken" className={big}>
            {recap.lines_taken_count}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm">{t("recap.total")}</p>
          <p id="recap-total" className={big}>
            {formatCurrency(recap.total_amount)}
          </p>
        </div>
      </div>

      <div className="flex flex-col flex-1 gap-2 min-h-0">
        <p className="text-sm font-semibold text-m3-on-surface">{t("recap.anomalies_title")}</p>
        <div
          id="recap-anomalies"
          className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-m3-outline/15"
        >
          {recap.partly_paid_lines.length === 0 ? (
            <p
              id="recap-anomalies-empty"
              className="py-8 text-center text-sm text-m3-on-surface-variant"
            >
              {t("recap.no_anomaly")}
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-xs text-m3-on-surface-variant">
                  {(["date", "label", "amount", "covered", "remainder"] as const).map(
                    (column, index) => (
                      <th
                        key={column}
                        className={`sticky top-0 bg-m3-surface-container-lowest px-3 py-2 font-medium ${index >= 2 ? "text-right" : "text-left"}`}
                      >
                        {t(`recap.col.${column}`)}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {recap.partly_paid_lines.map((line) => (
                  <tr
                    key={line.line_id}
                    id={`recap-anomaly-${line.line_id}`}
                    className="border-b border-m3-outline/15"
                  >
                    <td className="px-3 py-3 tabular-nums text-m3-on-surface-variant">
                      {formatDate(line.credit_line.date)}
                    </td>
                    <td className="px-3 py-3 text-m3-on-surface">
                      {line.credit_line.label}{" "}
                      <span className="text-m3-on-surface-variant">
                        ({funds.find((f) => f.id === line.fund_id)?.name ?? line.fund_id})
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-m3-on-surface">
                      {formatCurrency(line.credit_line.amount)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-m3-on-surface">
                      {formatCurrency(line.covered_amount)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Tag tone="action">{formatCurrency(line.remainder_amount)}</Tag>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="text-xs text-m3-on-surface-variant">{t("recap.note")}</p>
      </div>

      {errorText && (
        <p id="recap-error" role="alert" className="text-sm text-m3-error">
          {errorText}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-m3-outline/20 pt-4">
        <Button id="recap-cancel" variant="outline" onClick={onCancel}>
          {t("label_association.cancel_all")}
        </Button>
        <div className="flex items-center gap-3">
          <Button id="recap-back" variant="ghost" disabled={isBusy} onClick={onBack}>
            {t("recap.back")}
          </Button>
          <Button
            id="reconciliation-validate"
            variant="primary"
            onClick={onValidate}
            disabled={isBusy}
            loading={isBusy}
          >
            {t("statement.modal.validate")}
          </Button>
        </div>
      </div>
    </div>
  );
}

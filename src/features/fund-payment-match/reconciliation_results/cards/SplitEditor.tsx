/**
 * SplitEditor — the rows of a split of a not-found PDF line, inside its card
 * (FPA-252, FPA-252A, FPA-253): a date and an amount per procedure, the total for display, and
 * the backend's refusals under the total and each row (FPA-254A).
 *
 * Sources: useSplitEditor (rows, answer of `check_split_into_procedures`).
 */

import { Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { NormalizedPdfLine, SplitPart } from "@/bindings";
import { Button, IconButton } from "@/ui/components/button";
import { AmountField, DateField } from "@/ui/components/field";
import { useFormatters } from "@/ui/format/formatters";
import { useSplitEditor } from "./useSplitEditor";

interface SplitEditorProps {
  line: NormalizedPdfLine;
  onAccept: (parts: SplitPart[]) => void;
  onCancel: () => void;
}

export function SplitEditor({ line, onAccept, onCancel }: SplitEditorProps) {
  const { t } = useTranslation("fund-payment-match");
  const { formatCurrency, formatDate } = useFormatters();
  const { rows, total, errors, checking, setDate, setAmount, addRow, removeRow, validate } =
    useSplitEditor(line, onAccept);
  const idPrefix = `fund-payment-match-split-${line.line_index}`;

  return (
    <div id={idPrefix} className="space-y-2 pt-1">
      <p className="text-xs text-m3-on-surface-variant px-1">
        {t("split.hint", {
          start: formatDate(line.procedure_start_date),
          end: formatDate(line.procedure_end_date),
        })}
      </p>
      {rows.map((row, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity but their position
          key={index}
          id={`${idPrefix}-row-${index}`}
          className="flex items-start gap-3 bg-m3-surface-container-low rounded-lg px-3 py-2.5"
        >
          <div className="flex-1">
            <DateField
              id={`${idPrefix}-date-${index}`}
              label=""
              value={row.date}
              aria-label={t("split.date_aria", { n: index + 1 })}
              disabled={checking}
              onChange={(e) => setDate(index, e.target.value)}
              error={errors.parts[index]?.date && t(errors.parts[index].date)}
            />
          </div>
          <div className="w-36 shrink-0">
            <AmountField
              id={`${idPrefix}-amount-${index}`}
              label=""
              value={row.amount}
              ariaLabel={t("split.amount_aria", { n: index + 1 })}
              disabled={checking}
              onChange={(value) => setAmount(index, value)}
              error={errors.parts[index]?.amount && t(errors.parts[index].amount)}
            />
          </div>
          <IconButton
            id={`${idPrefix}-remove-${index}`}
            variant="ghost"
            shape="round"
            size="sm"
            aria-label={t("split.remove_aria", { n: index + 1 })}
            disabled={checking}
            icon={<X size={16} />}
            onClick={() => removeRow(index)}
          />
        </div>
      ))}
      <Button
        id={`${idPrefix}-add`}
        variant="ghost"
        disabled={checking}
        size="sm"
        icon={<Plus size={13} />}
        onClick={addRow}
      >
        {t("split.add")}
      </Button>
      <div className="px-1 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-m3-on-surface-variant">
            {t("split.total")} ·{" "}
            <span className="text-xs">
              {t("split.expected", { amount: formatCurrency(line.amount) })}
            </span>
          </span>
          <span className="font-semibold text-m3-on-surface">{formatCurrency(total)}</span>
        </div>
        {errors.split && (
          <p role="alert" className="text-xs text-m3-error mt-1 text-right">
            {t(errors.split)}
          </p>
        )}
      </div>
      <div className="flex gap-3">
        <Button
          id={`${idPrefix}-cancel`}
          variant="secondary"
          className="flex-1"
          disabled={checking}
          onClick={onCancel}
        >
          {t("split.cancel")}
        </Button>
        <Button
          id={`${idPrefix}-validate`}
          variant="primary"
          className="flex-1"
          loading={checking}
          disabled={checking}
          onClick={validate}
        >
          {t("split.validate")}
        </Button>
      </div>
    </div>
  );
}

/**
 * LeftOutGroupsNotice — names the groups of the statement the import leaves out
 * because their total is not positive (FPA-070): the fund takes money back.
 * Presentational: the list comes from the backend, nothing is decided here.
 */
import { useTranslation } from "react-i18next";
import type { LeftOutPdfGroup } from "@/bindings";
import { useFormatters } from "@/ui/format/formatters";

interface LeftOutGroupsNoticeProps {
  groups: LeftOutPdfGroup[];
}

export function LeftOutGroupsNotice({ groups }: LeftOutGroupsNoticeProps) {
  const { t } = useTranslation("fund-payment-match");
  const { formatCurrency, formatDate } = useFormatters();

  if (groups.length === 0) return null;

  return (
    <output
      id="reconciliation-modal-left-out-groups"
      className="mb-4 block rounded-lg bg-m3-surface-container-high px-5 py-4 text-sm text-m3-on-surface"
    >
      <p className="font-medium">{t("modal.left_out_groups.title", { count: groups.length })}</p>
      <ul className="mt-2 space-y-1">
        {groups.map((group) => (
          <li key={`${group.fund_label}-${group.payment_date}`} className="tabular-nums">
            {group.fund_label} · {formatDate(group.payment_date)} ·{" "}
            {formatCurrency(group.total_amount)}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-m3-on-surface-variant">
        {t("modal.left_out_groups.body", { count: groups.length })}
      </p>
    </output>
  );
}

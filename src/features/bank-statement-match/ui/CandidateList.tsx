import { useTranslation } from "react-i18next";
import type { BankStatementCandidate } from "@/bindings";
import { Tag } from "@/ui/components/tag/Tag";
import { useFormatters } from "@/ui/format/formatters";

interface GroupCandidateRowsProps {
  candidates: BankStatementCandidate[];
  /** F25 — id namespace of the host (`assign-groups`). */
  idPrefix: string;
  selected: string[];
  onToggle: (groupId: string) => void;
}

/**
 * BAS-068 — the group candidate rows of the « Rapprocher » modal: checkbox,
 * the bordereau's date, an exact-amount tag, the amount; a selected row is
 * highlighted (#692). The groups are the line's fund's only (BAS-090A).
 */
export function GroupCandidateRows({
  candidates,
  idPrefix,
  selected,
  onToggle,
}: GroupCandidateRowsProps) {
  const { t } = useTranslation("bank");
  const { formatCurrency, formatDate } = useFormatters();

  // #357 — a fund with no open bordereau says so instead of an empty list.
  if (candidates.length === 0) {
    return (
      <p id={`${idPrefix}-groups-empty`} className="text-sm text-m3-on-surface-variant">
        {t("reconciliation.assign_groups.no_groups")}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1">
      {candidates.map((candidate) => (
        <li
          key={candidate.group_id}
          id={`${idPrefix}-candidate-${candidate.group_id}`}
          className={`rounded-lg ${selected.includes(candidate.group_id) ? "bg-m3-secondary-container" : "bg-m3-surface-container-low"}`}
        >
          <label
            htmlFor={`${idPrefix}-check-${candidate.group_id}`}
            className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm"
          >
            <input
              id={`${idPrefix}-check-${candidate.group_id}`}
              type="checkbox"
              checked={selected.includes(candidate.group_id)}
              onChange={() => onToggle(candidate.group_id)}
            />
            <span className="text-m3-on-surface">
              {t("reconciliation.assign_groups.bordereau", {
                date: formatDate(candidate.payment_date),
              })}
            </span>
            <span className="ml-auto" />
            {/* BAS-068 — flag the strongest match signal for the picker. */}
            {candidate.is_exact_amount && (
              <Tag id={`${idPrefix}-exact-${candidate.group_id}`} tone="done">
                {t("reconciliation.assign_groups.exact_amount")}
              </Tag>
            )}
            <span className="tabular-nums text-m3-on-surface">
              {formatCurrency(candidate.total_amount)}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

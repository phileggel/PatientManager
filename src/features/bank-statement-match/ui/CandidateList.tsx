import { useTranslation } from "react-i18next";
import type { BankStatementCandidate, BankStatementLine } from "@/bindings";
import { useFormatters } from "@/ui/format/formatters";
import { coveredAmount } from "../shared/candidateSelection";

interface GroupCandidateRowsProps {
  candidates: BankStatementCandidate[];
  /** F25 — id namespace of the host (`assign-groups`, `wizard-assign`). */
  idPrefix: string;
  selected: string[];
  onToggle: (groupId: string) => void;
}

/**
 * BAS-068 — the group candidate rows alone (checkbox, fund name, date, exact
 * flag, amount), shared by `CandidateList` (wizard) and the scope-driven
 * `AssignGroupsModal` which supplies its own candidate source per scope.
 */
export function GroupCandidateRows({
  candidates,
  idPrefix,
  selected,
  onToggle,
}: GroupCandidateRowsProps) {
  const { t } = useTranslation("bank");
  const { formatCurrency, formatDate } = useFormatters();

  return (
    <ul className="flex flex-col gap-1">
      {candidates.map((candidate) => (
        <li
          key={candidate.group_id}
          id={`${idPrefix}-candidate-${candidate.group_id}`}
          className="rounded-lg border border-m3-outline/20"
        >
          <label
            htmlFor={`${idPrefix}-check-${candidate.group_id}`}
            className="flex items-center gap-3 px-3 py-2 cursor-pointer"
          >
            <input
              id={`${idPrefix}-check-${candidate.group_id}`}
              type="checkbox"
              checked={selected.includes(candidate.group_id)}
              onChange={() => onToggle(candidate.group_id)}
            />
            <span className="text-sm text-m3-on-surface">{candidate.fund_name}</span>
            <span className="text-sm text-m3-on-surface-variant">
              {formatDate(candidate.payment_date)}
            </span>
            {/* BAS-068 — flag the strongest match signal for the picker. */}
            {candidate.is_exact_amount && (
              <span
                id={`${idPrefix}-exact-${candidate.group_id}`}
                className="text-xs font-medium text-m3-primary"
              >
                {t("reconciliation.assign_groups.exact_amount")}
              </span>
            )}
            <span className="ml-auto text-sm font-medium text-m3-on-surface">
              {formatCurrency(candidate.total_amount)}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

interface CandidateListProps {
  line: BankStatementLine;
  /** F25 — id namespace of the host (`assign-groups`, `wizard-assign`). */
  idPrefix: string;
  selected: string[];
  onSelectionChange: (selected: string[]) => void;
}

/**
 * BAS-068/090/091/116 — the wizard group step's candidate selector (wire
 * order: most recent payment first) with live balance, over the fund-scoped
 * set only — the broadened/scope switching is dialog-only (BAS-116; the
 * former standalone broaden toggle was superseded by the BAS-111 scopes).
 * Selection state is controlled by the host.
 */
export function CandidateList({ line, idPrefix, selected, onSelectionChange }: CandidateListProps) {
  const { t } = useTranslation("bank");
  const { formatCurrency } = useFormatters();

  const toggle = (groupId: string) => {
    onSelectionChange(
      selected.includes(groupId) ? selected.filter((id) => id !== groupId) : [...selected, groupId],
    );
  };

  return (
    <>
      <output id={`${idPrefix}-balance`} className="text-sm text-m3-on-surface-variant">
        {t("reconciliation.assign_groups.balance", {
          covered: formatCurrency(coveredAmount(line, selected)),
          total: formatCurrency(line.credit_line.amount),
        })}
      </output>

      <GroupCandidateRows
        candidates={line.candidate_groups}
        idPrefix={idPrefix}
        selected={selected}
        onToggle={toggle}
      />
    </>
  );
}

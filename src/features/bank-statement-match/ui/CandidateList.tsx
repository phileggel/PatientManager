import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BankStatementLine } from "@/bindings";
import { Button } from "@/ui/components/button";
import { useFormatters } from "@/ui/format/formatters";
import { coveredAmount, rankCandidates } from "../shared/candidateSelection";

interface CandidateListProps {
  line: BankStatementLine;
  /** F25 — id namespace of the host (`assign-groups`, `wizard-assign`). */
  idPrefix: string;
  selected: string[];
  onSelectionChange: (selected: string[]) => void;
}

/**
 * BAS-068/090/091 — ranked candidate selector with live balance and broaden
 * toggle, shared by AssignGroupsModal and the wizard's assign-group step
 * (BAS-101). Selection state is controlled by the host; the broaden state is
 * local and hosts reset it by keying the component on the line id.
 */
export function CandidateList({ line, idPrefix, selected, onSelectionChange }: CandidateListProps) {
  const { t } = useTranslation("bank");
  const { formatCurrency, formatDate } = useFormatters();
  const [broadened, setBroadened] = useState(false);
  // BAS-068 — default to the fund-filtered set; broadening swaps in the
  // fund-agnostic superset (same date tolerance) the backend provides.
  const source = broadened ? line.broadened_candidates : line.candidate_groups;
  const ranked = useMemo(() => rankCandidates(source), [source]);

  const toggle = (groupId: string) => {
    onSelectionChange(
      selected.includes(groupId) ? selected.filter((id) => id !== groupId) : [...selected, groupId],
    );
  };

  // Swapping the candidate source must drop selections that are no longer
  // visible — otherwise a broadened-only selection would be submitted (and
  // counted nowhere in the balance) after the user narrows back.
  const toggleBroadened = () => {
    const next = !broadened;
    const visible = new Set(
      (next ? line.broadened_candidates : line.candidate_groups).map((c) => c.group_id),
    );
    onSelectionChange(selected.filter((id) => visible.has(id)));
    setBroadened(next);
  };

  return (
    <>
      <output id={`${idPrefix}-balance`} className="text-sm text-m3-on-surface-variant">
        {t("reconciliation.assign_groups.balance", {
          covered: formatCurrency(coveredAmount(line, selected)),
          total: formatCurrency(line.credit_line.amount),
        })}
      </output>

      <div className="flex justify-end">
        <Button
          id={`${idPrefix}-broaden`}
          variant="secondary"
          aria-pressed={broadened}
          onClick={toggleBroadened}
        >
          {t(
            broadened
              ? "reconciliation.assign_groups.broaden_off"
              : "reconciliation.assign_groups.broaden_on",
          )}
        </Button>
      </div>

      <ul className="flex flex-col gap-1">
        {ranked.map((candidate) => (
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
                onChange={() => toggle(candidate.group_id)}
              />
              <span className="text-sm text-m3-on-surface">{candidate.fund_name}</span>
              <span className="text-sm text-m3-on-surface-variant">
                {formatDate(candidate.payment_date)}
              </span>
              <span className="ml-auto text-sm font-medium text-m3-on-surface">
                {formatCurrency(candidate.total_amount)}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </>
  );
}

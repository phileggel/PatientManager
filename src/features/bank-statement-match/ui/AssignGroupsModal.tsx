import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  BankStatementCandidate,
  BankStatementCorrection,
  BankStatementLine,
} from "@/bindings";
import { Button } from "@/ui/components/button";
import { ModalContainer } from "@/ui/components/modal/ModalContainer";
import { toEuros } from "../shared/reconciliationPresenter";

interface AssignGroupsModalProps {
  line: BankStatementLine;
  isOpen: boolean;
  onSubmit: (correction: BankStatementCorrection) => void;
  onCancel: () => void;
}

/** Exact-amount candidates first, preserving relative order otherwise (BAS-068). */
function rankCandidates(candidates: BankStatementCandidate[]): BankStatementCandidate[] {
  return candidates.toSorted((a, b) => Number(b.is_exact_amount) - Number(a.is_exact_amount));
}

/**
 * BAS-068/090/091/094 — assign 1..N candidate groups to a line.
 *
 * Candidates are ranked exact-first (BAS-068). The live balance (BAS-091) tracks
 * the running covered total against the line amount; if the selection would
 * overflow the line amount (BAS-094) the submit button is disabled. Submitting an
 * empty selection is a valid unassign / override (BAS-062).
 */
export function AssignGroupsModal({ line, isOpen, onSubmit, onCancel }: AssignGroupsModalProps) {
  const { t } = useTranslation("bank");
  const [broadened, setBroadened] = useState(false);
  // BAS-068 — default to the fund-filtered set; broadening swaps in the
  // fund-agnostic superset (same date tolerance) the backend provides.
  const source = broadened ? line.broadened_candidates : line.candidate_groups;
  const ranked = useMemo(() => rankCandidates(source), [source]);
  const [selected, setSelected] = useState<string[]>([]);

  const coveredAmount = ranked
    .filter((c) => selected.includes(c.group_id))
    .reduce((sum, c) => sum + c.total_amount, 0);
  const lineAmount = line.credit_line.amount;
  const isOverflow = coveredAmount > lineAmount;

  const toggle = (groupId: string) => {
    setSelected((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId],
    );
  };

  return (
    <ModalContainer
      id="assign-groups-modal"
      isOpen={isOpen}
      onClose={onCancel}
      titleId="assign-groups-modal-title"
    >
      <div className="flex flex-col gap-4 p-6">
        <h2 id="assign-groups-modal-title" className="text-base font-semibold text-m3-on-surface">
          {t("reconciliation.assign_groups.title", { label: line.credit_line.label })}
        </h2>

        <output id="assign-groups-balance" className="text-sm text-m3-on-surface-variant">
          {t("reconciliation.assign_groups.balance", {
            covered: toEuros(coveredAmount),
            total: toEuros(lineAmount),
          })}
        </output>

        <div className="flex justify-end">
          <Button
            id="assign-groups-broaden"
            variant="secondary"
            aria-pressed={broadened}
            onClick={() => setBroadened((prev) => !prev)}
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
              id={`assign-groups-candidate-${candidate.group_id}`}
              className="rounded-lg border border-m3-outline/20"
            >
              <label
                htmlFor={`assign-groups-check-${candidate.group_id}`}
                className="flex items-center gap-3 px-3 py-2 cursor-pointer"
              >
                <input
                  id={`assign-groups-check-${candidate.group_id}`}
                  type="checkbox"
                  checked={selected.includes(candidate.group_id)}
                  onChange={() => toggle(candidate.group_id)}
                />
                <span className="text-sm text-m3-on-surface">{candidate.fund_name}</span>
                <span className="text-sm text-m3-on-surface-variant">{candidate.payment_date}</span>
                <span className="ml-auto text-sm font-medium text-m3-on-surface">
                  {toEuros(candidate.total_amount)}
                </span>
              </label>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-end gap-2">
          <Button id="assign-groups-cancel" variant="secondary" onClick={onCancel}>
            {t("reconciliation.assign_groups.cancel")}
          </Button>
          <Button
            id="assign-groups-submit"
            variant="primary"
            disabled={isOverflow}
            onClick={() =>
              onSubmit({
                type: "AssignGroups",
                line_id: line.line_id,
                group_ids: selected,
              })
            }
          >
            {t("reconciliation.assign_groups.submit")}
          </Button>
        </div>
      </div>
    </ModalContainer>
  );
}

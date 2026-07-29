import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { BankStatementCorrection, BankStatementLine } from "@/bindings";
import { Button } from "@/ui/components/button";
import { ModalContainer } from "@/ui/components/modal/ModalContainer";
import { coveredAmount } from "../shared/candidateSelection";
import { CandidateList } from "./CandidateList";

interface AssignGroupsModalProps {
  line: BankStatementLine;
  isOpen: boolean;
  onSubmit: (correction: BankStatementCorrection) => void;
  onCancel: () => void;
}

/**
 * BAS-068/090/091/094 — assign 1..N candidate groups to a line.
 *
 * The ranked candidate list, balance, and broaden toggle live in CandidateList.
 * If the selection would overflow the line amount (BAS-094) the submit button
 * is disabled. Submitting an empty selection is a valid unassign / override
 * (BAS-062).
 */
export function AssignGroupsModal({ line, isOpen, onSubmit, onCancel }: AssignGroupsModalProps) {
  const { t } = useTranslation("bank");
  const [selected, setSelected] = useState<string[]>([]);

  const isOverflow = coveredAmount(line, selected) > line.credit_line.amount;

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

        <CandidateList
          line={line}
          idPrefix="assign-groups"
          selected={selected}
          onSelectionChange={setSelected}
        />

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

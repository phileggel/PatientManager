import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  BankStatementCorrection,
  BankStatementLine,
  BankStatementReconciliation,
} from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";
import { Button } from "@/ui/components/button";
import { ModalContainer } from "@/ui/components/modal/ModalContainer";

interface ReconciliationWizardProps {
  reconciliation: BankStatementReconciliation;
  isOpen: boolean;
  onApplyCorrection: (correction: BankStatementCorrection) => void;
  onComplete: () => void;
  onAbandon: () => void;
}

/** A line still needs a correction when it is not yet Matched or Rejected. */
function needsCorrection(line: BankStatementLine): boolean {
  return line.status !== "Matched" && line.status !== "Rejected";
}

/**
 * Ordered walkthrough queue: phase 1 = all NeedsLink lines (in document order),
 * phase 2 = every other correction-needed line (BAS-101).
 */
function buildQueue(lines: BankStatementLine[]): BankStatementLine[] {
  const linkFund = lines.filter((l) => l.status === "NeedsLink");
  const rest = lines.filter((l) => needsCorrection(l) && l.status !== "NeedsLink");
  return [...linkFund, ...rest];
}

/**
 * BAS-100–103 — phased link-fund → assign-group walkthrough over the
 * correction-needed lines. Each step reuses the same correction model as the
 * manual list (BAS-102): applying a step calls `onApplyCorrection`. The wizard
 * NEVER auto-validates — when the queue is empty it surfaces a done state whose
 * button calls `onComplete`; abandoning calls `onAbandon` (BAS-103).
 */
export function ReconciliationWizard({
  reconciliation,
  isOpen,
  onApplyCorrection,
  onComplete,
  onAbandon,
}: ReconciliationWizardProps) {
  const { t } = useTranslation("bank");
  const funds = useCacheStore((state) => state.funds);
  const queue = useMemo(() => buildQueue(reconciliation.lines), [reconciliation.lines]);
  const current = queue[0] ?? null;

  const [selectedFundId, setSelectedFundId] = useState("");

  const isLinkFundPhase = current?.status === "NeedsLink";

  return (
    <ModalContainer
      id="reconciliation-wizard"
      isOpen={isOpen}
      onClose={onAbandon}
      titleId="reconciliation-wizard-title"
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <h2
            id="reconciliation-wizard-title"
            className="text-base font-semibold text-m3-on-surface"
          >
            {t("reconciliation.wizard.title")}
          </h2>
          <Button id="wizard-abandon" variant="ghost" size="sm" onClick={onAbandon}>
            {t("reconciliation.wizard.abandon")}
          </Button>
        </div>

        {current === null ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <p className="text-sm text-m3-on-surface-variant">
              {t("reconciliation.wizard.done_body")}
            </p>
            <Button id="wizard-done" variant="primary" onClick={onComplete}>
              {t("reconciliation.wizard.done")}
            </Button>
          </div>
        ) : (
          <div id="wizard-current-step" className="flex flex-col gap-3">
            {isLinkFundPhase && (
              <p id="wizard-phase-link-fund" className="text-xs font-semibold text-m3-primary">
                {t("reconciliation.wizard.phase_link_fund")}
              </p>
            )}

            <p className="text-sm text-m3-on-surface">
              {t("reconciliation.wizard.step_label", { label: current.credit_line.label })}
            </p>

            {isLinkFundPhase && (
              <select
                id="wizard-fund-select"
                className="rounded-lg border border-m3-outline/40 px-3 py-2"
                value={selectedFundId}
                onChange={(e) => setSelectedFundId(e.target.value)}
              >
                <option value="">{t("reconciliation.link_fund.select_placeholder")}</option>
                {funds.map((fund) => (
                  <option key={fund.id} value={fund.id}>
                    {fund.name}
                  </option>
                ))}
              </select>
            )}

            <Button
              id="wizard-apply-step"
              variant="primary"
              onClick={() => {
                if (isLinkFundPhase) {
                  onApplyCorrection({
                    type: "LinkFund",
                    bank_label: current.credit_line.label,
                    assignment:
                      selectedFundId === ""
                        ? { type: "Rejected" }
                        : { type: "Fund", fund_id: selectedFundId },
                  });
                } else {
                  onApplyCorrection({
                    type: "AssignGroups",
                    line_id: current.line_id,
                    group_ids: [],
                  });
                }
                setSelectedFundId("");
              }}
            >
              {t("reconciliation.wizard.apply")}
            </Button>
          </div>
        )}
      </div>
    </ModalContainer>
  );
}

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  BankStatementCorrection,
  BankStatementLine,
  BankStatementReconciliation,
} from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";
import { Button } from "@/ui/components/button";
import { SelectField } from "@/ui/components/field/SelectField";
import { ModalContainer } from "@/ui/components/modal/ModalContainer";
import { coveredAmount } from "../shared/candidateSelection";
import { sortFundsByName } from "../shared/fundOptions";
import { CandidateList } from "./CandidateList";
import { LineContextHeader } from "./LineContextHeader";

interface ReconciliationWizardProps {
  reconciliation: BankStatementReconciliation;
  isOpen: boolean;
  onApplyCorrection: (correction: BankStatementCorrection) => void;
  onComplete: () => void;
  onAbandon: () => void;
  /** Rejection message from the last correction attempt, shown inside the dialog. */
  errorText?: string | null;
  /** Called when the step advances without a successful apply (skip / cascade) so a stale rejection is not shown on the next step. */
  onErrorDismiss?: () => void;
  /** True while a recompute is in flight — apply/reject are disabled (BAS-064). */
  isBusy?: boolean;
}

/** A line still needs a correction when it is not yet Matched or Rejected. */
function needsCorrection(line: BankStatementLine): boolean {
  return line.status !== "Matched" && line.status !== "Rejected";
}

/**
 * Ordered walkthrough queue: phase 1 = all NeedsLink lines (in document order),
 * phase 2 = every other correction-needed line (BAS-101). Phase 2 walks past
 * (a) lines with no group candidate (only procedure candidates or nothing) and
 * (b) lines that already have assigned procedures — presenting the group
 * selector there would silently discard staged procedure work (BAS-116); they
 * stay correctable from the list.
 */
// reviewer-frontend FP: the guard intentionally checks the fund-scoped
// candidate_groups only — broadened_candidates holds near-universal cross-fund
// matches, so including them would put the group selector back over
// procedure-only lines, defeating BAS-116 (see red test BAS-116a).
function buildQueue(lines: BankStatementLine[]): BankStatementLine[] {
  const linkFund = lines.filter((l) => l.status === "NeedsLink");
  const rest = lines.filter(
    (l) =>
      needsCorrection(l) &&
      l.status !== "NeedsLink" &&
      l.candidate_groups.length > 0 &&
      l.assigned_procedure_ids.length === 0,
  );
  return [...linkFund, ...rest];
}

/**
 * BAS-100–103 — phased link-fund → assign-group walkthrough over the
 * correction-needed lines. Each step reuses the same correction model as the
 * manual list (BAS-102): the link-fund step requires an explicit fund or
 * reject, the assign-group step presents the ranked candidate selector, and a
 * step can be skipped without applying anything (BAS-101). The wizard NEVER
 * auto-validates — when the queue is empty it surfaces a done state whose
 * button calls `onComplete`; abandoning calls `onAbandon` (BAS-103).
 */
export function ReconciliationWizard({
  reconciliation,
  isOpen,
  onApplyCorrection,
  onComplete,
  onAbandon,
  errorText,
  onErrorDismiss,
  isBusy = false,
}: ReconciliationWizardProps) {
  const { t } = useTranslation("bank");
  const funds = useCacheStore((state) => state.funds);
  // Skipped lines stay uncorrected (BAS-063) — the queue just walks past them.
  const [skippedLineIds, setSkippedLineIds] = useState<string[]>([]);
  const queue = useMemo(
    () => buildQueue(reconciliation.lines).filter((l) => !skippedLineIds.includes(l.line_id)),
    [reconciliation.lines, skippedLineIds],
  );
  const current = queue[0] ?? null;

  const [selectedFundId, setSelectedFundId] = useState("");
  // Seeded with the line's current assignment — apply recomposes the set (BAS-068).
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(
    current?.assigned_group_ids ?? [],
  );

  // A recompute can advance the step without a local apply (e.g. a link-fund
  // correction resolving several lines) — never carry a selection across lines.
  const currentLineId = current?.line_id ?? null;
  const [lastLineId, setLastLineId] = useState(currentLineId);
  if (lastLineId !== currentLineId) {
    setLastLineId(currentLineId);
    setSelectedFundId("");
    setSelectedGroupIds(current?.assigned_group_ids ?? []);
    // A rejection message belongs to the step it happened in.
    onErrorDismiss?.();
  }

  const isLinkFundPhase = current?.status === "NeedsLink";
  const isOverflow =
    current !== null && coveredAmount(current, selectedGroupIds) > current.credit_line.amount;

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
            {isLinkFundPhase ? (
              <p id="wizard-phase-link-fund" className="text-xs font-semibold text-m3-primary">
                {t("reconciliation.wizard.phase_link_fund")}
              </p>
            ) : (
              <p id="wizard-phase-assign-group" className="text-xs font-semibold text-m3-primary">
                {t("reconciliation.wizard.phase_assign_group")}
              </p>
            )}

            <p className="text-sm text-m3-on-surface">
              {isLinkFundPhase
                ? // BAS-110 — same title key as LinkFundModal (mirrored context).
                  t("reconciliation.link_fund.title", { label: current.credit_line.label })
                : t("reconciliation.wizard.step_label", { label: current.credit_line.label })}
            </p>

            <LineContextHeader id="wizard-step-context" creditLine={current.credit_line} />

            {/* BAS-033 — same helper text as LinkFundModal; never pre-selected. */}
            {isLinkFundPhase && current.suggested_fund_id && current.suggested_fund_name && (
              <p id="wizard-suggestion" className="text-xs text-m3-on-surface-variant">
                {t("reconciliation.link_fund.suggestion", {
                  name: current.suggested_fund_name,
                })}
              </p>
            )}

            {isLinkFundPhase ? (
              <SelectField
                id="wizard-fund-select"
                label={t("reconciliation.link_fund.fund_label")}
                value={selectedFundId}
                onChange={(e) => setSelectedFundId(e.target.value)}
                options={[
                  { label: t("reconciliation.link_fund.select_placeholder"), value: "" },
                  ...sortFundsByName(funds).map((fund) => ({
                    label: fund.name,
                    value: fund.id,
                  })),
                ]}
              />
            ) : (
              <CandidateList
                key={current.line_id}
                line={current}
                idPrefix="wizard-assign"
                selected={selectedGroupIds}
                onSelectionChange={setSelectedGroupIds}
              />
            )}

            {errorText && (
              <p id="wizard-step-error" role="alert" className="text-sm text-m3-error">
                {errorText}
              </p>
            )}

            <div className="flex items-center justify-between gap-2">
              {isLinkFundPhase ? (
                <Button
                  id="wizard-reject-step"
                  variant="danger"
                  disabled={isBusy}
                  onClick={() =>
                    onApplyCorrection({
                      type: "LinkFund",
                      bank_label: current.credit_line.label,
                      assignment: { type: "Rejected" },
                    })
                  }
                >
                  {t("reconciliation.link_fund.reject")}
                </Button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <Button
                  id="wizard-skip-step"
                  variant="secondary"
                  disabled={isBusy}
                  onClick={() => {
                    onErrorDismiss?.();
                    setSkippedLineIds((prev) => [...prev, current.line_id]);
                  }}
                >
                  {t("reconciliation.wizard.skip")}
                </Button>
                <Button
                  id="wizard-apply-step"
                  variant="primary"
                  disabled={
                    isBusy ||
                    (isLinkFundPhase
                      ? selectedFundId === ""
                      : selectedGroupIds.length === 0 || isOverflow)
                  }
                  onClick={() => {
                    if (isLinkFundPhase) {
                      // Rejection is only ever the explicit button on the left
                      // (BAS-101) — an empty selection never implies it.
                      onApplyCorrection({
                        type: "LinkFund",
                        bank_label: current.credit_line.label,
                        assignment: { type: "Fund", fund_id: selectedFundId },
                      });
                    } else {
                      // Skipping is its own button (BAS-101) — apply always
                      // carries the explicit non-empty selection.
                      onApplyCorrection({
                        type: "AssignGroups",
                        line_id: current.line_id,
                        group_ids: selectedGroupIds,
                      });
                    }
                  }}
                >
                  {t("reconciliation.wizard.apply")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ModalContainer>
  );
}

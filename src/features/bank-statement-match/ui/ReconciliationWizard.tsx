import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  BankStatementCorrection,
  BankStatementLine,
  BankStatementReconciliation,
} from "@/bindings";
import { Button } from "@/ui/components/button";
import { ModalContainer } from "@/ui/components/modal/ModalContainer";
import { coveredAmount } from "../shared/candidateSelection";
import { filterProceduresByWindow } from "../shared/procedureWindow";
import { CandidateList } from "./CandidateList";
import { LineContextHeader } from "./LineContextHeader";
import { ProcedureCandidateList } from "./ProcedureCandidateList";

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
  /** True while a recompute is in flight — apply/skip are disabled (BAS-064). */
  isBusy?: boolean;
  /** BAS-118 — display window over the procedure pools, in days. */
  procedureWindowDays: number;
  /** Injected clock for the BAS-118 filter (tests); defaults to the real one. */
  now?: Date;
}

/** A line still needs a correction when it is not yet Matched or Rejected. */
function needsCorrection(line: BankStatementLine): boolean {
  return line.status !== "Matched" && line.status !== "Rejected";
}

/**
 * BAS-116 — the settlement-only walkthrough queue, in document order. A line
 * qualifies when it needs correction and offers something the wizard can
 * settle: fund-scoped group candidates, or window-filtered open procedures
 * (BAS-118). Walked past: lines with neither, and lines already carrying
 * assigned procedures — the wizard lacks the remainder/leave-aside actions
 * needed to finish partial procedure work, so re-presenting it would loop;
 * they stay correctable from the list dialog.
 */
// reviewer-frontend FP: the guard intentionally checks the fund-scoped
// candidate_groups only — broadened_candidates holds near-universal cross-fund
// matches, so including them would put the group selector back over
// procedure-only lines, defeating BAS-116.
function buildQueue(
  lines: BankStatementLine[],
  windowDays: number,
  now: Date,
): BankStatementLine[] {
  return lines.filter(
    (line) =>
      needsCorrection(line) &&
      line.status !== "NeedsLink" &&
      line.assigned_procedure_ids.length === 0 &&
      (line.candidate_groups.length > 0 ||
        filterProceduresByWindow(line.candidate_procedures, windowDays, now, []).length > 0),
  );
}

/**
 * BAS-100–103/116 — the guided settlement walkthrough over the to-decide
 * lines. Each step shows the matching selector — groups when the line has
 * fund-scoped candidates, otherwise the window-filtered procedure list — and
 * applies the corresponding correction (BAS-102: one correction model). A
 * step can be skipped without applying anything; the wizard never
 * auto-validates (BAS-103).
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
  procedureWindowDays,
  now,
}: ReconciliationWizardProps) {
  const { t } = useTranslation("bank");
  const clock = useMemo(() => now ?? new Date(), [now]);
  // Skipped lines stay uncorrected (BAS-063) — the queue just walks past them.
  const [skippedLineIds, setSkippedLineIds] = useState<string[]>([]);
  const queue = useMemo(
    () =>
      buildQueue(reconciliation.lines, procedureWindowDays, clock).filter(
        (line) => !skippedLineIds.includes(line.line_id),
      ),
    [reconciliation.lines, procedureWindowDays, clock, skippedLineIds],
  );
  const current = queue[0] ?? null;

  const isGroupStep = (current?.candidate_groups.length ?? 0) > 0;
  const stepProcedures = current
    ? filterProceduresByWindow(current.candidate_procedures, procedureWindowDays, clock, [])
    : [];

  // Seeded with the line's current assignment — apply recomposes the set (BAS-068).
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(
    current?.assigned_group_ids ?? [],
  );
  const [selectedProcedureIds, setSelectedProcedureIds] = useState<string[]>([]);

  // A recompute can advance the step without a local apply (e.g. a correction
  // resolving several lines) — never carry a selection across lines.
  const currentLineId = current?.line_id ?? null;
  const [lastLineId, setLastLineId] = useState(currentLineId);
  if (lastLineId !== currentLineId) {
    setLastLineId(currentLineId);
    setSelectedGroupIds(current?.assigned_group_ids ?? []);
    setSelectedProcedureIds([]);
    // A rejection message belongs to the step it happened in.
    onErrorDismiss?.();
  }

  const selection = isGroupStep ? selectedGroupIds : selectedProcedureIds;
  const isOverflow =
    current !== null &&
    coveredAmount(current, selection, isGroupStep ? "groups" : "procedures") >
      current.credit_line.amount;

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
            {isGroupStep ? (
              <p id="wizard-phase-assign-group" className="text-xs font-semibold text-m3-primary">
                {t("reconciliation.wizard.phase_assign_group")}
              </p>
            ) : (
              <p
                id="wizard-phase-assign-procedure"
                className="text-xs font-semibold text-m3-primary"
              >
                {t("reconciliation.wizard.phase_assign_procedure")}
              </p>
            )}

            <p className="text-sm text-m3-on-surface">
              {t("reconciliation.wizard.step_label", { label: current.credit_line.label })}
            </p>

            <LineContextHeader id="wizard-step-context" creditLine={current.credit_line} />

            {/* BAS-119 — the candidate list is the step's only scrollable region. */}
            <div id="wizard-step-scrollzone" className="min-h-0 max-h-[45vh] overflow-y-auto">
              {isGroupStep ? (
                <CandidateList
                  key={current.line_id}
                  line={current}
                  idPrefix="wizard-assign"
                  selected={selectedGroupIds}
                  onSelectionChange={setSelectedGroupIds}
                />
              ) : (
                <ProcedureCandidateList
                  candidates={stepProcedures}
                  idPrefix="wizard-assign"
                  selected={selectedProcedureIds}
                  onToggle={(procedureId) =>
                    setSelectedProcedureIds((prev) =>
                      prev.includes(procedureId)
                        ? prev.filter((id) => id !== procedureId)
                        : [...prev, procedureId],
                    )
                  }
                />
              )}
            </div>

            {errorText && (
              <p id="wizard-step-error" role="alert" className="text-sm text-m3-error">
                {errorText}
              </p>
            )}

            <div className="flex items-center justify-end gap-2">
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
                disabled={isBusy || selection.length === 0 || isOverflow}
                onClick={() => {
                  // Skipping is its own button (BAS-101) — apply always
                  // carries the explicit non-empty selection.
                  onApplyCorrection(
                    isGroupStep
                      ? {
                          type: "AssignGroups",
                          line_id: current.line_id,
                          group_ids: selectedGroupIds,
                        }
                      : {
                          type: "AssignProcedures",
                          line_id: current.line_id,
                          procedure_ids: selectedProcedureIds,
                        },
                  );
                }}
              >
                {t("reconciliation.wizard.apply")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </ModalContainer>
  );
}

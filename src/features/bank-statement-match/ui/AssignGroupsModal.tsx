import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { BankStatementCorrection, BankStatementLine } from "@/bindings";
import { Button } from "@/ui/components/button";
import { ModalContainer } from "@/ui/components/modal/ModalContainer";
import { useFormatters } from "@/ui/format/formatters";
import { coveredAmount } from "../shared/candidateSelection";
import { filterProceduresByWindow } from "../shared/procedureWindow";
import { GroupCandidateRows } from "./CandidateList";
import { LineContextHeader } from "./LineContextHeader";
import { ProcedureCandidateList } from "./ProcedureCandidateList";

/** BAS-111 — the three search scopes of the assign dialog. */
type AssignScope = "fund" | "all" | "procedures";

interface AssignGroupsModalProps {
  line: BankStatementLine;
  isOpen: boolean;
  /**
   * May resolve to the correction's success flag — the gold action awaits it
   * to post its two corrections in order and bails when the first is
   * rejected (BAS-064).
   */
  onSubmit: (correction: BankStatementCorrection) => void | boolean | Promise<void | boolean>;
  onCancel: () => void;
  /** Rejection message from the last correction attempt, shown inside the dialog. */
  errorText?: string | null;
  /** True while a recompute is in flight — action buttons are disabled (BAS-064). */
  isBusy?: boolean;
  /** BAS-118 — display window over the procedure pool, in days; the host
   * supplies the persisted setting. Omitted = no filtering. */
  procedureWindowDays?: number;
  /** Injected clock for the BAS-118 filter (tests); defaults to the real one. */
  now?: Date;
}

/**
 * BAS-068/090/091/094/111/113 — assign 1..N settlement items to a line.
 *
 * One explicit scope selector drives the candidate source: groups of the
 * line's fund (default), groups across all funds, or the fund's open
 * procedures (BAS-111 — offered only for a linked line). Switching scope
 * always clears the selection; group and procedure selections never mix
 * (BAS-113). If the selection would overflow the line amount (BAS-094) the
 * submit actions are disabled. Submitting an empty group selection is a valid
 * unassign / override (BAS-062).
 *
 * Footer per the 2026-07-31 wireframe review: « Rapprocher avec reliquat »
 * (left, warning tone — submits the assignment then acknowledges the
 * remainder, BAS-092) and Annuler / « Rapprocher » (right). The remainder
 * itself is informational text, never a button.
 */
export function AssignGroupsModal({
  line,
  isOpen,
  onSubmit,
  onCancel,
  errorText,
  isBusy = false,
  procedureWindowDays,
  now,
}: AssignGroupsModalProps) {
  const { t } = useTranslation("bank");
  const { formatCurrency } = useFormatters();
  // BAS-118A — per-dialog override revealing procedures older than the window.
  const [showOlderProcedures, setShowOlderProcedures] = useState(false);
  const windowedProcedures =
    procedureWindowDays === undefined
      ? line.candidate_procedures
      : filterProceduresByWindow(
          line.candidate_procedures,
          procedureWindowDays,
          now ?? new Date(),
          line.assigned_procedure_ids,
        );
  const visibleProcedures = showOlderProcedures ? line.candidate_procedures : windowedProcedures;

  // BAS-111 — the procedure scope exists only for a linked line.
  const canUseProcedures = line.fund_id !== null;
  // Default-scope rule: a line reopening with assigned procedures seeds the
  // procedure scope (takes precedence); otherwise the procedure scope opens
  // only when the fund-filtered group scope is empty and open procedures
  // exist (the no-bordereau case).
  const initialScope: AssignScope =
    canUseProcedures &&
    (line.assigned_procedure_ids.length > 0 ||
      (line.candidate_groups.length === 0 && line.candidate_procedures.length > 0))
      ? "procedures"
      : "fund";

  const [scope, setScope] = useState<AssignScope>(initialScope);
  // Split selections (BAS-113) — seeded with the current assignment so
  // submitting recomposes (replaces) the set rather than silently dropping it
  // (BAS-068); only the initial scope's selection is seeded.
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(
    initialScope === "procedures" ? [] : line.assigned_group_ids,
  );
  const [selectedProcedureIds, setSelectedProcedureIds] = useState<string[]>(
    initialScope === "procedures" ? line.assigned_procedure_ids : [],
  );

  // BAS-111 — switching scope always clears the visible selection; it never
  // silently spans scopes (and is not re-seeded when switching back).
  const switchScope = (next: AssignScope) => {
    if (next === scope) return;
    setScope(next);
    setSelectedGroupIds([]);
    setSelectedProcedureIds([]);
  };

  const toggleGroup = (groupId: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId],
    );
  };
  const toggleProcedure = (procedureId: string) => {
    setSelectedProcedureIds((prev) =>
      prev.includes(procedureId) ? prev.filter((id) => id !== procedureId) : [...prev, procedureId],
    );
  };

  const lineAmount = line.credit_line.amount;
  const selected = scope === "procedures" ? selectedProcedureIds : selectedGroupIds;
  const covered = coveredAmount(line, selected, scope === "procedures" ? "procedures" : "groups");
  const isOverflow = covered > lineAmount;
  // The gold action (BAS-113A/123A) — enabled whenever coverage is incomplete,
  // including an empty selection (leave-aside); disabled only at exact coverage.
  const goldActionEnabled = covered < lineAmount;
  const isLeaveAside = selected.length === 0;
  // Live: tracks the current selection like the balance above it.
  const remainder = lineAmount - covered;

  const assignmentCorrection = (): BankStatementCorrection =>
    scope === "procedures"
      ? { type: "AssignProcedures", line_id: line.line_id, procedure_ids: selectedProcedureIds }
      : { type: "AssignGroups", line_id: line.line_id, group_ids: selectedGroupIds };

  // The composition of the assignment and BAS-092 — two corrections, one
  // click; awaited so they are applied in order. A rejected assignment aborts
  // the composition: acknowledging against the unchanged prior draft would
  // resolve the line without the intended assignment (BAS-064).
  const submitWithRemainder = async () => {
    const ok = await onSubmit(assignmentCorrection());
    if (ok === false) return;
    await onSubmit({ type: "AcknowledgeRemainder", line_id: line.line_id });
  };

  const scopeButton = (id: AssignScope, labelKey: string) => (
    <Button
      id={`assign-groups-scope-${id}`}
      variant={scope === id ? "tonal" : "ghost"}
      size="sm"
      aria-pressed={scope === id}
      onClick={() => switchScope(id)}
    >
      {t(labelKey)}
    </Button>
  );

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

        <LineContextHeader id="assign-groups-context" creditLine={line.credit_line} />

        {/* BAS-111 — one explicit scope selector for the three search scopes. */}
        <div className="flex items-center gap-1 self-start rounded-xl border border-m3-outline/30 p-1">
          {scopeButton("fund", "reconciliation.assign_groups.scope_fund")}
          {scopeButton("all", "reconciliation.assign_groups.scope_all")}
          {canUseProcedures &&
            scopeButton("procedures", "reconciliation.assign_groups.scope_procedures")}
        </div>

        <output id="assign-groups-balance" className="text-sm text-m3-on-surface-variant">
          {t("reconciliation.assign_groups.balance", {
            covered: formatCurrency(covered),
            total: formatCurrency(lineAmount),
          })}
        </output>

        {/* BAS-119 — the candidate list is the dialog's only scrollable region. */}
        <div id="assign-groups-scrollzone" className="min-h-0 max-h-[45vh] overflow-y-auto">
          {scope === "procedures" ? (
            visibleProcedures.length === 0 && line.candidate_procedures.length > 0 ? (
              // BAS-118A — every open procedure is older than the window.
              <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-m3-outline p-4">
                <p
                  id="assign-groups-procedures-windowed-empty"
                  className="text-sm text-m3-on-surface-variant"
                >
                  {t("reconciliation.assign_groups.window_empty", {
                    days: procedureWindowDays,
                  })}
                </p>
                <Button
                  id="assign-groups-show-older"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowOlderProcedures(true)}
                >
                  {t("reconciliation.assign_groups.show_older")}
                </Button>
              </div>
            ) : (
              <ProcedureCandidateList
                candidates={visibleProcedures}
                idPrefix="assign-groups"
                selected={selectedProcedureIds}
                onToggle={toggleProcedure}
              />
            )
          ) : (
            <GroupCandidateRows
              candidates={scope === "all" ? line.broadened_candidates : line.candidate_groups}
              idPrefix="assign-groups"
              selected={selectedGroupIds}
              onToggle={toggleGroup}
            />
          )}
        </div>

        {errorText && (
          <p id="assign-groups-error" role="alert" className="text-sm text-m3-error">
            {errorText}
          </p>
        )}

        {/* BAS-092 — the uncovered remainder is informational text only; the
            former standalone acknowledge button was judged not understandable
            (2026-07-31 wireframe review). */}
        {line.status === "Partial" && remainder > 0 && (
          <p id="assign-groups-remainder-info" className="text-sm text-m3-on-surface-variant">
            {t("reconciliation.remainder.amount", { amount: formatCurrency(remainder) })}
          </p>
        )}

        <div className="flex items-center justify-between gap-2">
          <Button
            id="assign-groups-submit-with-remainder"
            variant="warning"
            disabled={isBusy || !goldActionEnabled}
            onClick={() => void submitWithRemainder()}
          >
            {isLeaveAside
              ? t("reconciliation.assign_groups.leave_aside")
              : t("reconciliation.assign_groups.submit_with_remainder")}
          </Button>
          <div className="flex items-center gap-2">
            <Button id="assign-groups-cancel" variant="secondary" onClick={onCancel}>
              {t("reconciliation.assign_groups.cancel")}
            </Button>
            <Button
              id="assign-groups-submit"
              variant="primary"
              disabled={isBusy || isOverflow}
              onClick={() => void onSubmit(assignmentCorrection())}
            >
              {t("reconciliation.assign_groups.submit")}
            </Button>
          </div>
        </div>
      </div>
    </ModalContainer>
  );
}

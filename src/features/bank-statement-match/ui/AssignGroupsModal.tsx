import { Check, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { BankStatementCorrection, BankStatementLine } from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";
import { Button } from "@/ui/components/button";
import { IconButton } from "@/ui/components/button/IconButton";
import { ModalContainer } from "@/ui/components/modal/ModalContainer";
import { useFormatters } from "@/ui/format/formatters";
import { coveredAmount } from "../shared/candidateSelection";
import { filterProceduresByWindow } from "../shared/procedureWindow";
import { GroupCandidateRows } from "./CandidateList";
import { ProcedureCandidateList } from "./ProcedureCandidateList";

/** The search scopes of the « Rapprocher » modal: the line's fund only (BAS-090A). */
type AssignScope = "fund" | "procedures";

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
  /** Display window over the procedure pool, in days; the host
   * supplies the persisted setting. Omitted = no filtering. */
  procedureWindowDays?: number;
  /** Injected clock for the window filter (tests); defaults to the real one. */
  now?: Date;
}

/**
 * BAS-068/090/091/094/111/113 — assign 1..N settlement items to a line.
 *
 * One explicit scope selector drives the candidate source: groups of the
 * line's fund (default) or the fund's open procedures (offered only
 * for a linked line); never another fund (BAS-090). Switching scope
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
  const { formatCurrency, formatDate } = useFormatters();
  // A per-dialog override revealing procedures older than the window.
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

  // The procedure scope exists only for a linked line.
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

  // Switching scope always clears the visible selection; it never
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

  // BAS-123B — leave the line aside: an empty assignment of the current scope,
  // then its whole amount acknowledged.
  const leaveAside = async () => {
    const empty: BankStatementCorrection =
      scope === "procedures"
        ? { type: "AssignProcedures", line_id: line.line_id, procedure_ids: [] }
        : { type: "AssignGroups", line_id: line.line_id, group_ids: [] };
    const ok = await onSubmit(empty);
    if (ok === false) return;
    await onSubmit({ type: "AcknowledgeRemainder", line_id: line.line_id });
  };

  const coverTone =
    selected.length === 0
      ? "none"
      : covered === lineAmount
        ? "exact"
        : covered > lineAmount
          ? "over"
          : "short";
  const fundName = useCacheStore((st) => st.funds).find((f) => f.id === line.fund_id)?.name;
  const buttonWidth = "w-48 shrink-0 whitespace-nowrap";

  const scopeSegment = (id: AssignScope, label: string, first: boolean) => (
    <button
      type="button"
      id={`assign-groups-scope-${id}`}
      aria-pressed={scope === id}
      onClick={() => switchScope(id)}
      className={`flex flex-1 items-center justify-center gap-2 px-4 py-2 text-sm font-medium ${
        scope === id
          ? "bg-m3-secondary-container text-m3-on-secondary-container"
          : "text-m3-on-surface"
      } ${first ? "border-r border-m3-outline" : ""}`}
    >
      {scope === id && <Check size={16} />}
      {label}
    </button>
  );

  return (
    <ModalContainer
      id="assign-groups-modal"
      isOpen={isOpen}
      onClose={onCancel}
      maxWidth="max-w-2xl"
      titleId="assign-groups-modal-title"
    >
      {/* #692 — the title holds the line: date – amount (bold) – label (fund). */}
      <div className="flex items-center justify-between border-b border-m3-outline/20 px-6 py-4">
        <div>
          <h2 id="assign-groups-modal-title" className="text-base font-semibold text-m3-on-surface">
            {t("reconciliation.assign_groups.title")}
          </h2>
          <p id="assign-groups-context" className="mt-0.5 text-sm text-m3-on-surface-variant">
            {formatDate(line.credit_line.date)} –{" "}
            <span className="font-semibold text-m3-on-surface">{formatCurrency(lineAmount)}</span> –{" "}
            {line.credit_line.label}
            {fundName ? ` (${fundName})` : ""}
          </p>
        </div>
        <IconButton
          id="assign-groups-close"
          icon={<X size={20} />}
          variant="ghost"
          shape="round"
          onClick={onCancel}
          aria-label={t("statement.modal.close_aria")}
        />
      </div>

      <div className="flex flex-col gap-4 px-6 py-5">
        {/* Groups or procedures, both of the line's fund (BAS-090A). */}
        <div className="flex overflow-hidden rounded-full border border-m3-outline">
          {scopeSegment("fund", t("reconciliation.assign_groups.scope_fund"), canUseProcedures)}
          {canUseProcedures &&
            scopeSegment("procedures", t("reconciliation.assign_groups.scope_procedures"), false)}
        </div>

        {/* The candidate list is the dialog's only scrollable region, five rows tall (#692). */}
        <div
          id="assign-groups-scrollzone"
          className="custom-scrollbar max-h-60 min-h-0 overflow-y-auto pr-1"
        >
          {scope === "procedures" ? (
            visibleProcedures.length === 0 && line.candidate_procedures.length > 0 ? (
              // Every open procedure is older than the window.
              <p
                id="assign-groups-procedures-windowed-empty"
                className="text-sm text-m3-on-surface-variant"
              >
                {t("reconciliation.assign_groups.window_empty", { days: procedureWindowDays })}
              </p>
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
              candidates={line.candidate_groups}
              idPrefix="assign-groups"
              selected={selectedGroupIds}
              onToggle={toggleGroup}
            />
          )}
        </div>
        {scope === "procedures" &&
          !showOlderProcedures &&
          visibleProcedures.length < line.candidate_procedures.length && (
            <button
              type="button"
              id="assign-groups-show-older"
              onClick={() => setShowOlderProcedures(true)}
              className="self-start text-sm font-medium text-m3-primary hover:underline"
            >
              {t("reconciliation.assign_groups.show_older", { days: procedureWindowDays })}
            </button>
          )}

        {/* BAS-091 — the cover: green when exact, orange with the reliquat stated when short. */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-m3-on-surface-variant">
              {t("reconciliation.assign_groups.covered")}
            </span>
            <output
              id="assign-groups-balance"
              className="font-semibold tabular-nums text-m3-on-surface"
            >
              {t("reconciliation.assign_groups.covered_of", {
                covered: formatCurrency(covered),
                total: formatCurrency(lineAmount),
              })}
            </output>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-m3-surface-container-highest">
            <div
              id="assign-groups-cover-bar"
              data-tone={coverTone}
              className={`h-full rounded-full ${coverTone === "exact" ? "bg-[var(--color-snackbar-success-text)]" : coverTone === "over" ? "bg-m3-error" : "bg-[var(--color-snackbar-warning-text)]"}`}
              style={{
                width: `${lineAmount > 0 ? Math.min(100, Math.round((covered / lineAmount) * 100)) : 0}%`,
              }}
            />
          </div>
          {/* BAS-094 — a selection above the amount says so; the action stays off. */}
          {coverTone === "over" && (
            <p
              id="assign-groups-overflow-info"
              className="rounded-lg bg-m3-error-container px-3 py-2 text-sm text-m3-on-error-container"
            >
              {t("reconciliation.assign_groups.overflow_note", {
                amount: formatCurrency(-remainder),
              })}
            </p>
          )}
          {coverTone === "short" && (
            <p
              id="assign-groups-remainder-info"
              className="rounded-lg bg-m3-warning-container px-3 py-2 text-sm text-m3-on-warning-container"
            >
              {t("reconciliation.assign_groups.remainder_note", {
                amount: formatCurrency(remainder),
              })}
            </p>
          )}
        </div>

        {errorText && (
          <p id="assign-groups-error" role="alert" className="text-sm text-m3-error">
            {errorText}
          </p>
        )}
      </div>

      {/* #692 — one filled action; every button one width. */}
      <div className="flex items-center justify-between gap-3 border-t border-m3-outline/20 bg-m3-surface-container-low px-6 py-4">
        <Button
          id="assign-groups-leave-aside"
          variant="outline"
          className={buttonWidth}
          disabled={isBusy}
          onClick={() => void leaveAside()}
        >
          {t("reconciliation.assign_groups.leave_aside")}
        </Button>
        <div className="flex items-center gap-3">
          <Button
            id="assign-groups-cancel"
            variant="ghost"
            className={buttonWidth}
            onClick={onCancel}
          >
            {t("reconciliation.assign_groups.cancel")}
          </Button>
          <Button
            id="assign-groups-submit"
            variant="primary"
            className={buttonWidth}
            disabled={isBusy || isOverflow || selected.length === 0}
            loading={isBusy}
            onClick={() =>
              void (coverTone === "short"
                ? submitWithRemainder()
                : onSubmit(assignmentCorrection()))
            }
          >
            {coverTone === "short"
              ? t("reconciliation.assign_groups.submit_with_remainder")
              : t("reconciliation.assign_groups.submit")}
          </Button>
        </div>
      </div>
    </ModalContainer>
  );
}

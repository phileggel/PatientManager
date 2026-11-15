import { useTranslation } from "react-i18next";
import type { BankStatementProcedureCandidate } from "@/bindings";
import { Tag } from "@/ui/components/tag/Tag";
import { useFormatters } from "@/ui/format/formatters";

interface ProcedureCandidateListProps {
  candidates: BankStatementProcedureCandidate[];
  /** F25 — id namespace of the host; rows get an explicit `proc-` sub-prefix. */
  idPrefix: string;
  selected: string[];
  onToggle: (procedureId: string) => void;
}

/**
 * BAS-112/113 — the procedure-scope candidate rows: `patient · date · billed`
 * with the exact-amount flag, wire order preserved (oldest procedure first).
 * Deliberately no per-procedure amount input and no creation/dispute
 * affordance (BAS-117 scope cuts).
 */
export function ProcedureCandidateList({
  candidates,
  idPrefix,
  selected,
  onToggle,
}: ProcedureCandidateListProps) {
  const { t } = useTranslation("bank");
  const { formatCurrency, formatDate } = useFormatters();

  // The scope tab is reachable whenever the line is linked, even
  // with zero open procedures; a bare list would read as a rendering bug.
  if (candidates.length === 0) {
    return (
      <p id={`${idPrefix}-procedures-empty`} className="text-sm text-m3-on-surface-variant">
        {t("reconciliation.assign_groups.no_procedures")}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1">
      {candidates.map((candidate) => (
        <li
          key={candidate.procedure_id}
          id={`${idPrefix}-candidate-proc-${candidate.procedure_id}`}
          className={`rounded-lg ${selected.includes(candidate.procedure_id) ? "bg-m3-secondary-container" : "bg-m3-surface-container-low"}`}
        >
          <label
            htmlFor={`${idPrefix}-check-proc-${candidate.procedure_id}`}
            className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm"
          >
            <input
              id={`${idPrefix}-check-proc-${candidate.procedure_id}`}
              type="checkbox"
              checked={selected.includes(candidate.procedure_id)}
              onChange={() => onToggle(candidate.procedure_id)}
            />
            <span className="tabular-nums text-m3-on-surface-variant">
              {formatDate(candidate.procedure_date)}
            </span>
            <span className="text-m3-on-surface">{candidate.patient_name}</span>
            <span className="ml-auto" />
            {candidate.is_exact_amount && (
              <Tag id={`${idPrefix}-exact-proc-${candidate.procedure_id}`} tone="done">
                {t("reconciliation.assign_groups.exact_amount")}
              </Tag>
            )}
            <span className="tabular-nums text-m3-on-surface">
              {formatCurrency(candidate.billed_amount)}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

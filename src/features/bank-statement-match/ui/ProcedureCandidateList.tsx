import { useTranslation } from "react-i18next";
import type { BankStatementProcedureCandidate } from "@/bindings";
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

  return (
    <ul className="flex flex-col gap-1">
      {candidates.map((candidate) => (
        <li
          key={candidate.procedure_id}
          id={`${idPrefix}-candidate-proc-${candidate.procedure_id}`}
          className="rounded-lg border border-m3-outline/20"
        >
          <label
            htmlFor={`${idPrefix}-check-proc-${candidate.procedure_id}`}
            className="flex items-center gap-3 px-3 py-2 cursor-pointer"
          >
            <input
              id={`${idPrefix}-check-proc-${candidate.procedure_id}`}
              type="checkbox"
              checked={selected.includes(candidate.procedure_id)}
              onChange={() => onToggle(candidate.procedure_id)}
            />
            <span className="text-sm text-m3-on-surface">{candidate.patient_name}</span>
            <span className="text-sm text-m3-on-surface-variant">
              {formatDate(candidate.procedure_date)}
            </span>
            {candidate.is_exact_amount && (
              <span
                id={`${idPrefix}-exact-proc-${candidate.procedure_id}`}
                className="text-xs font-medium text-m3-primary"
              >
                {t("reconciliation.assign_groups.exact_amount")}
              </span>
            )}
            <span className="ml-auto text-sm font-medium text-m3-on-surface">
              {formatCurrency(candidate.billed_amount)}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

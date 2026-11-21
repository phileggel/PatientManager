import { useTranslation } from "react-i18next";
import { useFormatters } from "@/ui/format/formatters";
import { useSelectOpenProceduresPanel } from "./useSelectOpenProceduresPanel";

interface SelectOpenProceduresPanelProps {
  /** F25 — id namespace of the host window. */
  idPrefix: string;
  fundId: string;
  selectedProcedureIds: string[];
  onSelectionChange: (procedureIds: string[], totalAmountMillis: number) => void;
  now?: Date;
}

/**
 * #712 — the open procedures a fund's wire with no bordereau settles (BSM-050). Rows
 * and display window as in the import's « Rapprocher »: `date · patient · billed`.
 */
export function SelectOpenProceduresPanel(props: SelectOpenProceduresPanelProps) {
  const { idPrefix, fundId, selectedProcedureIds } = props;
  const { t } = useTranslation("bank");
  const { formatCurrency, formatDate } = useFormatters();
  const {
    loading,
    windowDays,
    visible,
    hasCandidates,
    hasOlder,
    showOlderProcedures,
    toggleProcedure,
  } = useSelectOpenProceduresPanel(props);

  if (!fundId) {
    return (
      <p id={`${idPrefix}-choose-fund`} className="text-sm text-m3-on-surface-variant">
        {t("transfer.open_procedures.choose_fund")}
      </p>
    );
  }
  if (loading) {
    return (
      <p className="text-sm text-m3-on-surface-variant">{t("transfer.open_procedures.loading")}</p>
    );
  }
  if (!hasCandidates) {
    return (
      <p id={`${idPrefix}-empty`} className="text-sm text-m3-on-surface-variant">
        {t("reconciliation.assign_groups.no_procedures")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-m3-on-surface">
        {t("transfer.open_procedures.label")}
      </p>
      <div
        id={`${idPrefix}-scrollzone`}
        className="custom-scrollbar max-h-60 min-h-0 overflow-y-auto pr-1"
      >
        {visible.length === 0 ? (
          <p id={`${idPrefix}-windowed-empty`} className="text-sm text-m3-on-surface-variant">
            {t("reconciliation.assign_groups.window_empty", { days: windowDays })}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {visible.map((candidate) => {
              const ticked = selectedProcedureIds.includes(candidate.procedure_id);
              return (
                <li
                  key={candidate.procedure_id}
                  id={`${idPrefix}-candidate-proc-${candidate.procedure_id}`}
                  className={`rounded-lg ${ticked ? "bg-m3-secondary-container" : "bg-m3-surface-container-low"}`}
                >
                  <label
                    htmlFor={`${idPrefix}-check-proc-${candidate.procedure_id}`}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm"
                  >
                    <input
                      id={`${idPrefix}-check-proc-${candidate.procedure_id}`}
                      type="checkbox"
                      checked={ticked}
                      onChange={() => toggleProcedure(candidate.procedure_id)}
                    />
                    <span className="tabular-nums text-m3-on-surface-variant">
                      {formatDate(candidate.procedure_date)}
                    </span>
                    <span className="text-m3-on-surface">{candidate.patient_name}</span>
                    <span className="ml-auto" />
                    <span className="tabular-nums text-m3-on-surface">
                      {formatCurrency(candidate.billed_amount)}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {hasOlder && (
        <button
          type="button"
          id={`${idPrefix}-show-older`}
          onClick={showOlderProcedures}
          className="self-start text-sm font-medium text-m3-primary hover:underline"
        >
          {t("reconciliation.assign_groups.show_older", { days: windowDays })}
        </button>
      )}
      <p className="text-xs text-m3-on-surface-variant">{t("transfer.open_procedures.note")}</p>
    </div>
  );
}

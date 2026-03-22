import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DirectPaymentProcedureCandidate } from "@/bindings";
import { Button } from "@/ui/components";
import { useSelectProceduresPanel } from "./useSelectProceduresPanel";

interface SelectProceduresPanelProps {
  transferDate: string;
  selectedProcedureIds: string[];
  onSelectionChange: (procedureIds: string[], totalAmountMillis: number) => void;
  /** Currently linked procedures (DirectlyPayed) shown pre-selected in edit mode. */
  currentProcedures?: DirectPaymentProcedureCandidate[];
}

export function SelectProceduresPanel(props: SelectProceduresPanelProps) {
  const { transferDate, selectedProcedureIds, currentProcedures } = props;
  const { t } = useTranslation("bank");
  const {
    loading,
    isExpanded,
    searchQuery,
    setSearchQuery,
    filteredCandidates,
    getPatientName,
    toggleProcedure,
    handleExpand,
  } = useSelectProceduresPanel(props);

  if (!transferDate) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-neutral-90">{t("transfer.selectProcedures.label")}</p>

      {/* Current procedures section — shown in edit mode */}
      {currentProcedures && currentProcedures.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-neutral-60 uppercase tracking-wide">
            {t("transfer.selectProcedures.current")}
          </p>
          <div className="bg-m3-surface-container-low rounded-xl flex flex-col">
            {currentProcedures.map((proc) => (
              <label
                key={proc.procedure_id}
                className="flex items-center gap-3 px-3 py-3 hover:bg-neutral-10 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedProcedureIds.includes(proc.procedure_id)}
                  onChange={() => toggleProcedure(proc)}
                  className="w-4 h-4 shrink-0"
                />
                <div className="flex flex-1 items-center justify-between gap-2 text-sm min-w-0">
                  <span className="font-medium text-neutral-90 truncate">
                    {getPatientName(proc.patient_id)}
                  </span>
                  <span className="text-neutral-60 text-xs whitespace-nowrap">
                    {new Date(proc.procedure_date).toLocaleDateString("fr-FR")}
                  </span>
                  <span className="font-semibold whitespace-nowrap">
                    €{((proc.procedure_amount ?? 0) / 1000).toFixed(2)}
                  </span>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* R20 — search input, shown only in expanded mode */}
      {isExpanded && (
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("transfer.selectProcedures.filterPlaceholder")}
          className="w-full px-3 py-2 text-sm border border-neutral-30 rounded-lg focus:outline-none focus:ring-2 focus:ring-m3-primary"
        />
      )}

      {loading ? (
        <p className="text-sm text-neutral-60 py-2">{t("transfer.selectProcedures.loading")}</p>
      ) : filteredCandidates.length === 0 ? (
        <p className="text-sm text-neutral-60 py-2">
          {isExpanded
            ? t("transfer.selectProcedures.emptyAll")
            : t("transfer.selectProcedures.empty")}
        </p>
      ) : (
        <div className="bg-m3-surface-container-low rounded-xl flex flex-col max-h-48 overflow-y-auto">
          {filteredCandidates.map((proc) => (
            <label
              key={proc.procedure_id}
              className="flex items-center gap-3 px-3 py-3 hover:bg-neutral-10 cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={selectedProcedureIds.includes(proc.procedure_id)}
                onChange={() => toggleProcedure(proc)}
                className="w-4 h-4 shrink-0"
              />
              <div className="flex flex-1 items-center justify-between gap-2 text-sm min-w-0">
                <span className="font-medium text-neutral-90 truncate">
                  {getPatientName(proc.patient_id)}
                </span>
                <span className="text-neutral-60 text-xs whitespace-nowrap">
                  {new Date(proc.procedure_date).toLocaleDateString("fr-FR")}
                </span>
                <span className="font-semibold whitespace-nowrap">
                  €{((proc.procedure_amount ?? 0) / 1000).toFixed(2)}
                </span>
              </div>
            </label>
          ))}
        </div>
      )}

      {!isExpanded && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleExpand}
          icon={<Search size={14} />}
        >
          {t("transfer.selectProcedures.expand")}
        </Button>
      )}

      {selectedProcedureIds.length > 0 && (
        <p className="text-xs text-neutral-60">
          {t("transfer.selectProcedures.selected", { count: selectedProcedureIds.length })}
        </p>
      )}
    </div>
  );
}

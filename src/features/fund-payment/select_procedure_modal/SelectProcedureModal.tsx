import { Calendar, Check, ChevronDown, Plus, RotateCcw, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Procedure } from "@/bindings";
import { Button } from "@/ui/components";
import { formatAmountEUR, formatDateFR } from "../shared/presenter";
import { useProcedureSelectionModal } from "./useSelectProcedureModal";

interface ProcedureSelectionModalProps {
  isOpen: boolean;
  fundId: string;
  initialSelectionIds: string[];
  onConfirm: (procedures: Procedure[]) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  /**
   * When provided, skips the backend fetch and uses these procedures directly.
   * Used by the edit modal (R19): procedures are pre-filtered by fund + date + not in group.
   */
  preloadedProcedures?: Procedure[];
}

export function ProcedureSelectionModal({
  isOpen,
  fundId,
  initialSelectionIds,
  onConfirm,
  onCancel,
  isSubmitting = false,
  preloadedProcedures,
}: ProcedureSelectionModalProps) {
  const { t, i18n } = useTranslation("fund-payment");

  const {
    loading,
    selectedMonth,
    setSelectedMonth,
    monthYearOptions,
    filteredProcedures,
    toggleSelection,
    isSelected,
    stats,
    reset,
    handleConfirm,
    getPatientName,
  } = useProcedureSelectionModal({
    isOpen,
    fundId,
    initialSelectionIds,
    onConfirm,
    preloadedProcedures,
  });

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="select-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-m3-on-surface/40"
    >
      <div className="bg-m3-surface-container-lowest/85 backdrop-blur-[12px] rounded-[28px] shadow-elevation-4 w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6">
          <h2 id="select-modal-title" className="text-xl font-semibold text-m3-on-surface">
            {t("select.title")}
          </h2>
          <Button type="button" variant="ghost" onClick={onCancel} aria-label={t("select.cancel")}>
            <X size={20} />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
          {/* Month/Year Filter */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label
                htmlFor="monthFilter"
                className="block text-sm font-medium mb-1 text-m3-on-surface"
              >
                {t("select.filterLabel")}
              </label>
              <div className="relative">
                <select
                  id="monthFilter"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full px-3 py-2 border border-m3-outline rounded-xl appearance-none bg-m3-surface-container-lowest/70 cursor-pointer text-m3-on-surface"
                >
                  <option value="">{t("select.allMonths")}</option>
                  {monthYearOptions.map((month) => {
                    const [year, monthNum] = month.split("-");
                    const date = new Date(`${year}-${monthNum}-01`);
                    const label = date.toLocaleDateString(i18n.language, {
                      year: "numeric",
                      month: "long",
                    });
                    return (
                      <option key={month} value={month}>
                        {label}
                      </option>
                    );
                  })}
                </select>
                <ChevronDown
                  size={16}
                  className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-m3-on-surface-variant"
                />
              </div>
            </div>
          </div>

          {/* Procedures List */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-m3-on-surface">
              {t("select.procedureCount", { count: filteredProcedures.length })}
            </p>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 rounded-full border-2 border-m3-primary/30 border-t-m3-primary animate-spin" />
              </div>
            ) : filteredProcedures.length === 0 ? (
              <p className="text-center py-8 text-m3-on-surface-variant">{t("select.empty")}</p>
            ) : (
              <div className="bg-m3-surface-container rounded-xl overflow-hidden">
                {filteredProcedures.map((proc) => (
                  <label
                    key={proc.id}
                    className="flex items-center gap-3 px-3 py-4 pr-6 hover:bg-m3-surface-container-high cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-m3-primary/50"
                  >
                    <span
                      aria-hidden="true"
                      className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                        isSelected(proc.id)
                          ? "bg-m3-primary shadow-elevation-1"
                          : "bg-m3-surface-container-highest"
                      }`}
                    >
                      {isSelected(proc.id) && (
                        <Check size={12} strokeWidth={3} className="text-m3-on-primary" />
                      )}
                    </span>
                    <input
                      type="checkbox"
                      checked={isSelected(proc.id)}
                      onChange={() => toggleSelection(proc)}
                      disabled={isSubmitting}
                      className="sr-only"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center gap-4">
                        <span className="flex items-center gap-1 text-xs text-m3-on-surface-variant whitespace-nowrap">
                          <Calendar size={12} />
                          {formatDateFR(proc.procedure_date)}
                        </span>
                        <p className="text-sm font-medium text-m3-on-surface">
                          {getPatientName(proc.patient_id)}
                        </p>
                        <span className="font-semibold text-m3-on-surface whitespace-nowrap">
                          {formatAmountEUR(proc.procedure_amount ?? 0)}
                        </span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Stats Footer */}
        <div className="bg-m3-surface-container-low p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="space-y-1">
              <p className="text-sm text-m3-on-surface-variant">
                {t("select.linesSelected", { count: stats.count })}
              </p>
              <p className="text-lg font-semibold text-m3-on-surface">
                {formatAmountEUR(stats.total)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={reset}
                disabled={stats.count === 0}
                icon={<RotateCcw size={16} />}
              >
                {t("select.reset")}
              </Button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
              {t("select.cancel")}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleConfirm}
              disabled={stats.count === 0 || isSubmitting}
              loading={isSubmitting}
              icon={<Plus size={18} />}
            >
              {isSubmitting
                ? t("select.creating")
                : t("select.addProcedures", { count: stats.count })}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

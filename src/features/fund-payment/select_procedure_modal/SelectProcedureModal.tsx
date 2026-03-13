import { Calendar, ChevronDown, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Procedure } from "@/bindings";
import { useAppStore } from "@/lib/appStore";
import { logger } from "@/lib/logger";
import { Button } from "@/ui/components";
import { getUnpaidProceduresByFund } from "../gateway";
import { useSelectedProcedures } from "./useSelectProcedureModal";

interface ProcedureSelectionModalProps {
  isOpen: boolean;
  fundId: string;
  initialSelectionIds: string[];
  onConfirm: (procedures: Procedure[]) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function ProcedureSelectionModal({
  isOpen,
  fundId,
  initialSelectionIds,
  onConfirm,
  onCancel,
  isSubmitting = false,
}: ProcedureSelectionModalProps) {
  const { t, i18n } = useTranslation("fund-payment");
  const [availableProcedures, setAvailableProcedures] = useState<Procedure[]>([]);

  const patients = useAppStore((state) => state.patients);
  const { toggleSelection, isSelected, getSelectedProcedures, stats, reset } =
    useSelectedProcedures();

  useEffect(() => {
    if (isOpen && fundId) {
      const fetchProcedures = async () => {
        try {
          const result = await getUnpaidProceduresByFund(fundId);
          if (result.success) {
            setAvailableProcedures(result.data);
            reset();
            result.data
              .filter((p) => initialSelectionIds.includes(p.id))
              .forEach((p) => {
                toggleSelection(p);
              });
          } else {
            logger.error("Failed to load procedures", { error: result.error });
          }
        } catch (e) {
          logger.error("Failed to load procedures", e);
        }
      };
      fetchProcedures();
    }
  }, [isOpen, fundId, initialSelectionIds, toggleSelection, reset]);

  const procedures = useMemo(() => {
    return [...availableProcedures].sort((a, b) => {
      // Priorité 1 : Était déjà sélectionné à l'ouverture (reste en haut)
      const aWasInitial = initialSelectionIds.includes(a.id) ? 1 : 0;
      const bWasInitial = initialSelectionIds.includes(b.id) ? 1 : 0;
      if (aWasInitial !== bWasInitial) return bWasInitial - aWasInitial;

      // Priorité 2 : Date la plus récente
      return new Date(b.procedure_date).getTime() - new Date(a.procedure_date).getTime();
    });
  }, [availableProcedures, initialSelectionIds]);

  const [selectedMonth, setSelectedMonth] = useState<string>("");

  // Reset selection when procedures change (new group opened)
  useEffect(() => {
    reset();
    setSelectedMonth("");
  }, [reset]);

  // Get unique month/year values from procedures
  const monthYearOptions = useMemo(() => {
    const months = new Set<string>();
    procedures.forEach((p) => {
      const date = new Date(p.procedure_date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      months.add(key);
    });
    return Array.from(months).sort().reverse();
  }, [procedures]);

  // Filter procedures by selected month
  const filteredProcedures = useMemo(() => {
    if (!selectedMonth) return procedures;

    return procedures.filter((p) => {
      const date = new Date(p.procedure_date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      return key === selectedMonth;
    });
  }, [procedures, selectedMonth]);

  const handleConfirm = () => {
    const selected = getSelectedProcedures();
    onConfirm(selected);
  };

  const getPatientName = (patientId: string): string => {
    const patient = patients.find((p) => p.id === patientId);
    return patient?.name || patientId;
  };

  const formatDateFrench = (isoDate: string): string => {
    const date = new Date(`${isoDate}T00:00:00Z`);
    return new Intl.DateTimeFormat("fr-FR").format(date);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-30">
          <h2 className="text-xl font-semibold">{t("select.title")}</h2>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 hover:bg-neutral-20 rounded transition-colors"
          >
            <X size={20} className="text-neutral-70" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
          {/* Month/Year Filter */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label
                htmlFor="monthFilter"
                className="block text-sm font-medium mb-1 text-neutral-90"
              >
                {t("select.filterLabel")}
              </label>
              <div className="relative">
                <select
                  id="monthFilter"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-30 rounded-md appearance-none bg-white cursor-pointer text-neutral-90"
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-60"
                />
              </div>
            </div>
          </div>

          {/* Procedures List */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-neutral-90">
              {t("select.procedureCount", { count: filteredProcedures.length })}
            </p>
            {filteredProcedures.length === 0 ? (
              <p className="text-center py-8 text-neutral-60">{t("select.empty")}</p>
            ) : (
              <div className="space-y-1 border border-neutral-30 rounded-lg divide-y">
                {filteredProcedures.map((proc) => (
                  <label
                    key={proc.id}
                    className="flex items-center gap-3 px-3 py-4 pr-6 hover:bg-neutral-10 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected(proc.id)}
                      onChange={() => toggleSelection(proc)}
                      className="w-4 h-4"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center gap-4">
                        <span className="flex items-center gap-1 text-xs text-neutral-70 whitespace-nowrap">
                          <Calendar size={12} />
                          {formatDateFrench(proc.procedure_date)}
                        </span>
                        <p className="text-sm font-medium text-neutral-90">
                          {getPatientName(proc.patient_id)}
                        </p>
                        <span className="font-semibold text-neutral-90 whitespace-nowrap">
                          €{((proc.procedure_amount || 0) / 1000).toFixed(2)}
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
        <div className="border-t border-neutral-30 bg-neutral-5 p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="space-y-1">
              <p className="text-sm text-neutral-70">
                {t("select.linesSelected", { count: stats.count })}
              </p>
              <p className="text-lg font-semibold text-neutral-90">
                €{(stats.total / 1000).toFixed(2)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={reset}
                icon={<RotateCcw size={16} />}
              >
                {t("select.reset")}
              </Button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
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

import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DirectPaymentProcedureCandidate } from "@/bindings";
import { useAppStore } from "@/lib/appStore";
import { logger } from "@/lib/logger";
import { Button } from "@/ui/components";
import {
  getAllEligibleProceduresForDirectPayment,
  getEligibleProceduresForDirectPayment,
} from "./gateway";

interface SelectProceduresPanelProps {
  transferDate: string;
  selectedProcedureIds: string[];
  onSelectionChange: (procedureIds: string[], totalAmountMillis: number) => void;
}

export function SelectProceduresPanel({
  transferDate,
  selectedProcedureIds,
  onSelectionChange,
}: SelectProceduresPanelProps) {
  const { t } = useTranslation("bank");
  const patients = useAppStore((state) => state.patients);

  const [candidates, setCandidates] = useState<DirectPaymentProcedureCandidate[]>([]);
  const candidateMapRef = useRef<Map<string, DirectPaymentProcedureCandidate>>(new Map());
  const [loading, setLoading] = useState(false);
  // Track which date has been "expanded" — resets automatically when transferDate changes
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  // Refs to avoid stale closures in the fetch effect
  const selectedProcedureIdsRef = useRef(selectedProcedureIds);
  selectedProcedureIdsRef.current = selectedProcedureIds;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  const getPatientName = (patientId: string): string =>
    patients.find((p) => p.id === patientId)?.name ?? patientId;

  useEffect(() => {
    if (!transferDate) {
      setCandidates([]);
      return;
    }

    const isExpanded = expandedDate === transferDate;
    setLoading(true);
    const promise = isExpanded
      ? getAllEligibleProceduresForDirectPayment()
      : getEligibleProceduresForDirectPayment(transferDate);

    promise
      .then((result) => {
        if (result.success && result.data) {
          for (const c of result.data) candidateMapRef.current.set(c.procedure_id, c);
          setCandidates(result.data);
          // Recompute total for current selection once amounts are available
          const ids = selectedProcedureIdsRef.current;
          if (ids.length > 0) {
            const total = ids.reduce(
              (sum, id) => sum + (candidateMapRef.current.get(id)?.procedure_amount ?? 0),
              0,
            );
            onSelectionChangeRef.current(ids, total);
          }
        } else {
          logger.error("[SelectProceduresPanel] fetch failed", { error: result.error });
          setCandidates([]);
        }
      })
      .finally(() => setLoading(false));
  }, [transferDate, expandedDate]);

  const toggleProcedure = (proc: DirectPaymentProcedureCandidate) => {
    candidateMapRef.current.set(proc.procedure_id, proc);
    const newIds = selectedProcedureIds.includes(proc.procedure_id)
      ? selectedProcedureIds.filter((id) => id !== proc.procedure_id)
      : [...selectedProcedureIds, proc.procedure_id];
    const total = newIds.reduce(
      (sum, id) => sum + (candidateMapRef.current.get(id)?.procedure_amount ?? 0),
      0,
    );
    onSelectionChange(newIds, total);
  };

  if (!transferDate) return null;

  const isExpanded = expandedDate === transferDate;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-neutral-90">{t("transfer.selectProcedures.label")}</p>

      {loading ? (
        <p className="text-sm text-neutral-60 py-2">{t("transfer.selectProcedures.loading")}</p>
      ) : candidates.length === 0 ? (
        <p className="text-sm text-neutral-60 py-2">
          {isExpanded
            ? t("transfer.selectProcedures.emptyAll")
            : t("transfer.selectProcedures.empty")}
        </p>
      ) : (
        <div className="border border-neutral-30 rounded-lg divide-y divide-neutral-20 max-h-48 overflow-y-auto">
          {candidates.map((proc) => (
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
                  {proc.procedure_date}
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
          onClick={() => setExpandedDate(transferDate)}
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

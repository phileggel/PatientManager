import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Procedure } from "@/bindings";
import { toastService } from "@/core/snackbar";
import { useAppStore } from "@/lib/appStore";
import { logger } from "@/lib/logger";
import { getUnpaidProceduresByFund } from "../gateway";

export interface SelectedProcedure {
  id: string;
  patient_id: string;
  amount: number;
  procedure_date: string;
}

export function useSelectedProcedures() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [procedureMap, setProcedureMap] = useState<Map<string, Procedure>>(new Map());

  const toggleSelection = useCallback((procedure: Procedure) => {
    setSelected((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(procedure.id)) {
        newSet.delete(procedure.id);
      } else {
        newSet.add(procedure.id);
      }
      return newSet;
    });

    setProcedureMap((prev) => {
      const newMap = new Map(prev);
      if (!newMap.has(procedure.id)) {
        newMap.set(procedure.id, procedure);
      } else {
        newMap.delete(procedure.id);
      }
      return newMap;
    });
  }, []);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  const getSelectedProcedures = useCallback(
    () => Array.from(procedureMap.values()),
    [procedureMap],
  );

  const stats = useMemo(() => {
    const procedures = Array.from(procedureMap.values());
    return {
      count: procedures.length,
      total: procedures.reduce((sum, p) => sum + (p.procedure_amount || 0), 0),
    };
  }, [procedureMap]);

  const reset = useCallback(() => {
    setSelected(new Set());
    setProcedureMap(new Map());
  }, []);

  return {
    selected,
    toggleSelection,
    isSelected,
    getSelectedProcedures,
    stats,
    reset,
  };
}

interface UseProcedureSelectionModalParams {
  isOpen: boolean;
  fundId: string;
  initialSelectionIds: string[];
  onConfirm: (procedures: Procedure[]) => void;
  preloadedProcedures?: Procedure[];
}

export function useProcedureSelectionModal({
  isOpen,
  fundId,
  initialSelectionIds,
  onConfirm,
  preloadedProcedures,
}: UseProcedureSelectionModalParams) {
  const { t } = useTranslation("fund-payment");
  const patients = useAppStore((state) => state.patients);

  const [availableProcedures, setAvailableProcedures] = useState<Procedure[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState("");

  const { toggleSelection, isSelected, getSelectedProcedures, stats, reset } =
    useSelectedProcedures();

  // Load or apply preloaded procedures when modal opens
  useEffect(() => {
    if (!isOpen) return;

    if (preloadedProcedures) {
      // Pre-filtered list from parent (edit modal R19 flow) — no fetch needed
      setAvailableProcedures(preloadedProcedures);
      reset();
      for (const p of preloadedProcedures.filter((p) => initialSelectionIds.includes(p.id))) {
        toggleSelection(p);
      }
      return;
    }

    if (!fundId) return;

    const fetchProcedures = async () => {
      setLoading(true);
      try {
        const result = await getUnpaidProceduresByFund(fundId);
        if (result.success) {
          setAvailableProcedures(result.data);
          reset();
          for (const p of result.data.filter((p) => initialSelectionIds.includes(p.id))) {
            toggleSelection(p);
          }
        } else {
          logger.error("Failed to load procedures", { error: result.error });
          toastService.show("error", t("select.errorLoad"));
        }
      } catch (e) {
        logger.error("Failed to load procedures", e);
        toastService.show("error", t("select.errorLoad"));
      } finally {
        setLoading(false);
      }
    };
    fetchProcedures();
  }, [isOpen, fundId, initialSelectionIds, toggleSelection, reset, preloadedProcedures, t]);

  // Reset month filter when modal opens
  useEffect(() => {
    if (isOpen) setSelectedMonth("");
  }, [isOpen]);

  // Sort: initial selections first, then by most recent date
  const procedures = useMemo(() => {
    return [...availableProcedures].sort((a, b) => {
      // Priority 1: Was already selected at open time (stays on top)
      const aWasInitial = initialSelectionIds.includes(a.id) ? 1 : 0;
      const bWasInitial = initialSelectionIds.includes(b.id) ? 1 : 0;
      if (aWasInitial !== bWasInitial) return bWasInitial - aWasInitial;
      // Priority 2: Most recent date first
      return new Date(b.procedure_date).getTime() - new Date(a.procedure_date).getTime();
    });
  }, [availableProcedures, initialSelectionIds]);

  const monthYearOptions = useMemo(() => {
    const months = new Set<string>();
    for (const p of procedures) {
      const date = new Date(p.procedure_date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      months.add(key);
    }
    return Array.from(months).sort().reverse();
  }, [procedures]);

  const filteredProcedures = useMemo(() => {
    if (!selectedMonth) return procedures;
    return procedures.filter((p) => {
      const date = new Date(p.procedure_date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      return key === selectedMonth;
    });
  }, [procedures, selectedMonth]);

  const handleConfirm = useCallback(() => {
    onConfirm(getSelectedProcedures());
  }, [onConfirm, getSelectedProcedures]);

  const getPatientName = useCallback(
    (patientId: string): string => {
      const patient = patients.find((p) => p.id === patientId);
      return patient?.name || patientId;
    },
    [patients],
  );

  return {
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
  };
}

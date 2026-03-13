import { useCallback, useMemo, useState } from "react";
import type { Procedure } from "@/bindings";

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

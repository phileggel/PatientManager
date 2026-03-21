import { useEffect, useRef, useState } from "react";
import type { DirectPaymentProcedureCandidate } from "@/bindings";
import { useAppStore } from "@/lib/appStore";
import { logger } from "@/lib/logger";
import {
  getAllEligibleProceduresForDirectPayment,
  getEligibleProceduresForDirectPayment,
} from "../gateway";

interface UseSelectProceduresPanelProps {
  transferDate: string;
  selectedProcedureIds: string[];
  onSelectionChange: (procedureIds: string[], totalAmountMillis: number) => void;
  currentProcedures?: DirectPaymentProcedureCandidate[];
}

export function useSelectProceduresPanel({
  transferDate,
  selectedProcedureIds,
  onSelectionChange,
  currentProcedures,
}: UseSelectProceduresPanelProps) {
  const patients = useAppStore((state) => state.patients);

  const [candidates, setCandidates] = useState<DirectPaymentProcedureCandidate[]>([]);
  const candidateMapRef = useRef<Map<string, DirectPaymentProcedureCandidate>>(new Map());
  const [loading, setLoading] = useState(false);
  // Track which date has been "expanded" — resets automatically when transferDate changes
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  // R20 — search input, only active in expanded mode
  const [searchQuery, setSearchQuery] = useState("");

  // Refs to avoid stale closures in the fetch effect
  const selectedProcedureIdsRef = useRef(selectedProcedureIds);
  selectedProcedureIdsRef.current = selectedProcedureIds;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  useEffect(() => {
    logger.info("[SelectProceduresPanel] mounted");
  }, []);

  // Merge current procedures into the map so their amounts are available for selection computation
  useEffect(() => {
    if (!currentProcedures) return;
    for (const p of currentProcedures) candidateMapRef.current.set(p.procedure_id, p);
  }, [currentProcedures]);

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

  const isExpanded = expandedDate === transferDate;

  const getPatientName = (patientId: string): string =>
    patients.find((p) => p.id === patientId)?.name ?? patientId;

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

  const handleExpand = () => {
    setSearchQuery("");
    setExpandedDate(transferDate);
  };

  // Exclude current procedures from candidates to avoid duplicate rows
  const currentProcedureIds = new Set(currentProcedures?.map((p) => p.procedure_id) ?? []);

  // R20 — when expanded: filter by patient name, SSN, or procedure date; sort by procedure_date DESC
  const withoutCurrent = candidates.filter((c) => !currentProcedureIds.has(c.procedure_id));
  const filteredCandidates = isExpanded
    ? withoutCurrent
        .filter((c) => {
          if (!searchQuery.trim()) return true;
          const query = searchQuery.trim().toLowerCase();
          const patient = patients.find((p) => p.id === c.patient_id);
          return (
            patient?.name?.toLowerCase().includes(query) ||
            patient?.ssn?.toLowerCase().includes(query) ||
            c.procedure_date.includes(query)
          );
        })
        .sort((a, b) => b.procedure_date.localeCompare(a.procedure_date))
    : withoutCurrent;

  return {
    loading,
    isExpanded,
    searchQuery,
    setSearchQuery,
    filteredCandidates,
    getPatientName,
    toggleProcedure,
    handleExpand,
  };
}

import { useEffect, useState } from "react";
import type { FundWireProcedureCandidate } from "@/bindings";
import { logger } from "@/infra/logger";
import { getProcedureWindowDays } from "@/infra/settings/store";
import { getOpenProceduresOfFund } from "../gateway";

const DAY_MS = 24 * 60 * 60 * 1000;

interface UseSelectOpenProceduresPanelProps {
  fundId: string;
  selectedProcedureIds: string[];
  onSelectionChange: (procedureIds: string[], totalAmountMillis: number) => void;
  /** Injected clock for the display window (tests); defaults to the real one. */
  now?: Date;
}

/**
 * #712 — the open procedures of the chosen fund (BSM-050), listed as the import's
 * « Rapprocher » lists them: in the backend's order, those older than the settings'
 * display window behind « show older » (a ticked one always shows). Fetches again when
 * the fund changes.
 */
export function useSelectOpenProceduresPanel({
  fundId,
  selectedProcedureIds,
  onSelectionChange,
  now,
}: UseSelectOpenProceduresPanelProps) {
  const [candidates, setCandidates] = useState<FundWireProcedureCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [showOlder, setShowOlder] = useState(false);
  const windowDays = getProcedureWindowDays();

  useEffect(() => {
    logger.info("[SelectOpenProceduresPanel] mounted");
  }, []);

  useEffect(() => {
    setShowOlder(false);
    if (!fundId) {
      setCandidates([]);
      return;
    }
    let isMounted = true;
    setLoading(true);
    getOpenProceduresOfFund(fundId)
      .then((result) => {
        if (!isMounted) return;
        if (result.success) {
          setCandidates(result.data);
        } else {
          logger.error("[SelectOpenProceduresPanel] fetch failed", { code: result.error.code });
          setCandidates([]);
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [fundId]);

  const toggleProcedure = (procedureId: string) => {
    const ids = selectedProcedureIds.includes(procedureId)
      ? selectedProcedureIds.filter((id) => id !== procedureId)
      : [...selectedProcedureIds, procedureId];
    // The button's amount; the backend computes the wire's own (BSM-051).
    const total = candidates
      .filter((c) => ids.includes(c.procedure_id))
      .reduce((sum, c) => sum + c.billed_amount, 0);
    onSelectionChange(ids, total);
  };

  // The display window: what to show first, not which procedures are open.
  const cutoff = (now ?? new Date()).getTime() - windowDays * DAY_MS;
  const windowed = candidates.filter(
    (c) =>
      selectedProcedureIds.includes(c.procedure_id) ||
      new Date(`${c.procedure_date}T00:00:00.000Z`).getTime() >= cutoff,
  );
  const visible = showOlder ? candidates : windowed;

  return {
    loading,
    windowDays,
    visible,
    hasCandidates: candidates.length > 0,
    hasOlder: !showOlder && windowed.length < candidates.length,
    showOlderProcedures: () => setShowOlder(true),
    toggleProcedure,
  };
}

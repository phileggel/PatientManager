import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProcedureOrchestrationError } from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";
import { logger } from "@/infra/logger";
import * as gateway from "../api/gateway";
import { markOverdueRows, type ProcedureRow } from "../model";
import { toProcedureRow } from "../model/procedure-row.mapper";
import { formatProcedureOrchestrationError } from "../shared/presenter";

const TAG = "[useProcedureData]";

export function useProcedureData() {
  const { t } = useTranslation("procedure");
  const patients = useCacheStore((state) => state.patients);
  const funds = useCacheStore((state) => state.funds);
  const procedureTypes = useCacheStore((state) => state.procedureTypes);

  const [initialRows, setInitialRows] = useState<ProcedureRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Store the typed error; the consumer translates at render (F27 Layer 4) so
  // the load effect stays independent of the i18n `t` identity.
  const [error, setError] = useState<ProcedureOrchestrationError | null>(null);

  const errorMessage = useMemo(() => {
    if (!error) return null;
    const { key, params } = formatProcedureOrchestrationError(error);
    return t(key, params);
  }, [error, t]);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      const result = await gateway.readAllProcedures();

      if (!result.success) {
        logger.error(TAG, "Failed to load data", { code: result.error.code });
        setError(result.error);
        setIsLoading(false);
        return;
      }

      const { patients: p, funds: f, procedureTypes: pt } = useCacheStore.getState();
      const mappedRows = result.data.map((proc) =>
        toProcedureRow(proc, { patients: p, funds: f, procedureTypes: pt }),
      );

      // PRO-310 — flag overdue over the full set, before any period filter.
      setInitialRows(markOverdueRows(mappedRows));
      setIsLoading(false);
    };

    loadData();
  }, []);

  const deleteRow = useCallback(async (id: string): Promise<void> => {
    logger.debug(TAG, `deleting row ${id}`);
    const result = await gateway.deleteProcedure(id);
    if (!result.success) {
      // Throw the stable code; the consumer (ProcedurePage) owns the
      // user-facing message. Translating here would be discarded.
      logger.error(TAG, `delete failed for ${id}`, { code: result.error.code });
      throw new Error(result.error.code);
    }
  }, []);

  return {
    patients,
    funds,
    procedureTypes,
    initialRows,
    isLoading,
    error: errorMessage,
    deleteRow,
  };
}

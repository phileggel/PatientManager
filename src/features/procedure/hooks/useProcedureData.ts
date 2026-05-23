import { useCallback, useEffect, useState } from "react";

import { useAppStore } from "@/lib/appStore";
import { logger } from "@/lib/logger";
import * as gateway from "../api/gateway";
import type { ProcedureRow } from "../model";
import { toProcedureRow } from "../model/procedure-row.mapper";

const TAG = "[useProcedureData]";

export function useProcedureData() {
  const patients = useAppStore((state) => state.patients);
  const funds = useAppStore((state) => state.funds);
  const procedureTypes = useAppStore((state) => state.procedureTypes);

  const [initialRows, setInitialRows] = useState<ProcedureRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      const result = await gateway.readAllProcedures();

      if (!result.success) {
        logger.error(TAG, "Failed to load data", { error: result.error });
        setError(result.error);
        setIsLoading(false);
        return;
      }

      const { patients: p, funds: f, procedureTypes: pt } = useAppStore.getState();
      const mappedRows = result.data.map((proc) =>
        toProcedureRow(proc, { patients: p, funds: f, procedureTypes: pt }),
      );

      setInitialRows(mappedRows);
      setIsLoading(false);
    };

    loadData();
  }, []);

  const deleteRow = useCallback(async (id: string): Promise<void> => {
    logger.debug(TAG, `deleting row ${id}`);
    const result = await gateway.deleteProcedure(id);
    if (!result.success) {
      logger.error(TAG, `delete failed for ${id}`, { error: result.error });
      throw new Error(result.error);
    }
  }, []);

  return {
    patients,
    funds,
    procedureTypes,
    initialRows,
    isLoading,
    error,
    deleteRow,
  };
}

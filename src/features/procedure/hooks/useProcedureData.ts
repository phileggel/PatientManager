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
      try {
        setIsLoading(true);
        setError(null);

        const rawProcedures = await gateway.readAllProcedures();

        const { patients: p, funds: f, procedureTypes: pt } = useAppStore.getState();
        const mappedRows = rawProcedures.map((proc) =>
          toProcedureRow(proc, { patients: p, funds: f, procedureTypes: pt }),
        );

        setInitialRows(mappedRows);
      } catch (err) {
        logger.error(TAG, "Failed to load data", { error: err });
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const deleteRow = useCallback(async (id: string): Promise<void> => {
    logger.debug(TAG, `deleting row ${id}`);
    await gateway.deleteProcedure(id);
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

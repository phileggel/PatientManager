import { useCallback, useEffect, useState } from "react";

import { useAppStore } from "@/lib/appStore";
import { logger } from "@/lib/logger";
import * as gateway from "../api/gateway";
import * as procedureService from "../api/procedureService";
import type { ProcedureRow } from "../model";
import { toProcedureRow } from "../model/procedure-row.mapper";
import type * as form from "../ui/form";

const TAG = "[useProcedureData]";

export function useProcedureData() {
  // Single source of truth: Zustand store (kept in sync by useAppInit via Tauri events)
  const patients = useAppStore((state) => state.patients);
  const funds = useAppStore((state) => state.funds);
  const procedureTypes = useAppStore((state) => state.procedureTypes);

  const [initialRows, setInitialRows] = useState<ProcedureRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Chargement Initial ---
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const rawProcedures = await gateway.readAllProcedures();

        // Read reference data from store at call time (non-reactive read)
        const { patients: p, funds: f, procedureTypes: pt } = useAppStore.getState();
        const mappedRows = rawProcedures.map((proc) =>
          toProcedureRow(proc, { patients: p, funds: f, procedureTypes: pt }),
        );

        setInitialRows(mappedRows);
      } catch (err) {
        logger.error(TAG, "Failed to load data", err);
        setError(err instanceof Error ? err.message : "Erreur de chargement");
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const handleSaveNewPatient = useCallback(async (data: form.CreatePatientFormData) => {
    logger.debug(TAG, data);
    // Store updated by backend Tauri event via useAppInit
    return await gateway.createNewPatient(data.name, data.ssn || null);
  }, []);

  const handleSaveNewFund = useCallback(async (data: form.CreateFundFormData) => {
    logger.debug(TAG, data);
    // Store updated by backend Tauri event via useAppInit
    return await gateway.createNewFund(data.fundIdentifier, data.name);
  }, []);

  const handleSaveNewProcedureType = useCallback(async (data: form.CreateProcedureTypeFormData) => {
    logger.debug(TAG, data);
    // Store updated by backend Tauri event via useAppInit
    return await gateway.createNewProcedureType(
      data.name,
      data.defaultAmount != null ? Math.round(data.defaultAmount * 1000) : null,
      null,
    );
  }, []);

  const handleSaveNewRow = useCallback(
    async (newRow: ProcedureRow): Promise<ProcedureRow> => {
      logger.debug(TAG, newRow.rowId);

      if (!newRow.patientId || !newRow.procedureTypeId || !newRow.procedureDate) {
        throw new Error("Données manquantes : création refusée.");
      }

      const savedProcedure = await gateway.addProcedure(
        newRow.patientId,
        newRow.fundId || null,
        newRow.procedureTypeId,
        newRow.procedureDate,
        newRow.procedureAmount != null ? Math.round(newRow.procedureAmount * 1000) : null,
      );

      return toProcedureRow(savedProcedure, { patients, funds, procedureTypes });
    },
    [patients, funds, procedureTypes],
  );

  const handleUpdateRow = useCallback(
    async (row: ProcedureRow): Promise<ProcedureRow> => {
      logger.debug(TAG, row.rowId);

      if (!row.id || !row.patientId || !row.procedureTypeId || !row.procedureDate) {
        throw new Error("Données manquantes. Update refusé.");
      }

      const procedure = {
        id: row.id,
        patient_id: row.patientId,
        fund_id: row.fundId,
        procedure_type_id: row.procedureTypeId,
        procedure_date: row.procedureDate,
        procedure_amount:
          row.procedureAmount != null ? Math.round(row.procedureAmount * 1000) : null,
        payment_method: row.paymentMethod || "None",
        confirmed_payment_date: row.confirmedPaymentDate || null,
        actual_payment_amount:
          row.actualPaymentAmount != null ? Math.round(row.actualPaymentAmount * 1000) : null,
        payment_status: row.status || "NONE",
      };

      const updatedProcedure = await gateway.updateProcedure(procedure);

      return toProcedureRow(updatedProcedure, { patients, funds, procedureTypes });
    },
    [patients, funds, procedureTypes],
  );

  const handleDeleteRow = useCallback(async (id: string): Promise<void> => {
    logger.debug(TAG, `deleting row ${id}`);

    const result = await procedureService.deleteProcedure(id);
    if (!result.success) {
      throw new Error(result.error || "Failed to delete procedure");
    }
  }, []);

  return {
    patients,
    funds,
    procedureTypes,
    initialRows,
    isLoading,
    error,
    handlers: {
      savePatient: handleSaveNewPatient,
      saveFund: handleSaveNewFund,
      saveProcedureType: handleSaveNewProcedureType,
      saveRow: handleSaveNewRow,
      updateRow: handleUpdateRow,
      deleteRow: handleDeleteRow,
    },
  };
}

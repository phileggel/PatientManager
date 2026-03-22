/**
 * ProcedureTypeMappingStep - Maps each unique amount from the parsed Excel to a procedure type.
 *
 * Sources: procedureMappings + procedureTypes (props), saved amount mappings (gateway).
 * Saves the user's choices to the gateway on confirm (fire-and-forget) before calling onMappingComplete.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProcedureType } from "@/bindings";
import { logger } from "@/lib/logger";
import { Button } from "@/ui/components/button";
import { getExcelAmountMappings, saveExcelAmountMappings } from "../../api/gateway";
import { CreateProcedureTypeModal } from "./CreateProcedureTypeModal";

interface ProcedureMapping {
  tmp_id: string;
  amount: number;
}

interface ProcedureTypeMappingStepProps {
  procedureMappings: ProcedureMapping[];
  procedureTypes: ProcedureType[];
  onMappingComplete: (mapping: Record<string, string>) => void;
  isLoading?: boolean;
}

interface MappingState {
  [tmpId: string]: string; // procedure_type_tmp_id -> procedure_type_id
}

const IMPORTED_FROM_EXCEL_ID = "imported-from-excel";

export function ProcedureTypeMappingStep({
  procedureMappings,
  procedureTypes,
  onMappingComplete,
  isLoading = false,
}: ProcedureTypeMappingStepProps) {
  const { t } = useTranslation("excel-import");
  const [mapping, setMapping] = useState<MappingState>({});
  const [showNewTypeModal, setShowNewTypeModal] = useState<{
    tmpId: string;
    amount: number;
  } | null>(null);
  const [availableTypes, setAvailableTypes] = useState<ProcedureType[]>(procedureTypes);

  // null = still loading, {} = loaded (empty or populated)
  const [savedAmountMappings, setSavedAmountMappings] = useState<Record<number, string> | null>(
    null,
  );

  useEffect(() => {
    logger.info("[ProcedureTypeMappingStep] Component mounted");
    // Backend returns only valid mappings (deleted types are already filtered out)
    getExcelAmountMappings().then((result) => {
      const byAmount: Record<number, string> = {};
      if (result.success && result.data) {
        for (const m of result.data) {
          byAmount[m.amount] = m.procedure_type_id;
        }
      }
      setSavedAmountMappings(byAmount);
    });
  }, []);

  // Initialize defaults once saved mappings are loaded.
  // Saved mapping takes priority; falls back to first available type or imported-from-excel.
  // Uses functional update to preserve mappings set by the user (e.g. newly created types).
  useEffect(() => {
    if (savedAmountMappings === null) return; // wait for gateway response

    const fallbackTypeId =
      availableTypes.length > 0
        ? (availableTypes[0]?.id ?? IMPORTED_FROM_EXCEL_ID)
        : IMPORTED_FROM_EXCEL_ID;

    setMapping((prev) => {
      const updated = { ...prev };
      for (const procMapping of procedureMappings) {
        if (!updated[procMapping.tmp_id]) {
          const saved = savedAmountMappings[procMapping.amount];
          updated[procMapping.tmp_id] = saved ?? fallbackTypeId;
        }
      }
      return updated;
    });
  }, [procedureMappings, availableTypes, savedAmountMappings]);

  // Update available types when procedureTypes change
  useEffect(() => {
    setAvailableTypes(procedureTypes);
  }, [procedureTypes]);

  const handleMappingChange = (tmpId: string, amount: number, procedureTypeId: string) => {
    if (procedureTypeId === "create-new") {
      setShowNewTypeModal({ tmpId, amount });
    } else {
      setMapping((prev) => ({
        ...prev,
        [tmpId]: procedureTypeId,
      }));
    }
  };

  const handleTypeCreated = (newType: ProcedureType) => {
    setAvailableTypes((prev) => [...prev, newType]);

    if (showNewTypeModal !== null) {
      setMapping((prev) => ({
        ...prev,
        [showNewTypeModal.tmpId]: newType.id,
      }));
    }

    setShowNewTypeModal(null);
  };

  const handleConfirm = () => {
    // Persist choices for future imports (fire-and-forget)
    const toSave = procedureMappings.map((pm) => ({
      amount: pm.amount,
      procedure_type_id: mapping[pm.tmp_id] ?? IMPORTED_FROM_EXCEL_ID,
    }));
    saveExcelAmountMappings(toSave);

    onMappingComplete(mapping);
  };

  return (
    <div className="space-y-6">
      <div className="p-4 bg-m3-primary/10 rounded-xl">
        <h3 className="font-semibold text-m3-primary">{t("mapping.infoTitle")}</h3>
        <p className="text-sm text-m3-on-surface-variant mt-2">{t("mapping.infoDescription")}</p>
      </div>

      {/* Mapping table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-m3-surface-container-high">
              <th className="px-4 py-3 text-left font-semibold text-neutral-90">
                {t("mapping.amount")}
              </th>
              <th className="px-4 py-3 text-left font-semibold text-neutral-90">
                {t("mapping.procedureType")}
              </th>
            </tr>
          </thead>
          <tbody>
            {procedureMappings.map((procMapping) => {
              const mappedTypeId = mapping[procMapping.tmp_id] || IMPORTED_FROM_EXCEL_ID;

              return (
                <tr key={procMapping.tmp_id} className="hover:bg-m3-surface-variant/20">
                  <td className="px-4 py-3 font-mono text-neutral-90">
                    {(procMapping.amount / 1000).toFixed(2)} €
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={mappedTypeId}
                        onChange={(e) =>
                          handleMappingChange(
                            procMapping.tmp_id,
                            procMapping.amount,
                            e.target.value,
                          )
                        }
                        className="flex-1 px-3 py-2 border border-m3-outline-variant rounded-xl bg-m3-surface text-m3-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-m3-primary/30"
                        disabled={isLoading || showNewTypeModal !== null}
                      >
                        <option value={IMPORTED_FROM_EXCEL_ID}>
                          {t("mapping.importedFromExcel")}
                        </option>
                        {availableTypes.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.name} ({(procMapping.amount / 1000).toFixed(2)} €)
                          </option>
                        ))}
                        <option value="create-new">{t("mapping.createNew")}</option>
                      </select>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal for creating new type */}
      <CreateProcedureTypeModal
        isOpen={showNewTypeModal !== null}
        defaultAmount={(showNewTypeModal?.amount ?? 0) / 1000}
        onClose={() => setShowNewTypeModal(null)}
        onSuccess={handleTypeCreated}
      />

      {/* Confirmation */}
      <div className="flex gap-2 justify-end pt-4">
        <Button onClick={handleConfirm} disabled={isLoading || showNewTypeModal !== null}>
          {isLoading ? t("mapping.processing") : t("mapping.continue")}
        </Button>
      </div>
    </div>
  );
}

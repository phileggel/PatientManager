import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProcedureType } from "@/bindings";
import { logger } from "@/lib/logger";
import { Button } from "@/ui/components/button";
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

  useEffect(() => {
    logger.info("[ProcedureTypeMappingStep] Component mounted");
  }, []);
  const [showNewTypeModal, setShowNewTypeModal] = useState<{
    tmpId: string;
    amount: number;
  } | null>(null);
  const [availableTypes, setAvailableTypes] = useState<ProcedureType[]>(procedureTypes);

  // Initialize mapping with first procedure type as default for unmapped entries only.
  // Uses functional update to preserve existing mappings (e.g. newly created types).
  useEffect(() => {
    const defaultTypeId =
      availableTypes.length > 0
        ? availableTypes[0]?.id || IMPORTED_FROM_EXCEL_ID
        : IMPORTED_FROM_EXCEL_ID;
    setMapping((prev) => {
      const updated = { ...prev };
      for (const procMapping of procedureMappings) {
        if (!updated[procMapping.tmp_id]) {
          updated[procMapping.tmp_id] = defaultTypeId;
        }
      }
      return updated;
    });
  }, [procedureMappings, availableTypes]);

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
    // Add to available types
    setAvailableTypes((prev) => [...prev, newType]);

    // Auto-map the tmp_id to this new type
    if (showNewTypeModal !== null) {
      setMapping((prev) => ({
        ...prev,
        [showNewTypeModal.tmpId]: newType.id,
      }));
    }

    // Close modal
    setShowNewTypeModal(null);
  };

  const handleConfirm = () => {
    onMappingComplete(mapping);
  };

  return (
    <div className="space-y-6">
      <div className="p-4 bg-primary-10 border border-primary-20 rounded">
        <h3 className="font-semibold text-primary-70">{t("mapping.infoTitle")}</h3>
        <p className="text-sm text-primary-60 mt-2">{t("mapping.infoDescription")}</p>
      </div>

      {/* Mapping table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-neutral-20 border-b border-neutral-30">
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
                <tr
                  key={procMapping.tmp_id}
                  className="border-b border-neutral-20 hover:bg-neutral-5"
                >
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
                        className="flex-1 px-3 py-2 border border-neutral-30 rounded bg-white text-neutral-90 text-sm focus:outline-none focus:ring-2 focus:ring-primary-60"
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

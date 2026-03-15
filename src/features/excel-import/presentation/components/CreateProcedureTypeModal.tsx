import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProcedureType } from "@/bindings";
import * as procedureTypeGateway from "@/features/procedure-type/gateway";
import { logger } from "@/lib/logger";
import { Button, FormModal } from "@/ui/components";

interface CreateProcedureTypeModalProps {
  isOpen: boolean;
  defaultAmount: number;
  onClose: () => void;
  onSuccess: (newType: ProcedureType) => void;
}

/**
 * CreateProcedureTypeModal: Modal for creating a new procedure type
 *
 * Used during Excel import to allow users to create missing procedure types
 * on-the-fly when mapping procedure amounts.
 *
 * Uses FormModal pattern with 2 fields:
 * - Name (required)
 * - Default Amount (pre-filled)
 */
export function CreateProcedureTypeModal({
  isOpen,
  defaultAmount,
  onClose,
  onSuccess,
}: CreateProcedureTypeModalProps) {
  const { t } = useTranslation("excel-import");
  const [newTypeName, setNewTypeName] = useState("");

  const [newTypeDefaultAmount, setNewTypeDefaultAmount] = useState(defaultAmount);

  useEffect(() => {
    logger.info("[CreateProcedureTypeModal] Component mounted");
  }, []);

  // Sync amount field when the modal opens for a different row
  useEffect(() => {
    if (isOpen) {
      setNewTypeDefaultAmount(defaultAmount);
    }
  }, [isOpen, defaultAmount]);
  const [isCreatingType, setIsCreatingType] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setNewTypeName("");
    setNewTypeDefaultAmount(defaultAmount);
    setError(null);
    onClose();
  };

  const handleCreate = async () => {
    if (!newTypeName.trim()) {
      setError(t("createTypeModal.nameRequired"));
      return;
    }

    setIsCreatingType(true);
    try {
      const result = await procedureTypeGateway.addProcedureType(
        newTypeName,
        Math.round(newTypeDefaultAmount * 1000),
        undefined,
      );

      if (result.success && result.data) {
        logger.info("Procedure type created", { id: result.data.id, name: result.data.name });
        onSuccess(result.data);
        handleClose();
      } else {
        setError(result.error || t("createTypeModal.error"));
        logger.error("Failed to create procedure type", { error: result.error });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      logger.error("Exception creating procedure type", { error: errorMsg });
    } finally {
      setIsCreatingType(false);
    }
  };

  return (
    <FormModal
      isOpen={isOpen}
      onClose={handleClose}
      title={t("createTypeModal.title")}
      maxWidth="max-w-md"
      maxHeight="max-h-[80vh]"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={handleClose} disabled={isCreatingType}>
            {t("createTypeModal.cancel")}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={isCreatingType || !newTypeName.trim()}
            loading={isCreatingType}
          >
            {isCreatingType ? t("createTypeModal.creating") : t("createTypeModal.create")}
          </Button>
        </div>
      }
    >
      {error && (
        <div className="p-3 bg-error-20 border border-error-30 rounded text-error-70 text-sm">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="type-name" className="block text-sm font-medium text-neutral-90 mb-2">
          {t("createTypeModal.nameLabel")}
        </label>
        <input
          id="type-name"
          type="text"
          value={newTypeName}
          onChange={(e) => setNewTypeName(e.target.value)}
          placeholder={t("createTypeModal.namePlaceholder")}
          className="w-full px-3 py-2 border border-neutral-30 rounded text-neutral-90 text-sm focus:outline-none focus:ring-2 focus:ring-primary-60"
          disabled={isCreatingType}
        />
      </div>

      <div>
        <label htmlFor="type-amount" className="block text-sm font-medium text-neutral-90 mb-2">
          {t("createTypeModal.amountLabel")}
        </label>
        <input
          id="type-amount"
          type="number"
          step="0.01"
          value={newTypeDefaultAmount}
          onChange={(e) => setNewTypeDefaultAmount(parseFloat(e.target.value) || 0)}
          className="w-full px-3 py-2 border border-neutral-30 rounded text-neutral-90 text-sm focus:outline-none focus:ring-2 focus:ring-primary-60"
          disabled={isCreatingType}
        />
      </div>
    </FormModal>
  );
}

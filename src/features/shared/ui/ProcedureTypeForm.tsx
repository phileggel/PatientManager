import { Dialog } from "@headlessui/react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { useCreateEntityForm } from "@/features/procedure/hooks/useCreateEntityForm";
import { logger } from "@/lib/logger";
import { Button, InputLegacy } from "@/ui/components";

export interface CreateProcedureTypeFormData {
  name: string;
  defaultAmount: number;
  category?: string;
}

interface CreateProcedureTypeFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateProcedureTypeFormData) => Promise<void>;
  initialQuery?: string;
  initialDefaultAmount?: number;
}

/**
 * Form fields for procedure type creation
 */
type ProcedureTypeFields = {
  name: string;
  defaultAmount: string;
  category: string;
};

/**
 * CreateProcedureTypeForm - Presentational component for creating procedure types
 *
 * Business logic is handled by useCreateEntityForm hook.
 * This component focuses solely on rendering UI.
 */
export function CreateProcedureTypeForm({
  isOpen,
  onClose,
  onSubmit,
  initialQuery,
  initialDefaultAmount,
}: CreateProcedureTypeFormProps) {
  const { t } = useTranslation("procedure");
  const { t: tc } = useTranslation("common");

  useEffect(() => {
    logger.info("[CreateProcedureTypeForm] Component mounted");
  }, []);

  const form = useCreateEntityForm<ProcedureTypeFields, CreateProcedureTypeFormData>({
    entityName: "procedure type",
    initialFields: {
      name: "",
      defaultAmount: initialDefaultAmount ? String(initialDefaultAmount) : "",
      category: "",
    },
    initialQuery,
    queryField: "name",
    validator: (fields) => {
      const errors: Record<string, string> = {};

      if (!fields.name.trim()) {
        errors.name = t("createProcedureType.nameRequired");
      }

      if (!fields.defaultAmount.trim()) {
        errors.defaultAmount = t("createProcedureType.amountRequired");
      } else {
        const amount = parseFloat(fields.defaultAmount);
        if (Number.isNaN(amount) || amount < 0) {
          errors.defaultAmount = t("createProcedureType.amountInvalid");
        }
      }

      return errors;
    },
    toFormData: (fields) => ({
      name: fields.name.trim(),
      defaultAmount: parseFloat(fields.defaultAmount),
      category: fields.category.trim() || undefined,
    }),
    onSubmit,
    onClose,
  });

  // Update default amount when initialDefaultAmount changes
  useEffect(() => {
    if (initialDefaultAmount !== undefined) {
      form.updateField("defaultAmount", String(initialDefaultAmount));
    }
  }, [initialDefaultAmount, form]);

  return (
    <Dialog
      open={isOpen}
      onClose={form.handleClose}
      className="fixed inset-0 z-1000 flex items-center justify-center"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 animate-fadeIn" />

      {/* Dialog Panel */}
      <div className="relative z-1001 w-[90%] max-w-150">
        <Dialog.Panel className="bg-surface rounded-xl shadow-elevation-4 overflow-hidden animate-slideUp">
          <div className="p-6 border-b border-neutral-30 bg-neutral-10">
            <Dialog.Title className="m-0 text-xl font-medium leading-7 text-neutral-90">
              {t("createProcedureType.title")}
            </Dialog.Title>
          </div>

          <form onSubmit={form.handleSubmit} className="flex flex-col h-full">
            <div className="p-6 flex flex-col gap-4 max-h-100 overflow-y-auto">
              <InputLegacy
                id="procedure-type-name"
                label={t("createProcedureType.nameLabel")}
                type="text"
                value={form.fields.name}
                onChange={(e) => form.updateField("name", e.target.value)}
                placeholder={t("createProcedureType.namePlaceholder")}
                required
                error={form.errors.name}
                disabled={form.isSubmitting}
                autoFocus
              />

              <InputLegacy
                id="procedure-type-amount"
                label={t("createProcedureType.amountLabel")}
                type="number"
                step="0.01"
                min="0"
                value={form.fields.defaultAmount}
                onChange={(e) => form.updateField("defaultAmount", e.target.value)}
                placeholder={t("createProcedureType.amountPlaceholder")}
                required
                error={form.errors.defaultAmount}
                disabled={form.isSubmitting}
              />

              <InputLegacy
                id="procedure-type-category"
                label={t("createProcedureType.categoryLabel")}
                type="text"
                value={form.fields.category}
                onChange={(e) => form.updateField("category", e.target.value)}
                placeholder={t("createProcedureType.categoryPlaceholder")}
                disabled={form.isSubmitting}
              />

              {form.errors.submit && (
                <div className="p-3 bg-error-20 border border-error-60 rounded text-error-90 text-xs font-medium">
                  {form.errors.submit}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-neutral-30 flex justify-end gap-3 bg-neutral-0">
              <Button
                type="button"
                variant="secondary"
                onClick={form.handleClose}
                disabled={form.isSubmitting}
              >
                {tc("action.cancel")}
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={form.isSubmitting}
                disabled={!form.fields.name.trim() || !form.fields.defaultAmount.trim()}
              >
                {t("createProcedureType.submit")}
              </Button>
            </div>
          </form>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}

import { Dialog } from "@headlessui/react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { useCreateEntityForm } from "@/features/procedure/hooks/useCreateEntityForm";
import { logger } from "@/lib/logger";
import { Button, InputLegacy } from "@/ui/components";

export interface CreateFundFormData {
  fundIdentifier: string;
  name: string;
}

interface CreateFundFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateFundFormData) => Promise<void>;
  initialQuery?: string;
}

/**
 * Form fields for fund creation
 */
type FundFields = {
  fundIdentifier: string;
  name: string;
};

/**
 * CreateFundForm - Presentational component for creating funds
 *
 * Business logic is handled by useCreateEntityForm hook.
 * This component focuses solely on rendering UI.
 */
export function CreateFundForm({ isOpen, onClose, onSubmit, initialQuery }: CreateFundFormProps) {
  const { t } = useTranslation("procedure");
  const { t: tc } = useTranslation("common");

  useEffect(() => {
    logger.info("[CreateFundForm] Component mounted");
  }, []);

  const form = useCreateEntityForm<FundFields, CreateFundFormData>({
    entityName: "fund",
    initialFields: {
      fundIdentifier: "",
      name: "",
    },
    initialQuery,
    queryField: "fundIdentifier",
    validator: (fields) => {
      const errors: Record<string, string> = {};
      if (!fields.fundIdentifier.trim()) {
        errors.fundIdentifier = t("createFund.identifierRequired");
      }
      if (!fields.name.trim()) {
        errors.name = t("createFund.nameRequired");
      }
      return errors;
    },
    toFormData: (fields) => ({
      fundIdentifier: fields.fundIdentifier.trim(),
      name: fields.name.trim(),
    }),
    onSubmit,
    onClose,
  });

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
              {t("createFund.title")}
            </Dialog.Title>
          </div>

          <form onSubmit={form.handleSubmit} className="flex flex-col h-full">
            <div className="p-6 flex flex-col gap-4 max-h-100 overflow-y-auto">
              <InputLegacy
                id="fund-identifier"
                label={t("createFund.identifierLabel")}
                type="text"
                value={form.fields.fundIdentifier}
                onChange={(e) => form.updateField("fundIdentifier", e.target.value)}
                placeholder={t("createFund.identifierPlaceholder")}
                required
                error={form.errors.fundIdentifier}
                disabled={form.isSubmitting}
                autoFocus
              />

              <InputLegacy
                id="fund-name"
                label={t("createFund.nameLabel")}
                type="text"
                value={form.fields.name}
                onChange={(e) => form.updateField("name", e.target.value)}
                placeholder={t("createFund.namePlaceholder")}
                required
                error={form.errors.name}
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
                disabled={!form.fields.fundIdentifier.trim() || !form.fields.name.trim()}
              >
                {t("createFund.submit")}
              </Button>
            </div>
          </form>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}

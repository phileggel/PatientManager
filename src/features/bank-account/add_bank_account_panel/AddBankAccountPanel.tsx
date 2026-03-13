import { Landmark } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSnackbar } from "@/core/snackbar";
import { logger } from "@/lib/logger";
import { Button } from "@/ui/components";
import { BankAccountForm } from "../shared/BankAccountForm";
import { useAddBankAccountPanel } from "./useAddBankAccountPanel";

/**
 * AddBankAccountPanel - Smart Component
 *
 * Fully self-contained:
 * - Manages form state, validation, and submission
 * - Uses snackbar for feedback (no callbacks)
 * - Backend publishes BankAccountUpdated event on create
 * - useAppInit listens for backend event, refetches data, updates store
 * - Components re-render automatically from store update
 * - No props needed - completely independent
 */
export function AddBankAccountPanel() {
  const { t } = useTranslation("bank");
  const { showSnackbar } = useSnackbar();
  const { formData, errors, loading, handleChange, handleSubmit } =
    useAddBankAccountPanel(showSnackbar);

  useEffect(() => {
    logger.info("[AddBankAccountPanel] Panel mounted");
  }, []);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <fieldset disabled={loading} className="disabled:opacity-50">
        <BankAccountForm
          formData={formData}
          errors={errors}
          handleChange={handleChange}
          idPrefix="add-bank-account"
        />
      </fieldset>
      <Button type="submit" variant="primary" loading={loading} icon={<Landmark size={18} />}>
        {loading ? t("account.creating") : t("account.createButton")}
      </Button>
    </form>
  );
}

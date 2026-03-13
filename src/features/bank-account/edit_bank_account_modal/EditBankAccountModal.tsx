/**
 * EditBankAccountModal - Smart Component
 *
 * Self-contained with lifecycle callback:
 * - Takes bankAccount prop (minimal, necessary) + onClose callback
 * - Manages modal state internally
 * - Uses snackbar for feedback (no error callbacks)
 * - Backend publishes BankAccountUpdated event on update
 * - useAppInit listens for backend event, refetches data, updates store
 * - Components re-render automatically from store update
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BankAccount } from "@/bindings";
import { useSnackbar } from "@/core/snackbar";
import { BankAccountForm } from "@/features/bank-account/shared/BankAccountForm";
import { logger } from "@/lib/logger";
import { Button, Dialog } from "@/ui/components";
import { useEditBankAccountModal } from "./useEditBankAccountModal";

interface EditBankAccountModalProps {
  bankAccount: BankAccount | null;
  onClose: () => void;
}

export function EditBankAccountModal({ bankAccount, onClose }: EditBankAccountModalProps) {
  const { t } = useTranslation("bank");
  const { showSnackbar } = useSnackbar();
  const [isOpen, setIsOpen] = useState(false);

  // Show modal when bankAccount is provided
  useEffect(() => {
    if (bankAccount) {
      setIsOpen(true);
      logger.info("[EditBankAccountModal] Modal opened", {
        bankAccountId: bankAccount.id,
        bankAccountName: bankAccount.name,
      });
    }
  }, [bankAccount]);

  const handleClose = () => {
    setIsOpen(false);
    onClose();
  };

  const hookResult = useEditBankAccountModal(bankAccount, showSnackbar, handleClose);

  if (!isOpen || !bankAccount) return null;

  const { formData, errors, loading, handleChange, handleSubmit } = hookResult;

  const actions = (
    <>
      <Button type="button" onClick={handleClose} variant="secondary" disabled={loading}>
        {t("account.edit.cancel")}
      </Button>
      <Button type="submit" form="edit-bank-account-form" variant="primary" loading={loading}>
        {loading ? t("account.edit.updating") : t("account.edit.update")}
      </Button>
    </>
  );

  return (
    <Dialog isOpen={isOpen} onClose={handleClose} title={t("account.edit.title")} actions={actions}>
      <form id="edit-bank-account-form" onSubmit={handleSubmit} className="flex flex-col gap-6">
        <fieldset disabled={loading} className="disabled:opacity-50">
          <BankAccountForm
            formData={formData}
            errors={errors}
            handleChange={handleChange}
            idPrefix="edit-bank-account"
          />
        </fieldset>
      </form>
    </Dialog>
  );
}

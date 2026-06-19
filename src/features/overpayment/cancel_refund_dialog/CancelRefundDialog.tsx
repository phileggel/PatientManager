/**
 * CancelRefundDialog — confirmation dialog for cancelling an overpayment refund (REF-210).
 *
 * Receives `sourceProcedureId` — the ID of the original overpaid procedure.
 * The cancel cascade is triggered via `gateway.cancelOverpayment()`.
 *
 * Uses Dialog directly (not ConfirmationDialog) so the confirm button can carry
 * a loading state — ConfirmationDialog calls onCancel synchronously on confirm,
 * which would close the dialog before the async operation completes.
 */

import { useTranslation } from "react-i18next";
import { Button, Dialog } from "@/ui/components";
import { useCancelRefundDialog } from "./useCancelRefundDialog";

interface CancelRefundDialogProps {
  isOpen: boolean;
  sourceProcedureId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function CancelRefundDialog({
  isOpen,
  sourceProcedureId,
  onClose,
  onSuccess,
}: CancelRefundDialogProps) {
  const { t } = useTranslation("overpayment");
  const { t: tc } = useTranslation("common");

  const { loading, handleConfirm } = useCancelRefundDialog({
    sourceProcedureId,
    onSuccess,
    onClose,
  });

  const actions = (
    <div className="flex items-center justify-end gap-3">
      <Button variant="ghost" onClick={onClose} disabled={loading}>
        {tc("action.cancel")}
      </Button>
      <Button variant="danger" onClick={handleConfirm} loading={loading} disabled={loading}>
        {t("action.cancel_refund")}
      </Button>
    </div>
  );

  return (
    <Dialog
      id="cancel-refund-dialog"
      isOpen={isOpen}
      onClose={onClose}
      title={t("modal.cancel_title")}
      actions={actions}
      disableClose={loading}
    >
      <p className="text-sm">{t("modal.cancel_body")}</p>
    </Dialog>
  );
}

/**
 * useCancelRefundDialog — manages the cancel refund confirmation flow (REF-210).
 */

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { logger } from "@/lib/logger";
import { toastService } from "@/ui/components/snackbar";
import * as gateway from "../gateway";

const TAG = "[useCancelRefundDialog]";

interface UseCancelRefundDialogOptions {
  sourceProcedureId: string;
  onSuccess: () => void;
  onClose: () => void;
}

export function useCancelRefundDialog({
  sourceProcedureId,
  onSuccess,
  onClose,
}: UseCancelRefundDialogOptions) {
  const { t } = useTranslation("overpayment");
  const { t: tc } = useTranslation("common");
  const [loading, setLoading] = useState(false);

  const handleConfirm = useCallback(async () => {
    setLoading(true);
    try {
      const result = await gateway.cancelOverpayment({ source_procedure_id: sourceProcedureId });
      if (result.success) {
        toastService.show("success", t("success.cancelled"));
        onSuccess();
        onClose();
      } else {
        logger.error(`${TAG} Failed to cancel overpayment`, { error: result.error });
        toastService.show("error", result.error ?? t("error.cancel"));
      }
    } catch (error) {
      logger.error(`${TAG} Exception cancelling overpayment`, { error });
      toastService.show("error", error instanceof Error ? error.message : tc("error.unknown"));
    } finally {
      setLoading(false);
    }
  }, [sourceProcedureId, t, tc, onSuccess, onClose]);

  return { loading, handleConfirm };
}

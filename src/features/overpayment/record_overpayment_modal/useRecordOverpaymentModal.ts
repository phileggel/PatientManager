/**
 * useRecordOverpaymentModal — state, validation, and submission for the Record Overpayment flow.
 *
 * REF-030: refundDate must be present and not in the future.
 * REF-040: reason max 255 chars.
 * REF-060: transferType must be CreditCard, Check, or OutgoingWire.
 * REF-070: bankAccountId is required; pre-filled if exactly one account exists.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Procedure } from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";
import { logger } from "@/infra/logger";
import { toastService } from "@/ui/components/snackbar";
import * as gateway from "../gateway";
import { formatOverpaymentError } from "../shared/presenter";

const TAG = "[useRecordOverpaymentModal]";

interface FieldErrors {
  refundDate?: string;
  transferType?: string;
  bankAccountId?: string;
  reason?: string;
}

interface UseRecordOverpaymentModalOptions {
  sourceProcedure: Procedure;
  onSuccess: () => void;
  onClose: () => void;
}

export function useRecordOverpaymentModal({
  sourceProcedure,
  onSuccess,
  onClose,
}: UseRecordOverpaymentModalOptions) {
  const { t } = useTranslation("overpayment");
  const { t: tc } = useTranslation("common");

  const bankAccounts = useCacheStore((state) => state.bankAccounts);

  const today = new Date().toISOString().split("T")[0] ?? "";

  const [refundDate, setRefundDate] = useState(today);
  const [transferType, setTransferType] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showConfirmation, setShowConfirmation] = useState(false);

  // REF-070: pre-fill bank account if exactly one exists
  useEffect(() => {
    if (bankAccounts.length === 1 && bankAccounts[0]) {
      setBankAccountId(bankAccounts[0].id);
    }
  }, [bankAccounts]);

  const validate = useCallback((): FieldErrors => {
    const errors: FieldErrors = {};

    if (!refundDate) {
      errors.refundDate = t("error.refundDate");
    } else {
      const parsed = new Date(refundDate);
      const todayDate = new Date(today);
      if (parsed > todayDate) {
        errors.refundDate = t("error.refundDate");
      } else if (
        // REF-030: refundDate must not be before the source procedure's confirmed payment date
        sourceProcedure.confirmed_payment_date &&
        refundDate < sourceProcedure.confirmed_payment_date
      ) {
        errors.refundDate = t("error.refundDate");
      }
    }

    if (!transferType) {
      errors.transferType = t("error.paymentMethod");
    }

    if (!bankAccountId) {
      errors.bankAccountId = t("error.bankAccount");
    }

    if (reason.length > 255) {
      errors.reason = t("error.reasonTooLong");
    }

    return errors;
  }, [
    refundDate,
    transferType,
    bankAccountId,
    reason,
    t,
    today,
    sourceProcedure.confirmed_payment_date,
  ]);

  const handleSubmit = useCallback(() => {
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setShowConfirmation(true);
  }, [validate]);

  const handleConfirm = useCallback(async () => {
    setLoading(true);
    try {
      const result = await gateway.createOverpayment({
        source_procedure_id: sourceProcedure.id,
        refund_date: refundDate,
        transfer_type: transferType,
        bank_account_id: bankAccountId,
        reason: reason || null,
      });

      if (result.success) {
        toastService.show("success", t("success.created"));
        onSuccess();
        onClose();
      } else {
        logger.error(`${TAG} Failed to create overpayment`, { error: result.error });
        const { key, params } = formatOverpaymentError(result.error);
        toastService.show("error", t(key, params));
      }
    } catch (error) {
      logger.error(`${TAG} Exception creating overpayment`, { error });
      toastService.show("error", error instanceof Error ? error.message : tc("error.unknown"));
    } finally {
      setLoading(false);
      setShowConfirmation(false);
    }
  }, [
    sourceProcedure.id,
    refundDate,
    transferType,
    bankAccountId,
    reason,
    t,
    tc,
    onSuccess,
    onClose,
  ]);

  const handleCancelConfirmation = useCallback(() => {
    setShowConfirmation(false);
  }, []);

  return {
    bankAccounts,
    refundDate,
    setRefundDate,
    transferType,
    setTransferType,
    bankAccountId,
    setBankAccountId,
    reason,
    setReason,
    loading,
    fieldErrors,
    showConfirmation,
    handleSubmit,
    handleConfirm,
    handleCancelConfirmation,
  };
}

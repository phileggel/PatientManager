import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BankTransfer, DirectPaymentProcedureCandidate, FundGroupCandidate } from "@/bindings";
import { toastService } from "@/core/snackbar";
import { logger } from "@/lib/logger";
import {
  getFundGroupsByIds,
  getProceduresByIds,
  getTransferFundGroupIds,
  getTransferProcedureIds,
  updateDirectTransfer,
  updateFundTransfer,
} from "../manual_match/gateway";

/**
 * useEditBankTransferModal — Logic for the EditBankTransferModal component.
 *
 * - Loads linked group/procedure IDs from backend on transfer open (R9, R17)
 * - Fetches current group/procedure candidate data for edit-mode pre-selection (R21)
 * - Handles date and selection changes
 * - Submits update to backend
 */
export function useEditBankTransferModal(transfer: BankTransfer | null, onClose: () => void) {
  const { t } = useTranslation("bank");

  const [transferDate, setTransferDate] = useState<string>("");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedProcedureIds, setSelectedProcedureIds] = useState<string[]>([]);
  const [totalAmountMillis, setTotalAmountMillis] = useState<number>(0);
  const [currentGroups, setCurrentGroups] = useState<FundGroupCandidate[]>([]);
  const [currentProcedures, setCurrentProcedures] = useState<DirectPaymentProcedureCandidate[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const isFund = transfer?.transfer_type === "FUND";

  // Load linked IDs and current candidates when transfer changes
  useEffect(() => {
    if (!transfer) return;

    setTransferDate(transfer.transfer_date);
    setSelectedGroupIds([]);
    setSelectedProcedureIds([]);
    setCurrentGroups([]);
    setCurrentProcedures([]);
    setTotalAmountMillis(transfer.amount);

    const loadLinks = async () => {
      if (transfer.transfer_type === "FUND") {
        const idsResult = await getTransferFundGroupIds(transfer.id);
        if (!idsResult.success || !idsResult.data) {
          logger.error("[useEditBankTransferModal] Failed to load fund group ids", {
            error: idsResult.error,
          });
          return;
        }
        const ids = idsResult.data;
        setSelectedGroupIds(ids);

        if (ids.length > 0) {
          const groupsResult = await getFundGroupsByIds(ids);
          if (groupsResult.success && groupsResult.data) {
            setCurrentGroups(groupsResult.data);
          } else {
            logger.error(
              "[useEditBankTransferModal] Failed to load current groups",
              groupsResult.error,
            );
          }
        }
      } else {
        const idsResult = await getTransferProcedureIds(transfer.id);
        if (!idsResult.success || !idsResult.data) {
          logger.error("[useEditBankTransferModal] Failed to load procedure ids", {
            error: idsResult.error,
          });
          return;
        }
        const ids = idsResult.data;
        setSelectedProcedureIds(ids);

        if (ids.length > 0) {
          const procsResult = await getProceduresByIds(ids);
          if (procsResult.success && procsResult.data) {
            setCurrentProcedures(procsResult.data);
          } else {
            logger.error(
              "[useEditBankTransferModal] Failed to load current procedures",
              procsResult.error,
            );
          }
        }
      }
    };

    loadLinks();
  }, [transfer]);

  const handleFundGroupSelectionChange = (groupIds: string[], totalMillis: number) => {
    setSelectedGroupIds(groupIds);
    setTotalAmountMillis(totalMillis);
  };

  const handleProcedureSelectionChange = (procedureIds: string[], totalMillis: number) => {
    setSelectedProcedureIds(procedureIds);
    setTotalAmountMillis(totalMillis);
  };

  const isValid =
    transferDate.trim() !== "" &&
    (isFund ? selectedGroupIds.length > 0 : selectedProcedureIds.length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!transfer || !isValid) {
      toastService.show("error", t("transfer.edit.errorInvalidForm"));
      return;
    }

    setSubmitting(true);
    try {
      const result = isFund
        ? await updateFundTransfer(transfer.id, transferDate, selectedGroupIds)
        : await updateDirectTransfer(transfer.id, transferDate, selectedProcedureIds);

      if (result.success) {
        toastService.show("success", t("transfer.edit.success"));
        onClose();
      } else {
        toastService.show("error", result.error ?? t("transfer.edit.error"));
      }
    } catch (error) {
      logger.error("[useEditBankTransferModal] Exception", { error });
      toastService.show("error", t("transfer.edit.errorUnknown"));
    } finally {
      setSubmitting(false);
    }
  };

  return {
    transferDate,
    setTransferDate,
    selectedGroupIds,
    selectedProcedureIds,
    totalAmountMillis,
    currentGroups,
    currentProcedures,
    submitting,
    isValid,
    isFund,
    handleFundGroupSelectionChange,
    handleProcedureSelectionChange,
    handleSubmit,
  };
}

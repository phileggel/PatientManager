import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BankEntry, DirectPaymentProcedureCandidate, FundGroupCandidate } from "@/bindings";
import { logger } from "@/infra/logger";
import { toastService } from "@/ui/components/snackbar";
import {
  getFundGroupsByIds,
  getProceduresByIds,
  getTransferFundGroupIds,
  getTransferProcedureIds,
  updateDirectTransfer,
  updateFundTransfer,
} from "../gateway";
import {
  type BankEntryFieldErrorKeys,
  bankEntryFieldErrorKeys,
  formatBankManualMatchError,
} from "../shared/errorPresenter";

/**
 * useEditBankTransferModal — Logic for the EditBankTransferModal component.
 *
 * - Loads linked group/procedure IDs from backend on transfer open (R9, R17)
 * - Fetches current group/procedure candidate data for edit-mode pre-selection (R21)
 * - Handles date and selection changes
 * - Submits update to backend
 */
export function useEditBankTransferModal(transfer: BankEntry | null, onClose: () => void) {
  const { t } = useTranslation("bank");

  const [transferDate, setTransferDateState] = useState<string>("");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedProcedureIds, setSelectedProcedureIds] = useState<string[]>([]);
  const [totalAmountMillis, setTotalAmountMillis] = useState<number>(0);
  const [currentGroups, setCurrentGroups] = useState<FundGroupCandidate[]>([]);
  const [currentProcedures, setCurrentProcedures] = useState<DirectPaymentProcedureCandidate[]>([]);
  // #642 — the selection as loaded, to tell an edited form from an untouched one.
  const [initialIds, setInitialIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // BSM-023 — the message key under each refused field; the component translates.
  const [fieldErrors, setFieldErrors] = useState<BankEntryFieldErrorKeys>({});

  const isFund = transfer?.transfer_type === "FUND_WIRE";
  const kind = isFund ? "fund" : "direct";

  // Load linked IDs and current candidates when transfer changes.
  useEffect(() => {
    if (!transfer) return;

    setTransferDateState(transfer.transfer_date);
    setFieldErrors({});
    setSelectedGroupIds([]);
    setSelectedProcedureIds([]);
    setCurrentGroups([]);
    setCurrentProcedures([]);
    setInitialIds([]);
    setTotalAmountMillis(transfer.amount);

    const loadLinks = async () => {
      if (transfer.transfer_type === "FUND_WIRE") {
        const idsResult = await getTransferFundGroupIds(transfer.id);
        if (!idsResult.success || !idsResult.data) {
          logger.error("[useEditBankTransferModal] Failed to load fund group ids", {
            error: idsResult.error,
          });
          // The window cannot show what the entry settles: say so rather than open empty.
          toastService.show("error", t("transfer.error_unknown"));
          return;
        }
        const ids = idsResult.data;
        setSelectedGroupIds(ids);
        setInitialIds(ids);

        if (ids.length > 0) {
          const groupsResult = await getFundGroupsByIds(ids);
          if (groupsResult.success && groupsResult.data) {
            setCurrentGroups(groupsResult.data);
          } else {
            logger.error("[useEditBankTransferModal] Failed to load current groups", {
              error: groupsResult.error,
            });
          }
        }
      } else {
        const idsResult = await getTransferProcedureIds(transfer.id);
        if (!idsResult.success || !idsResult.data) {
          logger.error("[useEditBankTransferModal] Failed to load procedure ids", {
            error: idsResult.error,
          });
          // The window cannot show what the entry settles: say so rather than open empty.
          toastService.show("error", t("transfer.error_unknown"));
          return;
        }
        const ids = idsResult.data;
        setSelectedProcedureIds(ids);
        setInitialIds(ids);

        if (ids.length > 0) {
          const procsResult = await getProceduresByIds(ids);
          if (procsResult.success && procsResult.data) {
            setCurrentProcedures(procsResult.data);
          } else {
            logger.error("[useEditBankTransferModal] Failed to load current procedures", {
              error: procsResult.error,
            });
          }
        }
      }
    };

    loadLinks();
  }, [transfer, t]);

  const setTransferDate = (value: string) => {
    setTransferDateState(value);
    setFieldErrors((prev) => ({ ...prev, transferDate: undefined }));
  };

  const handleFundGroupSelectionChange = (groupIds: string[], totalMillis: number) => {
    setSelectedGroupIds(groupIds);
    setTotalAmountMillis(totalMillis);
  };

  const handleProcedureSelectionChange = (procedureIds: string[], totalMillis: number) => {
    setSelectedProcedureIds(procedureIds);
    setTotalAmountMillis(totalMillis);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!transfer) return;
    // The dialog sends what it holds; the backend judges it (BSM-030).
    setFieldErrors({});

    setSubmitting(true);
    try {
      const result = isFund
        ? await updateFundTransfer(transfer.id, transferDate, selectedGroupIds)
        : await updateDirectTransfer(transfer.id, transferDate, selectedProcedureIds);

      if (result.success) {
        // BSM-032 — an edit that changed nothing closes silently.
        if (result.data.outcome === "Updated") {
          toastService.show("success", t(`transfer.${kind}.updated`));
        }
        onClose();
      } else {
        setFieldErrors(bankEntryFieldErrorKeys(result.error) ?? {});
        const { key, params } = formatBankManualMatchError(result.error);
        toastService.show("error", t(key, params));
      }
    } catch (error) {
      logger.error("[useEditBankTransferModal] Exception", { error });
      toastService.show("error", t("transfer.error_unknown"));
    } finally {
      setSubmitting(false);
    }
  };

  // #642 — an edited date or selection: closing asks first.
  const selectedIds = isFund ? selectedGroupIds : selectedProcedureIds;
  const isDirty =
    transfer !== null &&
    (transferDate !== transfer.transfer_date ||
      selectedIds.length !== initialIds.length ||
      selectedIds.some((id) => !initialIds.includes(id)));

  return {
    transferDate,
    setTransferDate,
    selectedGroupIds,
    selectedProcedureIds,
    totalAmountMillis,
    currentGroups,
    currentProcedures,
    submitting,
    fieldErrors,
    isFund,
    isDirty,
    handleFundGroupSelectionChange,
    handleProcedureSelectionChange,
    handleSubmit,
  };
}

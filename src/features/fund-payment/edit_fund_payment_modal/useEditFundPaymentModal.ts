/**
 * useEditFundPaymentModal - Logic for editing a fund payment group
 *
 * Data sources:
 * - gateway: getFundPaymentGroupEditData (server-classified procedures)
 * - gateway: updatePaymentGroupWithProcedures (submit)
 * - appStore: funds (fund display), patients (patient name resolution)
 */

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FundPaymentGroup, Procedure } from "@/bindings";
import { toastService } from "@/core/snackbar";
import { useAppStore } from "@/lib/appStore";
import { logger } from "@/lib/logger";
import { getFundPaymentGroupEditData, updatePaymentGroupWithProcedures } from "../gateway";
import { FundPaymentPresenter } from "../shared/presenter";

export function useEditFundPaymentModal(payment: FundPaymentGroup, onClose: () => void) {
  const { t } = useTranslation("fund-payment");

  const funds = useAppStore((state) => state.funds);
  const patients = useAppStore((state) => state.patients);

  const [paymentDate, setPaymentDate] = useState(payment.payment_date);
  const [currentProcedures, setCurrentProcedures] = useState<Procedure[]>([]);
  // Available procedures for the add-modal (R19): Created, same fund, date <= payment_date
  const [availableProcedures, setAvailableProcedures] = useState<Procedure[]>([]);
  // Procedures added via SelectProcedureModal during this edit session
  const [addedProcedures, setAddedProcedures] = useState<Procedure[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [isSelectModalOpen, setIsSelectModalOpen] = useState(false);

  const selectedFund = useMemo(() => {
    const fund = funds.find((f) => f.id === payment.fund_id);
    return FundPaymentPresenter.toDisplayData(fund);
  }, [funds, payment.fund_id]);

  // All procedures eligible for submit = current + newly added
  const allProcedures = useMemo(
    () => [...currentProcedures, ...addedProcedures],
    [currentProcedures, addedProcedures],
  );

  // Running total of selected procedures (R20)
  const totalAmount = useMemo(() => {
    return allProcedures
      .filter((p) => selectedIds.has(p.id))
      .reduce((sum, p) => sum + (p.procedure_amount || 0), 0);
  }, [allProcedures, selectedIds]);

  // Load edit data (classified server-side) on mount
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const result = await getFundPaymentGroupEditData(payment.id, payment.fund_id);
        if (result.success && result.data) {
          setCurrentProcedures(result.data.current_procedures);
          setAvailableProcedures(result.data.available_procedures);
          setSelectedIds(new Set(result.data.current_procedures.map((p) => p.id)));
        } else {
          toastService.show("error", t("edit.errorLoadProcedures", { error: result.error }));
        }
      } catch (error) {
        logger.error("[useEditFundPaymentModal] Failed to fetch edit data", { error });
        toastService.show("error", t("edit.errorLoadDetails"));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [payment.id, payment.fund_id, t]);

  const toggleId = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const openSelectModal = useCallback(() => setIsSelectModalOpen(true), []);
  const closeSelectModal = useCallback(() => setIsSelectModalOpen(false), []);

  // Called when user confirms selection in SelectProcedureModal
  const handleProceduresAdded = useCallback(
    (procedures: Procedure[]) => {
      // Deduplicate against both already-added and current procedures
      const existingIds = new Set([
        ...addedProcedures.map((p) => p.id),
        ...currentProcedures.map((p) => p.id),
      ]);
      const newOnes = procedures.filter((p) => !existingIds.has(p.id));
      setAddedProcedures((prev) => [...prev, ...newOnes]);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const p of newOnes) next.add(p.id);
        return next;
      });
      setIsSelectModalOpen(false);
    },
    [currentProcedures, addedProcedures],
  );

  const getPatientName = useCallback(
    (patientId: string): string => {
      const patient = patients.find((p) => p.id === patientId);
      return patient?.name || patientId;
    },
    [patients],
  );

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();

      if (!paymentDate.trim()) {
        toastService.show("error", t("edit.errorDateRequired"));
        return;
      }

      if (selectedIds.size === 0) {
        toastService.show("error", t("edit.errorProcedureRequired"));
        return;
      }

      const selectedProcedures = allProcedures.filter((p) => selectedIds.has(p.id));

      logger.debug("[useEditFundPaymentModal] Submitting update", {
        paymentId: payment.id,
        paymentDate,
        selectedCount: selectedProcedures.length,
      });

      setLoading(true);
      try {
        const result = await updatePaymentGroupWithProcedures(
          payment.id,
          paymentDate,
          selectedProcedures,
        );

        if (result.success) {
          toastService.show("success", t("edit.success"));
          onClose();
        } else {
          toastService.show("error", t("edit.errorUpdate", { error: result.error }));
        }
      } catch (error) {
        logger.error("[useEditFundPaymentModal] Error updating payment group", { error });
        toastService.show("error", t("edit.errorUnknown"));
      } finally {
        setLoading(false);
      }
    },
    [paymentDate, selectedIds, allProcedures, payment.id, onClose, t],
  );

  // Procedures available to add = loaded pool minus already selected
  const proceduresForModal = useMemo(
    () => availableProcedures.filter((p) => !selectedIds.has(p.id)),
    [availableProcedures, selectedIds],
  );

  return {
    paymentDate,
    setPaymentDate,
    currentProcedures,
    proceduresForModal,
    selectedIds,
    loading,
    selectedFund,
    totalAmount,
    isSelectModalOpen,
    toggleId,
    openSelectModal,
    closeSelectModal,
    handleProceduresAdded,
    getPatientName,
    handleSubmit,
  };
}

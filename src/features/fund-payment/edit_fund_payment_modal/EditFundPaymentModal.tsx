import { Calendar } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FundPaymentGroup, Procedure } from "@/bindings";

import { useSnackbar } from "@/core/snackbar";
import { useAppStore } from "@/lib/appStore";
import { logger } from "@/lib/logger";
import { Button, Dialog } from "@/ui/components";
import { DateField } from "@/ui/components/field/DateField";
import {
  getProceduresByIds,
  getUnpaidProceduresByFund,
  updatePaymentGroupWithProcedures,
} from "../gateway";
import { FundPaymentPresenter } from "../shared/presenter";

export interface EditFundPaymentModalProps {
  payment: FundPaymentGroup;
  onClose: () => void;
}

export function EditFundPaymentModal({ payment, onClose }: EditFundPaymentModalProps) {
  const { t } = useTranslation("fund-payment");
  const { showSnackbar } = useSnackbar();
  const funds = useAppStore((state) => state.funds);
  const patients = useAppStore((state) => state.patients);

  useEffect(() => {
    logger.info("[EditFundPaymentModal] Component mounted");
  }, []);

  const [paymentDate, setPaymentDate] = useState(payment.payment_date);
  const [currentProcedures, setCurrentProcedures] = useState<Procedure[]>([]);
  const [unpaidProcedures, setUnpaidProcedures] = useState<Procedure[]>([]);
  const [selectedProcedures, setSelectedProcedures] = useState<Procedure[]>([]);
  const [loading, setLoading] = useState(false);

  // Load current procedures from payment.lines on mount
  useEffect(() => {
    const loadCurrentProcedures = async () => {
      try {
        const procedureIds = payment.lines.map((line) => line.procedure_id);
        logger.debug("Fetching current procedures for edit", { count: procedureIds.length });
        const result = await getProceduresByIds(procedureIds);

        if (result.success && result.data) {
          setCurrentProcedures(result.data);
          setSelectedProcedures(result.data);
        } else {
          showSnackbar("error", t("edit.errorLoadProcedures", { error: result.error }));
        }
      } catch (error) {
        logger.error("Failed to fetch current procedures", { error });
        showSnackbar("error", t("edit.errorLoadDetails"));
      }
    };

    loadCurrentProcedures();
  }, [payment, showSnackbar, t]);

  const selectedFund = useMemo(() => {
    const fund = funds.find((f) => f.id === payment.fund_id);
    return FundPaymentPresenter.toDisplayData(fund);
  }, [funds, payment.fund_id]);

  // Combine current and unpaid procedures (avoid duplicates)
  const allProcedures = useMemo(() => {
    const currentIds = new Set(currentProcedures.map((p) => p.id));
    const uniqueUnpaid = unpaidProcedures.filter((p) => !currentIds.has(p.id));
    return [...currentProcedures, ...uniqueUnpaid];
  }, [currentProcedures, unpaidProcedures]);

  // Sort procedures: selected first, then unselected
  const sortedProcedures = useMemo(() => {
    const selectedIds = new Set(selectedProcedures.map((p) => p.id));
    return [...allProcedures].sort((a, b) => {
      const aSelected = selectedIds.has(a.id) ? 0 : 1;
      const bSelected = selectedIds.has(b.id) ? 0 : 1;
      return aSelected - bSelected;
    });
  }, [allProcedures, selectedProcedures]);

  const getPatientName = (patientId: string): string => {
    const patient = patients.find((p) => p.id === patientId);
    return patient?.name || patientId;
  };

  const formatDateFrench = (isoDate: string): string => {
    const date = new Date(`${isoDate}T00:00:00Z`);
    return new Intl.DateTimeFormat("fr-FR").format(date);
  };

  // Load unpaid procedures on mount
  useEffect(() => {
    const loadProcedures = async () => {
      try {
        setLoading(true);
        logger.debug("Fetching unpaid procedures for fund", { fundId: payment.fund_id });
        const result = await getUnpaidProceduresByFund(payment.fund_id);

        if (result.success && result.data) {
          setUnpaidProcedures(result.data);
        } else {
          showSnackbar("error", t("edit.errorLoadProcedures", { error: result.error }));
        }
      } catch (err) {
        logger.error("Error loading procedures", { error: err });
        showSnackbar("error", t("edit.errorLoadDetails"));
      } finally {
        setLoading(false);
      }
    };

    loadProcedures();
  }, [payment.fund_id, showSnackbar, t]);

  const handleProcedureToggle = (procedure: Procedure) => {
    setSelectedProcedures((prev) => {
      const isSelected = prev.some((p) => p.id === procedure.id);
      if (isSelected) {
        return prev.filter((p) => p.id !== procedure.id);
      } else {
        return [...prev, procedure];
      }
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!paymentDate.trim()) {
      logger.warn("Update form submitted with empty payment date");
      showSnackbar("error", t("edit.errorDateRequired"));
      return;
    }

    if (selectedProcedures.length === 0) {
      logger.warn("Update form submitted with no procedures");
      showSnackbar("error", t("edit.errorProcedureRequired"));
      return;
    }

    logger.debug("Submitting update form", { paymentId: payment.id, paymentDate });
    setLoading(true);

    try {
      const result = await updatePaymentGroupWithProcedures(
        payment.id,
        paymentDate,
        selectedProcedures,
      );

      if (result.success) {
        showSnackbar("success", t("edit.success"));
        onClose();
      } else {
        showSnackbar("error", t("edit.errorUpdate", { error: result.error }));
      }
    } catch (error) {
      logger.error("Error updating payment group", { error });
      showSnackbar("error", t("edit.errorUnknown"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog isOpen={true} onClose={onClose} title={t("edit.title")}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Fund Info (Read-only) */}
        <div>
          <div className="text-sm font-medium text-neutral-70 mb-1">{t("edit.fundLabel")}</div>
          <div className="p-3 bg-neutral-10 rounded border border-neutral-20">
            <p className="text-sm text-neutral-90 font-medium">{selectedFund?.fundName}</p>
            <p className="text-xs text-neutral-60">{selectedFund?.fundIdentifier}</p>
          </div>
        </div>

        {/* Payment Date */}
        <div>
          <DateField
            id="paymentDate"
            label={`${t("edit.paymentDateLabel")} *`}
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            disabled={loading}
          />
        </div>

        {/* Procedures Selection */}
        <div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-neutral-90">
              {t("edit.proceduresSelected", { count: selectedProcedures.length })}
            </p>
            {allProcedures.length === 0 ? (
              <p className="text-center py-8 text-neutral-60">{t("edit.noProcedures")}</p>
            ) : (
              <div className="space-y-1 border border-neutral-30 rounded-lg divide-y max-h-64 overflow-y-auto">
                {sortedProcedures.map((proc) => {
                  const isSelected = selectedProcedures.some((p) => p.id === proc.id);
                  return (
                    <label
                      key={proc.id}
                      className="flex items-center gap-3 px-3 py-4 pr-6 hover:bg-neutral-10 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleProcedureToggle(proc)}
                        disabled={loading}
                        className="w-4 h-4"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center gap-4">
                          <span className="flex items-center gap-1 text-xs text-neutral-70 whitespace-nowrap">
                            <Calendar size={12} />
                            {formatDateFrench(proc.procedure_date)}
                          </span>
                          <p className="text-sm font-medium text-neutral-90">
                            {getPatientName(proc.patient_id)}
                          </p>
                          <span className="font-semibold text-neutral-90 whitespace-nowrap">
                            €{((proc.procedure_amount || 0) / 1000).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-2 justify-end pt-4 border-t border-neutral-20">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            {t("edit.cancel")}
          </Button>
          <Button type="submit" variant="primary" loading={loading}>
            {t("edit.update")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

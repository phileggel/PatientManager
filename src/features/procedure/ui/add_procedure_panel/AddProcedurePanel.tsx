import { Plus } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { logger } from "@/lib/logger";
import { AmountField, Button, DateField, SelectField } from "@/ui/components";
import { ComboboxField } from "@/ui/components/field";
import { CreateFundForm } from "../form/CreateFundForm";
import { CreatePatientForm } from "../form/CreatePatientForm";
import { useAddProcedurePanel } from "./useAddProcedurePanel";

interface AddProcedurePanelProps {
  onSuccess?: () => void;
}

export function AddProcedurePanel({ onSuccess }: AddProcedurePanelProps) {
  const { t } = useTranslation("procedure");

  useEffect(() => {
    logger.info("[AddProcedurePanel] Component mounted");
  }, []);

  const {
    patients,
    funds,
    procedureTypes,
    patientId,
    handlePatientChange,
    fundId,
    setFundId,
    procedureTypeId,
    setProcedureTypeId,
    procedureDate,
    setProcedureDate,
    procedureAmount,
    setProcedureAmount,
    paymentMethod,
    setPaymentMethod,
    paymentDate,
    setPaymentDate,
    loading,
    fieldErrors,
    handleSubmit,
    patientModal,
    setPatientModal,
    fundModal,
    setFundModal,
    handlePatientCreated,
    handleFundCreated,
  } = useAddProcedurePanel(onSuccess);

  const paymentOptions = [
    { value: "NONE", label: t("form.payment.none") },
    { value: "CASH", label: t("form.payment.cash") },
    { value: "CHECK", label: t("form.payment.check") },
    { value: "BANK_CARD", label: t("form.payment.card") },
    { value: "BANK_TRANSFER", label: t("form.payment.transfer") },
  ];

  const procedureTypeOptions = [
    { value: "", label: t("form.noSelection") },
    ...procedureTypes.map((pt) => ({ value: pt.id, label: pt.name })),
  ];

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <fieldset disabled={loading} className="contents">
          <ComboboxField
            id="procedurePatient"
            label={t("form.patient")}
            items={patients}
            displayKey="name"
            idKey="id"
            value={patientId}
            onChange={handlePatientChange}
            placeholder={t("form.selectPatient")}
            onCreateNew={(q) => setPatientModal({ open: true, query: q })}
            createLabel={t("createPatient.submit")}
            error={fieldErrors.patientId}
          />

          <ComboboxField
            id="procedureFund"
            label={t("form.fund")}
            items={funds}
            displayKey="fund_identifier"
            idKey="id"
            searchKeys={["fund_identifier", "name"]}
            value={fundId}
            onChange={setFundId}
            placeholder={t("form.selectFund")}
            onCreateNew={(q) => setFundModal({ open: true, query: q })}
            createLabel={t("createFund.submit")}
          />

          <div className="grid grid-cols-2 gap-3">
            <SelectField
              id="procedureType"
              label={t("form.procedureType")}
              options={procedureTypeOptions}
              value={procedureTypeId}
              onChange={(e) => setProcedureTypeId(e.target.value)}
              error={fieldErrors.procedureTypeId}
            />

            <DateField
              id="procedureDate"
              label={t("form.procedureDate")}
              value={procedureDate}
              onChange={(e) => setProcedureDate(e.target.value)}
              error={fieldErrors.procedureDate}
            />
          </div>

          <AmountField
            id="procedureAmount"
            label={t("form.amount")}
            value={procedureAmount}
            onChange={setProcedureAmount}
          />

          <div className="grid grid-cols-2 gap-3">
            <SelectField
              id="paymentMethod"
              label={t("form.paymentMethod")}
              options={paymentOptions}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            />

            <DateField
              id="paymentDate"
              label={t("form.paymentDate")}
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>
        </fieldset>

        <Button
          type="submit"
          variant="primary"
          loading={loading}
          icon={<Plus size={18} />}
          className="mt-6"
        >
          {loading ? t("action.adding") : t("action.add")}
        </Button>
      </form>

      {/* Entity creation modals */}
      <CreatePatientForm
        isOpen={patientModal.open}
        initialQuery={patientModal.query}
        onClose={() => setPatientModal({ open: false, query: "" })}
        onSubmit={handlePatientCreated}
      />

      <CreateFundForm
        isOpen={fundModal.open}
        initialQuery={fundModal.query}
        onClose={() => setFundModal({ open: false, query: "" })}
        onSubmit={handleFundCreated}
      />
    </>
  );
}

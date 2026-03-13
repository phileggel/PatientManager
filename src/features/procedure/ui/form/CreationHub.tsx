import type { AffiliatedFund, Patient, ProcedureType } from "@/bindings";
import type { ProcedureFormModals } from "../../hooks/useProcedureFormModals";
import type { WorkflowAction } from "../../model";
import { CreateFundForm, type CreateFundFormData } from "./CreateFundForm";
import { CreatePatientForm, type CreatePatientFormData } from "./CreatePatientForm";
import {
  CreateProcedureTypeForm,
  type CreateProcedureTypeFormData,
} from "./CreateProcedureTypeForm";

interface CreateFormHubProps {
  modals: ProcedureFormModals;
  actions: WorkflowAction;
  onSavePatient: (data: CreatePatientFormData) => Promise<Patient>;
  onSaveFund: (data: CreateFundFormData) => Promise<AffiliatedFund>;
  onSaveProcedureType: (data: CreateProcedureTypeFormData) => Promise<ProcedureType>;
}

export function CreateFormHub({
  modals,
  actions,
  onSavePatient,
  onSaveFund,
  onSaveProcedureType,
}: CreateFormHubProps) {
  return (
    <>
      {modals.isPatientModalOpen && (
        <CreatePatientForm
          isOpen={true}
          initialQuery={modals.currentQuery}
          onClose={modals.closeModal}
          onSubmit={async (data) => {
            const newPatient = await onSavePatient(data);
            actions.selectPatient(newPatient);
            modals.closeModal();
          }}
        />
      )}

      {modals.isFundModalOpen && (
        <CreateFundForm
          isOpen={true}
          initialQuery={modals.currentQuery}
          onClose={modals.closeModal}
          onSubmit={async (data) => {
            const newFund = await onSaveFund(data);
            actions.selectFund(newFund);
            modals.closeModal();
          }}
        />
      )}

      {modals.isProcedureModalOpen && (
        <CreateProcedureTypeForm
          isOpen={true}
          initialQuery={modals.currentQuery}
          onClose={modals.closeModal}
          onSubmit={async (data) => {
            const newType = await onSaveProcedureType(data);
            actions.selectProcedureType(newType);
            modals.closeModal();
          }}
        />
      )}
    </>
  );
}

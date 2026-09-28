import { create } from "zustand";
import type {
  BankAccount,
  Fund,
  FundPaymentGroup,
  Patient,
  ProcedureError,
  ProcedureType,
} from "@/bindings";

interface AppState {
  // Data (persistent, global)
  patients: Patient[];
  funds: Fund[];
  procedureTypes: ProcedureType[];
  bankAccounts: BankAccount[];
  fundPaymentGroups: FundPaymentGroup[];

  // Loading states
  patientsLoading: boolean;
  fundsLoading: boolean;
  procedureTypesLoading: boolean;
  bankAccountsLoading: boolean;
  fundPaymentGroupsLoading: boolean;

  // Error states (typed per F27 — consumers translate at render via the
  // feature's `formatProcedureError` presenter + i18n).
  procedureTypesError: ProcedureError | null;

  // Actions
  setPatients: (patients: Patient[]) => void;
  setFunds: (funds: Fund[]) => void;
  setProcedureTypes: (procedureTypes: ProcedureType[]) => void;
  setBankAccounts: (accounts: BankAccount[]) => void;
  setFundPaymentGroups: (groups: FundPaymentGroup[]) => void;
  setProcedureTypesError: (error: ProcedureError | null) => void;

  setLoading: (
    type: "patients" | "funds" | "procedureTypes" | "bankAccounts" | "fundPaymentGroups",
    loading: boolean,
  ) => void;
}

export const useCacheStore = create<AppState>((set) => ({
  // Initial state
  patients: [],
  funds: [],
  procedureTypes: [],
  bankAccounts: [],
  fundPaymentGroups: [],
  patientsLoading: false,
  fundsLoading: false,
  procedureTypesLoading: false,
  bankAccountsLoading: false,
  fundPaymentGroupsLoading: false,
  procedureTypesError: null,

  // Actions
  setPatients: (patients) => set({ patients }),

  setFunds: (funds) => set({ funds }),

  setProcedureTypes: (procedureTypes) => set({ procedureTypes }),
  setProcedureTypesError: (error) => set({ procedureTypesError: error }),

  setBankAccounts: (accounts) => set({ bankAccounts: accounts }),

  setFundPaymentGroups: (groups) => set({ fundPaymentGroups: groups }),

  setLoading: (type, loading) => {
    if (type === "patients") {
      set({ patientsLoading: loading });
    } else if (type === "funds") {
      set({ fundsLoading: loading });
    } else if (type === "procedureTypes") {
      set({ procedureTypesLoading: loading });
    } else if (type === "bankAccounts") {
      set({ bankAccountsLoading: loading });
    } else if (type === "fundPaymentGroups") {
      set({ fundPaymentGroupsLoading: loading });
    }
  },
}));

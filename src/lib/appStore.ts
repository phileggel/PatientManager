import { create } from "zustand";
import type {
  AffiliatedFund,
  BankAccount,
  FundPaymentGroup,
  Patient,
  ProcedureType,
} from "@/bindings";

interface AppState {
  // Data (persistent, global)
  patients: Patient[];
  funds: AffiliatedFund[];
  procedureTypes: ProcedureType[];
  bankAccounts: BankAccount[];
  fundPaymentGroups: FundPaymentGroup[];

  // Loading states
  patientsLoading: boolean;
  fundsLoading: boolean;
  procedureTypesLoading: boolean;
  bankAccountsLoading: boolean;
  fundPaymentGroupsLoading: boolean;

  // Actions
  setPatients: (patients: Patient[]) => void;
  addPatients: (patients: Patient[]) => void;
  setFunds: (funds: AffiliatedFund[]) => void;
  addFunds: (funds: AffiliatedFund[]) => void;
  setProcedureTypes: (procedureTypes: ProcedureType[]) => void;
  addProcedureTypes: (procedureTypes: ProcedureType[]) => void;
  setBankAccounts: (accounts: BankAccount[]) => void;
  addBankAccounts: (accounts: BankAccount[]) => void;
  setFundPaymentGroups: (groups: FundPaymentGroup[]) => void;
  addFundPaymentGroups: (groups: FundPaymentGroup[]) => void;

  setLoading: (
    type: "patients" | "funds" | "procedureTypes" | "bankAccounts" | "fundPaymentGroups",
    loading: boolean,
  ) => void;
}

export const useAppStore = create<AppState>((set) => ({
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

  // Actions
  setPatients: (patients) => set({ patients }),
  addPatients: (patients) =>
    set((state) => ({
      patients: [...state.patients, ...patients],
    })),

  setFunds: (funds) => set({ funds }),
  addFunds: (funds) =>
    set((state) => ({
      funds: [...state.funds, ...funds],
    })),

  setProcedureTypes: (procedureTypes) => set({ procedureTypes }),
  addProcedureTypes: (procedureTypes) =>
    set((state) => ({
      procedureTypes: [...state.procedureTypes, ...procedureTypes],
    })),

  setBankAccounts: (accounts) => set({ bankAccounts: accounts }),
  addBankAccounts: (accounts) =>
    set((state) => ({
      bankAccounts: [...state.bankAccounts, ...accounts],
    })),

  setFundPaymentGroups: (groups) => set({ fundPaymentGroups: groups }),
  addFundPaymentGroups: (groups) =>
    set((state) => ({
      fundPaymentGroups: [...state.fundPaymentGroups, ...groups],
    })),

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

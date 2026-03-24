import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/core/snackbar", () => ({
  toastService: { show: vi.fn() },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { toastService } from "@/core/snackbar";
import { useAppStore } from "@/lib/appStore";
import { useManagementModal } from "./useManagementModal";

const makeFund = (id: string) => ({ id, fund_identifier: id, name: "Fund" });
const makeBankAccount = (id: string) => ({ id, name: "Account", iban: null });

describe("useManagementModal", () => {
  const onNavigate = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handlePatient navigates to patient and closes", () => {
    useAppStore.setState({ funds: [], bankAccounts: [] });
    const { result } = renderHook(() => useManagementModal({ onNavigate, onClose }));

    result.current.handlePatient();

    expect(onNavigate).toHaveBeenCalledWith("patient");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("handleFunds navigates to funds and closes", () => {
    useAppStore.setState({ funds: [], bankAccounts: [] });
    const { result } = renderHook(() => useManagementModal({ onNavigate, onClose }));

    result.current.handleFunds();

    expect(onNavigate).toHaveBeenCalledWith("funds");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("handleProcedureTypes navigates to procedure-types and closes", () => {
    useAppStore.setState({ funds: [], bankAccounts: [] });
    const { result } = renderHook(() => useManagementModal({ onNavigate, onClose }));

    result.current.handleProcedureTypes();

    expect(onNavigate).toHaveBeenCalledWith("procedure-types");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("handleFundPayment navigates to fund-payment when funds exist", () => {
    useAppStore.setState({ funds: [makeFund("f1")], bankAccounts: [] });
    const { result } = renderHook(() => useManagementModal({ onNavigate, onClose }));

    result.current.handleFundPayment();

    expect(onNavigate).toHaveBeenCalledWith("fund-payment");
    expect(onClose).toHaveBeenCalledOnce();
    expect(toastService.show).not.toHaveBeenCalled();
  });

  it("handleFundPayment shows info toast and redirects to funds when no fund exists", () => {
    useAppStore.setState({ funds: [], bankAccounts: [] });
    const { result } = renderHook(() => useManagementModal({ onNavigate, onClose }));

    result.current.handleFundPayment();

    expect(toastService.show).toHaveBeenCalledWith("info", "prerequisites.noFund");
    expect(onNavigate).toHaveBeenCalledWith("funds");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("handleBankTransfer navigates to bank-transfer when bank accounts exist", () => {
    useAppStore.setState({ funds: [], bankAccounts: [makeBankAccount("b1")] });
    const { result } = renderHook(() => useManagementModal({ onNavigate, onClose }));

    result.current.handleBankTransfer();

    expect(onNavigate).toHaveBeenCalledWith("bank-transfer");
    expect(onClose).toHaveBeenCalledOnce();
    expect(toastService.show).not.toHaveBeenCalled();
  });

  it("handleBankTransfer shows info toast and redirects to bank-account when no account exists", () => {
    useAppStore.setState({ funds: [], bankAccounts: [] });
    const { result } = renderHook(() => useManagementModal({ onNavigate, onClose }));

    result.current.handleBankTransfer();

    expect(toastService.show).toHaveBeenCalledWith("info", "prerequisites.noBankAccount");
    expect(onNavigate).toHaveBeenCalledWith("bank-account");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("handleBankAccount navigates to bank-account and closes", () => {
    useAppStore.setState({ funds: [], bankAccounts: [] });
    const { result } = renderHook(() => useManagementModal({ onNavigate, onClose }));

    result.current.handleBankAccount();

    expect(onNavigate).toHaveBeenCalledWith("bank-account");
    expect(onClose).toHaveBeenCalledOnce();
  });
});

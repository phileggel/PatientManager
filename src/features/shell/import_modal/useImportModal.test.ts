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
import { useImportModal } from "./useImportModal";

const makeFund = (id: string) => ({ id, fund_identifier: id, name: "Caisse" });
const makeBankAccount = (id: string) => ({ id, name: "Account", iban: null });

describe("useImportModal", () => {
  const onNavigate = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handleExcelImport navigates to excel-import and closes", () => {
    useAppStore.setState({ funds: [], bankAccounts: [] });
    const { result } = renderHook(() => useImportModal({ onNavigate, onClose }));

    result.current.handleExcelImport();

    expect(onNavigate).toHaveBeenCalledWith("excel-import");
    expect(onClose).toHaveBeenCalledOnce();
    expect(toastService.show).not.toHaveBeenCalled();
  });

  it("handleFundReconciliation navigates to fund-payment-match when funds exist", () => {
    useAppStore.setState({ funds: [makeFund("f1")], bankAccounts: [] });
    const { result } = renderHook(() => useImportModal({ onNavigate, onClose }));

    result.current.handleFundReconciliation();

    expect(onNavigate).toHaveBeenCalledWith("fund-payment-match");
    expect(onClose).toHaveBeenCalledOnce();
    expect(toastService.show).not.toHaveBeenCalled();
  });

  it("handleFundReconciliation shows info toast and redirects to funds when no fund exists", () => {
    useAppStore.setState({ funds: [], bankAccounts: [] });
    const { result } = renderHook(() => useImportModal({ onNavigate, onClose }));

    result.current.handleFundReconciliation();

    expect(toastService.show).toHaveBeenCalledWith("info", "prerequisites.noFund");
    expect(onNavigate).toHaveBeenCalledWith("funds");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("handleBankReconciliation navigates to bank-statement-match when bank accounts exist", () => {
    useAppStore.setState({ funds: [], bankAccounts: [makeBankAccount("b1")] });
    const { result } = renderHook(() => useImportModal({ onNavigate, onClose }));

    result.current.handleBankReconciliation();

    expect(onNavigate).toHaveBeenCalledWith("bank-statement-match");
    expect(onClose).toHaveBeenCalledOnce();
    expect(toastService.show).not.toHaveBeenCalled();
  });

  it("handleBankReconciliation shows info toast and redirects to bank-account when no account exists", () => {
    useAppStore.setState({ funds: [], bankAccounts: [] });
    const { result } = renderHook(() => useImportModal({ onNavigate, onClose }));

    result.current.handleBankReconciliation();

    expect(toastService.show).toHaveBeenCalledWith("info", "prerequisites.noBankAccount");
    expect(onNavigate).toHaveBeenCalledWith("bank-account");
    expect(onClose).toHaveBeenCalledOnce();
  });
});

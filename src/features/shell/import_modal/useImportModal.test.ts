import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const mockOpen = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mockOpen }));

import { toastService } from "@/core/snackbar";
import { useAppStore } from "@/lib/appStore";
import { useImportModal } from "./useImportModal";

const makeFund = (id: string) => ({ id, fund_identifier: id, name: "Caisse" });
const makeBankAccount = (id: string) => ({ id, name: "Account", iban: null });

describe("useImportModal", () => {
  const onNavigate = vi.fn();
  const onClose = vi.fn();
  const onFileSelected = vi.fn();

  const renderModal = () =>
    renderHook(() => useImportModal({ onNavigate, onClose, onFileSelected }));

  beforeEach(() => {
    vi.clearAllMocks();
    mockOpen.mockResolvedValue(null);
  });

  // --- Excel import ---

  it("handleExcelImport: cancelled dialog — does nothing", async () => {
    useAppStore.setState({ funds: [], bankAccounts: [] });
    mockOpen.mockResolvedValue(null);
    const { result } = renderModal();

    await act(async () => {
      await result.current.handleExcelImport();
    });

    expect(onFileSelected).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("handleExcelImport: file selected — calls onFileSelected and closes", async () => {
    useAppStore.setState({ funds: [], bankAccounts: [] });
    mockOpen.mockResolvedValue("/tmp/data.xlsx");
    const { result } = renderModal();

    await act(async () => {
      await result.current.handleExcelImport();
    });

    expect(onFileSelected).toHaveBeenCalledWith("excel-import", "/tmp/data.xlsx");
    expect(onClose).toHaveBeenCalledOnce();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  // --- Fund reconciliation ---

  it("handleFundReconciliation: no funds — shows toast, navigates to funds, closes", async () => {
    useAppStore.setState({ funds: [], bankAccounts: [] });
    const { result } = renderModal();

    await act(async () => {
      await result.current.handleFundReconciliation();
    });

    expect(toastService.show).toHaveBeenCalledWith("info", "prerequisites.noFund");
    expect(onNavigate).toHaveBeenCalledWith("funds");
    expect(onClose).toHaveBeenCalledOnce();
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it("handleFundReconciliation: funds exist, cancelled — does nothing", async () => {
    useAppStore.setState({ funds: [makeFund("f1")], bankAccounts: [] });
    mockOpen.mockResolvedValue(null);
    const { result } = renderModal();

    await act(async () => {
      await result.current.handleFundReconciliation();
    });

    expect(onFileSelected).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("handleFundReconciliation: funds exist, file selected — calls onFileSelected and closes", async () => {
    useAppStore.setState({ funds: [makeFund("f1")], bankAccounts: [] });
    mockOpen.mockResolvedValue("/tmp/statement.pdf");
    const { result } = renderModal();

    await act(async () => {
      await result.current.handleFundReconciliation();
    });

    expect(onFileSelected).toHaveBeenCalledWith("fund-payment-match", "/tmp/statement.pdf");
    expect(onClose).toHaveBeenCalledOnce();
  });

  // --- Bank reconciliation ---

  it("handleBankReconciliation: no accounts — shows toast, navigates to bank-account, closes", async () => {
    useAppStore.setState({ funds: [], bankAccounts: [] });
    const { result } = renderModal();

    await act(async () => {
      await result.current.handleBankReconciliation();
    });

    expect(toastService.show).toHaveBeenCalledWith("info", "prerequisites.noBankAccount");
    expect(onNavigate).toHaveBeenCalledWith("bank-account");
    expect(onClose).toHaveBeenCalledOnce();
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it("handleBankReconciliation: accounts exist, cancelled — does nothing", async () => {
    useAppStore.setState({ funds: [], bankAccounts: [makeBankAccount("b1")] });
    mockOpen.mockResolvedValue(null);
    const { result } = renderModal();

    await act(async () => {
      await result.current.handleBankReconciliation();
    });

    expect(onFileSelected).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("handleBankReconciliation: accounts exist, file selected — calls onFileSelected and closes", async () => {
    useAppStore.setState({ funds: [], bankAccounts: [makeBankAccount("b1")] });
    mockOpen.mockResolvedValue("/tmp/bank.pdf");
    const { result } = renderModal();

    await act(async () => {
      await result.current.handleBankReconciliation();
    });

    expect(onFileSelected).toHaveBeenCalledWith("bank-statement-match", "/tmp/bank.pdf");
    expect(onClose).toHaveBeenCalledOnce();
  });
});

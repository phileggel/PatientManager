import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../gateway", () => ({
  pickExcelFilePath: vi.fn(),
  pickPdfFilePath: vi.fn(),
}));

import { useCacheStore } from "@/infra/cache/store";
import { makeBankAccount } from "@/tests/bank.factory";
import { makeFund } from "@/tests/fund.factory";
import { toastService } from "@/ui/components/snackbar";
import * as gateway from "../gateway";
import { getLastFolder, setLastFolder } from "./lastFolderStore";
import { useImportModal } from "./useImportModal";

const mockPickExcel = vi.mocked(gateway.pickExcelFilePath);
const mockPickPdf = vi.mocked(gateway.pickPdfFilePath);

describe("useImportModal", () => {
  const onNavigate = vi.fn();
  const onClose = vi.fn();
  const onFileSelected = vi.fn();

  const renderModal = () =>
    renderHook(() => useImportModal({ onNavigate, onClose, onFileSelected }));

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockPickExcel.mockResolvedValue(null);
    mockPickPdf.mockResolvedValue(null);
  });

  // --- Excel import ---

  it("handleExcelImport: cancelled dialog — does nothing", async () => {
    useCacheStore.setState({ funds: [], bankAccounts: [] });
    mockPickExcel.mockResolvedValue(null);
    const { result } = renderModal();

    await act(async () => {
      await result.current.handleExcelImport();
    });

    expect(onFileSelected).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("handleExcelImport: file selected — calls onFileSelected and closes", async () => {
    useCacheStore.setState({ funds: [], bankAccounts: [] });
    mockPickExcel.mockResolvedValue("/tmp/data.xlsx");
    const { result } = renderModal();

    await act(async () => {
      await result.current.handleExcelImport();
    });

    expect(mockPickExcel).toHaveBeenCalledWith("excel.dialogTitle", undefined);
    expect(onFileSelected).toHaveBeenCalledWith("excel-import", "/tmp/data.xlsx");
    expect(onClose).toHaveBeenCalledOnce();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  // --- Fund reconciliation ---

  it("handleFundReconciliation: no funds — shows toast, navigates to funds, closes", async () => {
    useCacheStore.setState({ funds: [], bankAccounts: [] });
    const { result } = renderModal();

    await act(async () => {
      await result.current.handleFundReconciliation();
    });

    expect(toastService.show).toHaveBeenCalledWith("info", "prerequisites.noFund");
    expect(onNavigate).toHaveBeenCalledWith("funds");
    expect(onClose).toHaveBeenCalledOnce();
    expect(mockPickPdf).not.toHaveBeenCalled();
  });

  it("handleFundReconciliation: funds exist, cancelled — does nothing", async () => {
    useCacheStore.setState({ funds: [makeFund({ id: "f1" })], bankAccounts: [] });
    mockPickPdf.mockResolvedValue(null);
    const { result } = renderModal();

    await act(async () => {
      await result.current.handleFundReconciliation();
    });

    expect(onFileSelected).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("handleFundReconciliation: funds exist, file selected — calls onFileSelected and closes", async () => {
    useCacheStore.setState({ funds: [makeFund({ id: "f1" })], bankAccounts: [] });
    mockPickPdf.mockResolvedValue("/tmp/statement.pdf");
    const { result } = renderModal();

    await act(async () => {
      await result.current.handleFundReconciliation();
    });

    expect(mockPickPdf).toHaveBeenCalledWith("fundReconciliation.dialogTitle", undefined);
    expect(onFileSelected).toHaveBeenCalledWith("fund-payment-match", "/tmp/statement.pdf");
    expect(onClose).toHaveBeenCalledOnce();
  });

  // --- Bank reconciliation ---

  it("handleBankReconciliation: no accounts — shows toast, navigates to bank-account, closes", async () => {
    useCacheStore.setState({ funds: [], bankAccounts: [] });
    const { result } = renderModal();

    await act(async () => {
      await result.current.handleBankReconciliation();
    });

    expect(toastService.show).toHaveBeenCalledWith("info", "prerequisites.noBankAccount");
    expect(onNavigate).toHaveBeenCalledWith("bank-account");
    expect(onClose).toHaveBeenCalledOnce();
    expect(mockPickPdf).not.toHaveBeenCalled();
  });

  it("handleBankReconciliation: accounts exist, cancelled — does nothing", async () => {
    useCacheStore.setState({ funds: [], bankAccounts: [makeBankAccount({ id: "b1" })] });
    mockPickPdf.mockResolvedValue(null);
    const { result } = renderModal();

    await act(async () => {
      await result.current.handleBankReconciliation();
    });

    expect(onFileSelected).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("handleBankReconciliation: accounts exist, file selected — calls onFileSelected and closes", async () => {
    useCacheStore.setState({ funds: [], bankAccounts: [makeBankAccount({ id: "b1" })] });
    mockPickPdf.mockResolvedValue("/tmp/bank.pdf");
    const { result } = renderModal();

    await act(async () => {
      await result.current.handleBankReconciliation();
    });

    expect(mockPickPdf).toHaveBeenCalledWith("bankReconciliation.dialogTitle", undefined);
    expect(onFileSelected).toHaveBeenCalledWith("bank-statement-match", "/tmp/bank.pdf");
    expect(onClose).toHaveBeenCalledOnce();
  });

  // --- Last-folder memory (per-feature) ---

  it("handleExcelImport: passes the stored Excel folder as defaultPath", async () => {
    setLastFolder("excel", "/saved/excel/folder");
    useCacheStore.setState({ funds: [], bankAccounts: [] });
    const { result } = renderModal();

    await act(async () => {
      await result.current.handleExcelImport();
    });

    expect(mockPickExcel).toHaveBeenCalledWith("excel.dialogTitle", "/saved/excel/folder");
  });

  it("handleExcelImport: stores the parent folder of the picked file on success", async () => {
    useCacheStore.setState({ funds: [], bankAccounts: [] });
    mockPickExcel.mockResolvedValue("/imports/january/2026/data.xlsx");
    const { result } = renderModal();

    await act(async () => {
      await result.current.handleExcelImport();
    });

    expect(getLastFolder("excel")).toBe("/imports/january/2026");
  });

  it("handleExcelImport: does not touch the store when the dialog is cancelled", async () => {
    setLastFolder("excel", "/previous/folder");
    useCacheStore.setState({ funds: [], bankAccounts: [] });
    mockPickExcel.mockResolvedValue(null);
    const { result } = renderModal();

    await act(async () => {
      await result.current.handleExcelImport();
    });

    expect(getLastFolder("excel")).toBe("/previous/folder");
  });

  it("handleFundReconciliation: passes the stored fund-pdf folder, not the excel one", async () => {
    setLastFolder("excel", "/wrong/excel/folder");
    setLastFolder("fund-pdf", "/saved/fund/folder");
    useCacheStore.setState({ funds: [makeFund({ id: "f1" })], bankAccounts: [] });
    const { result } = renderModal();

    await act(async () => {
      await result.current.handleFundReconciliation();
    });

    expect(mockPickPdf).toHaveBeenCalledWith(
      "fundReconciliation.dialogTitle",
      "/saved/fund/folder",
    );
  });

  it("handleFundReconciliation: stores the parent folder of the picked PDF on success", async () => {
    useCacheStore.setState({ funds: [makeFund({ id: "f1" })], bankAccounts: [] });
    mockPickPdf.mockResolvedValue("/cpam/april/statement.pdf");
    const { result } = renderModal();

    await act(async () => {
      await result.current.handleFundReconciliation();
    });

    expect(getLastFolder("fund-pdf")).toBe("/cpam/april");
  });

  it("handleBankReconciliation: passes the stored bank-pdf folder, not the fund-pdf one", async () => {
    setLastFolder("fund-pdf", "/wrong/fund/folder");
    setLastFolder("bank-pdf", "/saved/bank/folder");
    useCacheStore.setState({ funds: [], bankAccounts: [makeBankAccount({ id: "b1" })] });
    const { result } = renderModal();

    await act(async () => {
      await result.current.handleBankReconciliation();
    });

    expect(mockPickPdf).toHaveBeenCalledWith(
      "bankReconciliation.dialogTitle",
      "/saved/bank/folder",
    );
  });

  it("handleBankReconciliation: stores the parent folder of the picked PDF on success", async () => {
    useCacheStore.setState({ funds: [], bankAccounts: [makeBankAccount({ id: "b1" })] });
    mockPickPdf.mockResolvedValue("/bank/statements/march.pdf");
    const { result } = renderModal();

    await act(async () => {
      await result.current.handleBankReconciliation();
    });

    expect(getLastFolder("bank-pdf")).toBe("/bank/statements");
  });
});

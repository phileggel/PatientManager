import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BankAccount, OverpaymentError } from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";
import { makeProcedure } from "@/tests/procedure.factory";
import { toastService } from "@/ui/components/snackbar";
import { useRecordOverpaymentModal } from "./useRecordOverpaymentModal";

vi.mock("../gateway", () => ({
  createOverpayment: vi.fn(),
  cancelOverpayment: vi.fn(),
  getProcedureRefundBySource: vi.fn(),
  getProcedureRefundByRefundProcedure: vi.fn(),
  getSourceBankAccount: vi.fn(),
}));

import * as gateway from "../gateway";

const mockCreate = vi.mocked(gateway.createOverpayment);
const mockSourceAccount = vi.mocked(gateway.getSourceBankAccount);
const mockToast = vi.mocked(toastService.show);

const SOURCE_PROCEDURE = makeProcedure({
  id: "proc-1",
  fund_reconciliation_date: "",
  confirmed_payment_date: "",
});
const MOCK_ACCOUNT: BankAccount = { id: "ba-1", name: "Main Account", iban: null };

const makeHook = (sourceProcedure = SOURCE_PROCEDURE) => {
  const onSuccess = vi.fn();
  const onClose = vi.fn();
  const { result } = renderHook(() =>
    useRecordOverpaymentModal({ sourceProcedure, onSuccess, onClose }),
  );
  return { result, onSuccess, onClose };
};

describe("useRecordOverpaymentModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ bankAccounts: [] });
  });

  // REF-070
  it("pre-fills bankAccountId when exactly one bank account exists", () => {
    useCacheStore.setState({ bankAccounts: [MOCK_ACCOUNT] });
    const { result } = makeHook();
    expect(result.current.bankAccountId).toBe("ba-1");
  });

  describe("REF-070 with several accounts", () => {
    const second: BankAccount = { id: "ba-2", name: "Second", iban: null };

    it("pre-fills the account of the source's original transfer", async () => {
      useCacheStore.setState({ bankAccounts: [MOCK_ACCOUNT, second] });
      mockSourceAccount.mockResolvedValue({ success: true, data: "ba-2" });
      const { result } = makeHook();
      await waitFor(() => expect(result.current.bankAccountId).toBe("ba-2"));
      expect(mockSourceAccount).toHaveBeenCalledWith("proc-1");
    });

    it.each([
      ["not resolvable", { success: true as const, data: null }],
      ["no longer in the list", { success: true as const, data: "ba-gone" }],
    ])("stays empty when the account is %s", async (_case, answer) => {
      useCacheStore.setState({ bankAccounts: [MOCK_ACCOUNT, second] });
      mockSourceAccount.mockResolvedValue(answer);
      const { result } = makeHook();
      await waitFor(() => expect(mockSourceAccount).toHaveBeenCalled());
      await act(async () => {});
      expect(result.current.bankAccountId).toBe("");
    });

    it("REF-071: stays empty when the account cannot be read", async () => {
      useCacheStore.setState({ bankAccounts: [MOCK_ACCOUNT, second] });
      mockSourceAccount.mockResolvedValue({ success: false, error: { code: "DatabaseError" } });
      const { result } = makeHook();
      await waitFor(() => expect(mockToast).toHaveBeenCalledWith("error", expect.any(String)));
      expect(result.current.bankAccountId).toBe("");
    });

    it("REF-071: stays empty when the lookup throws", async () => {
      useCacheStore.setState({ bankAccounts: [MOCK_ACCOUNT, second] });
      mockSourceAccount.mockRejectedValue(new Error("ipc down"));
      const { result } = makeHook();
      await waitFor(() => expect(mockToast).toHaveBeenCalledWith("error", "ipc down"));
      expect(result.current.bankAccountId).toBe("");
    });

    it("REF-072: the selector is usable while the pre-fill is pending", async () => {
      useCacheStore.setState({ bankAccounts: [MOCK_ACCOUNT, second] });
      mockSourceAccount.mockReturnValue(new Promise(() => {}));
      const { result } = makeHook();
      await waitFor(() => expect(mockSourceAccount).toHaveBeenCalled());
      expect(result.current.bankAccountId).toBe("");
      expect(result.current.loading).toBe(false);
    });

    it("REF-073: never overwrites a choice the user already made", async () => {
      useCacheStore.setState({ bankAccounts: [MOCK_ACCOUNT, second] });
      let answer: (value: { success: true; data: string }) => void = () => {};
      mockSourceAccount.mockReturnValue(
        new Promise((resolve) => {
          answer = resolve;
        }),
      );
      const { result } = makeHook();
      act(() => result.current.setBankAccountId("ba-1"));
      await act(async () => answer({ success: true, data: "ba-2" }));
      expect(result.current.bankAccountId).toBe("ba-1");
    });
  });

  it("REF-030: proposes the local date, not the UTC one", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 0, 1, 0, 30));
    const utc = vi.spyOn(Date.prototype, "toISOString").mockReturnValue("2025-12-31T23:30:00.000Z");
    try {
      const { result } = makeHook();
      expect(result.current.refundDate).toBe("2026-01-01");
    } finally {
      utc.mockRestore();
      vi.useRealTimers();
    }
  });

  it("REF-030: accepts a refund dated today and one dated the confirmed payment date", () => {
    const today = new Date(2026, 5, 15, 12);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(today);
    try {
      const { result } = makeHook({ ...SOURCE_PROCEDURE, confirmed_payment_date: "2026-06-10" });
      for (const date of ["2026-06-15", "2026-06-10"]) {
        act(() => result.current.setRefundDate(date));
        act(() => result.current.handleSubmit());
        expect(result.current.fieldErrors.refundDate).toBeUndefined();
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("REF-040: counts characters, so 255 emoji pass and the 256th does not", () => {
    useCacheStore.setState({ bankAccounts: [MOCK_ACCOUNT] });
    const { result } = makeHook();
    act(() => result.current.setReason("😀".repeat(255)));
    act(() => result.current.handleSubmit());
    expect(result.current.fieldErrors.reason).toBeUndefined();

    act(() => result.current.setReason("😀".repeat(256)));
    act(() => result.current.handleSubmit());
    expect(result.current.fieldErrors.reason).toBeTruthy();
  });

  it("handleSubmit sets fieldErrors when transferType and bankAccountId are missing", () => {
    const { result } = makeHook();
    act(() => result.current.handleSubmit());
    expect(result.current.fieldErrors.transferType).toBeTruthy();
    expect(result.current.fieldErrors.bankAccountId).toBeTruthy();
    expect(result.current.showConfirmation).toBe(false);
  });

  it("handleSubmit sets fieldErrors.refundDate when date is in the future", () => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const tomorrow = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
    const { result } = makeHook();
    act(() => {
      result.current.setRefundDate(tomorrow);
      result.current.setTransferType("CreditCard");
      result.current.setBankAccountId("ba-1");
    });
    act(() => result.current.handleSubmit());
    expect(result.current.fieldErrors.refundDate).toBeTruthy();
    expect(result.current.showConfirmation).toBe(false);
  });

  it("handleSubmit sets fieldErrors.reason when reason exceeds 255 chars", () => {
    const { result } = makeHook();
    act(() => {
      result.current.setTransferType("CreditCard");
      result.current.setBankAccountId("ba-1");
      result.current.setReason("x".repeat(256));
    });
    act(() => result.current.handleSubmit());
    expect(result.current.fieldErrors.reason).toBeTruthy();
  });

  it("handleSubmit sets showConfirmation=true when all fields are valid", () => {
    const { result } = makeHook();
    act(() => {
      result.current.setTransferType("CreditCard");
      result.current.setBankAccountId("ba-1");
    });
    act(() => result.current.handleSubmit());
    expect(result.current.showConfirmation).toBe(true);
    expect(Object.keys(result.current.fieldErrors)).toHaveLength(0);
  });

  it("handleConfirm calls onSuccess and onClose when gateway returns success", async () => {
    mockCreate.mockResolvedValue({ success: true, data: null });
    const { result, onSuccess, onClose } = makeHook();
    act(() => {
      result.current.setTransferType("CreditCard");
      result.current.setBankAccountId("ba-1");
    });
    act(() => result.current.handleSubmit());
    await act(async () => {
      await result.current.handleConfirm();
    });
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it("handleConfirm shows error toast and does not call onSuccess on gateway failure", async () => {
    mockCreate.mockResolvedValue({
      success: false,
      error: { code: "DatabaseError" } as OverpaymentError,
    });
    const { result, onSuccess } = makeHook();
    await act(async () => {
      await result.current.handleConfirm();
    });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith("error", expect.any(String));
    expect(result.current.loading).toBe(false);
  });

  it("handleConfirm shows error toast and does not call onSuccess on exception", async () => {
    mockCreate.mockRejectedValue(new Error("network error"));
    const { result, onSuccess } = makeHook();
    await act(async () => {
      await result.current.handleConfirm();
    });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith("error", expect.any(String));
    expect(result.current.loading).toBe(false);
  });

  it("handleSubmit sets fieldErrors.refundDate when date is before confirmed_payment_date (REF-030)", () => {
    const confirmedProc = makeProcedure({
      id: "proc-1",
      confirmed_payment_date: "2024-03-15",
      fund_reconciliation_date: "2024-01-05",
    });
    const { result } = makeHook(confirmedProc);
    act(() => {
      result.current.setRefundDate("2024-03-10"); // before confirmed 2024-03-15
      result.current.setTransferType("CreditCard");
      result.current.setBankAccountId("ba-1");
    });
    act(() => result.current.handleSubmit());
    expect(result.current.fieldErrors.refundDate).toBeTruthy();
    expect(result.current.showConfirmation).toBe(false);
  });

  it("handleConfirm shows unknown error toast when a non-Error exception is thrown", async () => {
    mockCreate.mockRejectedValue("plain string rejection");
    const { result, onSuccess } = makeHook();
    await act(async () => {
      await result.current.handleConfirm();
    });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith("error", expect.any(String));
    expect(result.current.loading).toBe(false);
  });

  it("handleCancelConfirmation resets showConfirmation to false", () => {
    const { result } = makeHook();
    act(() => {
      result.current.setTransferType("CreditCard");
      result.current.setBankAccountId("ba-1");
    });
    act(() => result.current.handleSubmit());
    expect(result.current.showConfirmation).toBe(true);
    act(() => result.current.handleCancelConfirmation());
    expect(result.current.showConfirmation).toBe(false);
  });
});

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BankAccount } from "@/bindings";
import { toastService } from "@/core/snackbar";
import { useAppStore } from "@/lib/appStore";
import { makeProcedure } from "@/tests/procedure.factory";
import { useRecordOverpaymentModal } from "./useRecordOverpaymentModal";

vi.mock("../gateway", () => ({
  createOverpayment: vi.fn(),
  cancelOverpayment: vi.fn(),
  getProcedureRefundBySource: vi.fn(),
  getProcedureRefundByRefundProcedure: vi.fn(),
}));

import * as gateway from "../gateway";

const mockCreate = vi.mocked(gateway.createOverpayment);
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
    useAppStore.setState({ bankAccounts: [] });
  });

  // REF-070
  it("pre-fills bankAccountId when exactly one bank account exists", () => {
    useAppStore.setState({ bankAccounts: [MOCK_ACCOUNT] });
    const { result } = makeHook();
    expect(result.current.bankAccountId).toBe("ba-1");
  });

  it("does not pre-fill bankAccountId when multiple accounts exist", () => {
    const second: BankAccount = { id: "ba-2", name: "Second", iban: null };
    useAppStore.setState({ bankAccounts: [MOCK_ACCOUNT, second] });
    const { result } = makeHook();
    expect(result.current.bankAccountId).toBe("");
  });

  it("handleSubmit sets fieldErrors when transferType and bankAccountId are missing", () => {
    const { result } = makeHook();
    act(() => result.current.handleSubmit());
    expect(result.current.fieldErrors.transferType).toBeTruthy();
    expect(result.current.fieldErrors.bankAccountId).toBeTruthy();
    expect(result.current.showConfirmation).toBe(false);
  });

  it("handleSubmit sets fieldErrors.refundDate when date is in the future", () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0]!;
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
    mockCreate.mockResolvedValue({ success: false, error: "Conflict" });
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

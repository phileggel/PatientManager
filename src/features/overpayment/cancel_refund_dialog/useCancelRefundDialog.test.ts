import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OverpaymentError } from "@/bindings";
import { toastService } from "@/ui/components/snackbar";
import { useCancelRefundDialog } from "./useCancelRefundDialog";

vi.mock("../gateway", () => ({
  cancelOverpayment: vi.fn(),
  createOverpayment: vi.fn(),
  getProcedureRefundBySource: vi.fn(),
  getProcedureRefundByRefundProcedure: vi.fn(),
}));

import * as gateway from "../gateway";

const mockCancel = vi.mocked(gateway.cancelOverpayment);
const mockToast = vi.mocked(toastService.show);

describe("useCancelRefundDialog", () => {
  const onSuccess = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls onSuccess and onClose when gateway returns success", async () => {
    mockCancel.mockResolvedValue({ success: true, data: null });

    const { result } = renderHook(() =>
      useCancelRefundDialog({ sourceProcedureId: "proc-1", onSuccess, onClose }),
    );

    await act(async () => {
      await result.current.handleConfirm();
    });

    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it("shows error toast and does not call onSuccess when gateway returns failure", async () => {
    mockCancel.mockResolvedValue({
      success: false,
      error: { code: "RefundRecordNotFound" } as OverpaymentError,
    });

    const { result } = renderHook(() =>
      useCancelRefundDialog({ sourceProcedureId: "proc-1", onSuccess, onClose }),
    );

    await act(async () => {
      await result.current.handleConfirm();
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith("error", expect.any(String));
    expect(result.current.loading).toBe(false);
  });

  it("shows error toast when gateway throws an exception", async () => {
    mockCancel.mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() =>
      useCancelRefundDialog({ sourceProcedureId: "proc-1", onSuccess, onClose }),
    );

    await act(async () => {
      await result.current.handleConfirm();
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith("error", expect.any(String));
    expect(result.current.loading).toBe(false);
  });
});

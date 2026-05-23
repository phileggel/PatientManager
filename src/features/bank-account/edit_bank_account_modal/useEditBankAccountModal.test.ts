import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeBankAccount } from "@/tests/bank.factory";
import { toastService } from "@/ui/components/snackbar";
import { useEditBankAccountModal } from "./useEditBankAccountModal";

vi.mock("../gateway", () => ({
  updateBankAccount: vi.fn(),
}));

import { updateBankAccount } from "../gateway";

const mockUpdate = vi.mocked(updateBankAccount);
const mockToast = vi.mocked(toastService.show);

describe("useEditBankAccountModal", () => {
  const onClose = vi.fn();
  const account = makeBankAccount({ id: "acc-1", name: "Main Account", iban: "FR76123" });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes formData from bankAccount prop", () => {
    const { result } = renderHook(() => useEditBankAccountModal(account, onClose));
    expect(result.current.formData.name).toBe("Main Account");
    expect(result.current.formData.iban).toBe("FR76123");
  });

  it("initializes empty form when bankAccount is null", () => {
    const { result } = renderHook(() => useEditBankAccountModal(null, onClose));
    expect(result.current.formData).toEqual({ name: "", iban: "" });
  });

  it("handleChange updates formData", () => {
    const { result } = renderHook(() => useEditBankAccountModal(account, onClose));

    act(() => {
      result.current.handleChange({
        target: { name: "name", value: "New Name" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.formData.name).toBe("New Name");
  });

  it("handleChange clears existing field error", async () => {
    const { result } = renderHook(() => useEditBankAccountModal(account, onClose));

    // Trigger validation error by submitting with empty name
    act(() => {
      result.current.handleChange({
        target: { name: "name", value: "" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.SyntheticEvent);
    });

    expect(result.current.errors.name).toBeTruthy();

    // Typing should clear the error
    act(() => {
      result.current.handleChange({
        target: { name: "name", value: "A" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.errors.name).toBeUndefined();
  });

  it("shows validation error and does not call gateway when name is empty", async () => {
    const empty = makeBankAccount({ name: "" });
    const { result } = renderHook(() => useEditBankAccountModal(empty, onClose));

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.SyntheticEvent);
    });

    expect(result.current.errors.name).toBeTruthy();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("calls updateBankAccount with trimmed name and null iban when iban is empty", async () => {
    const noIban = makeBankAccount({ id: "acc-2", name: "Account", iban: null });
    mockUpdate.mockResolvedValue({ success: true, data: noIban });
    const { result } = renderHook(() => useEditBankAccountModal(noIban, onClose));

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.SyntheticEvent);
    });

    expect(mockUpdate).toHaveBeenCalledWith("acc-2", "Account", null);
  });

  it("calls onClose and shows success toast on successful update", async () => {
    mockUpdate.mockResolvedValue({ success: true, data: account });
    const { result } = renderHook(() => useEditBankAccountModal(account, onClose));

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.SyntheticEvent);
    });

    expect(onClose).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith("success", expect.any(String));
  });

  it("shows error toast and keeps modal open on backend error", async () => {
    mockUpdate.mockResolvedValue({ success: false, error: "Name already taken" });
    const { result } = renderHook(() => useEditBankAccountModal(account, onClose));

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.SyntheticEvent);
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith("error", expect.any(String));
  });

  it("resets form and errors when bankAccount prop changes", async () => {
    mockUpdate.mockResolvedValue({ success: true, data: account });
    const { result, rerender } = renderHook(({ acct }) => useEditBankAccountModal(acct, onClose), {
      initialProps: { acct: account },
    });

    act(() => {
      result.current.handleChange({
        target: { name: "name", value: "" },
      } as React.ChangeEvent<HTMLInputElement>);
    });
    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.SyntheticEvent);
    });
    expect(result.current.errors.name).toBeTruthy();

    const newAccount = makeBankAccount({ id: "acc-2", name: "Other Account", iban: null });
    rerender({ acct: newAccount });

    expect(result.current.formData.name).toBe("Other Account");
    expect(result.current.errors).toEqual({});
  });
});

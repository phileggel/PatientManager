import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeBankAccount } from "@/tests/bank.factory";
import { toastService } from "@/ui/components/snackbar";
import { useAddBankAccountPanel } from "./useAddBankAccountPanel";

vi.mock("../gateway", () => ({
  createBankAccount: vi.fn(),
}));

import { createBankAccount } from "../gateway";

const mockCreate = vi.mocked(createBankAccount);
const mockToast = vi.mocked(toastService.show);

describe("useAddBankAccountPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets name error and does not call gateway when name is empty", async () => {
    const { result } = renderHook(() => useAddBankAccountPanel());

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>);
    });

    expect(result.current.errors.name).toBeTruthy();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("handleChange clears the error for the edited field", async () => {
    const { result } = renderHook(() => useAddBankAccountPanel());

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>);
    });
    expect(result.current.errors.name).toBeTruthy();

    act(() => {
      result.current.handleChange({
        target: { name: "name", value: "A" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.errors.name).toBeUndefined();
  });

  it("passes null iban to gateway when iban field is empty", async () => {
    mockCreate.mockResolvedValue({ success: true, data: makeBankAccount({ iban: null }) });

    const { result } = renderHook(() => useAddBankAccountPanel());

    act(() => {
      result.current.handleChange({
        target: { name: "name", value: "Main Account" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>);
    });

    expect(mockCreate).toHaveBeenCalledWith("Main Account", null);
  });

  it("resets form and shows success toast when gateway returns success", async () => {
    mockCreate.mockResolvedValue({ success: true, data: makeBankAccount() });

    const { result } = renderHook(() => useAddBankAccountPanel());

    act(() => {
      result.current.handleChange({
        target: { name: "name", value: "Main Account" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>);
    });

    expect(result.current.formData).toEqual({ name: "", iban: "" });
    expect(mockToast).toHaveBeenCalledWith("success", expect.any(String));
  });

  it("sets name error and shows error toast when gateway returns failure", async () => {
    mockCreate.mockResolvedValue({ success: false, error: { code: "IbanAlreadyUsed" } });

    const { result } = renderHook(() => useAddBankAccountPanel());

    act(() => {
      result.current.handleChange({
        target: { name: "name", value: "Main Account" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>);
    });

    expect(result.current.errors.name).toBeTruthy();
    expect(mockToast).toHaveBeenCalledWith("error", expect.any(String));
  });

  it("sets name error and shows error toast when gateway throws an exception", async () => {
    mockCreate.mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useAddBankAccountPanel());

    act(() => {
      result.current.handleChange({
        target: { name: "name", value: "Main Account" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>);
    });

    expect(result.current.errors.name).toBeTruthy();
    expect(mockToast).toHaveBeenCalledWith("error", expect.any(String));
    expect(result.current.loading).toBe(false);
  });
});

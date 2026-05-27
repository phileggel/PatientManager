import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makePatient } from "@/tests/patient.factory";
import { toastService } from "@/ui/components/snackbar";
import { useAddPatientPanel } from "./useAddPatientPanel";

vi.mock("../gateway", () => ({
  addPatient: vi.fn(),
}));

import { addPatient } from "../gateway";

const mockAdd = vi.mocked(addPatient);
const mockToast = vi.mocked(toastService.show);

describe("useAddPatientPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets name error and does not call gateway when name is empty", async () => {
    const { result } = renderHook(() => useAddPatientPanel());

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(result.current.errors.name).toBeTruthy();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("handleChange clears the error for the edited field", async () => {
    const { result } = renderHook(() => useAddPatientPanel());

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });
    expect(result.current.errors.name).toBeTruthy();

    act(() => {
      result.current.handleChange({
        target: { name: "name", value: "A" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.errors.name).toBeUndefined();
  });

  it("resets form and shows success toast when gateway returns success", async () => {
    mockAdd.mockResolvedValue({ success: true, data: { ...makePatient(), name: "Test" } });

    const { result } = renderHook(() => useAddPatientPanel());

    act(() => {
      result.current.handleChange({
        target: { name: "name", value: "Test Patient" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(result.current.formData.name).toBe("");
    expect(mockToast).toHaveBeenCalledWith("success", expect.any(String));
  });

  it("shows error toast and keeps form when gateway returns failure", async () => {
    mockAdd.mockResolvedValue({ success: false, error: { code: "DatabaseError" } });

    const { result } = renderHook(() => useAddPatientPanel());

    act(() => {
      result.current.handleChange({
        target: { name: "name", value: "Test Patient" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(result.current.formData.name).toBe("Test Patient");
    expect(mockToast).toHaveBeenCalledWith("error", expect.any(String));
  });

  it("shows error toast and resets loading when gateway throws an exception", async () => {
    mockAdd.mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useAddPatientPanel());

    act(() => {
      result.current.handleChange({
        target: { name: "name", value: "Test Patient" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(mockToast).toHaveBeenCalledWith("error", expect.any(String));
    expect(result.current.loading).toBe(false);
  });
});

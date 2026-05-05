import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Patient } from "@/bindings";
import { toastService } from "@/core/snackbar";
import { makePatient } from "@/tests/patient.factory";
import { useEditPatientModal } from "./useEditPatientModal";

vi.mock("../gateway", () => ({
  updatePatient: vi.fn(),
}));

import { updatePatient } from "../gateway";

const mockUpdate = vi.mocked(updatePatient);
const mockToast = vi.mocked(toastService.show);

function makeTestPatient(id: string, name: string | null, ssn: string): Patient {
  return { ...makePatient(), id, name, ssn };
}

describe("useEditPatientModal", () => {
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes formData from patient prop", () => {
    const patient = makeTestPatient("p-1", "Dupont Jean", "111456789");
    const { result } = renderHook(() => useEditPatientModal(patient, onSuccess));

    expect(result.current.formData.name).toBe("Dupont Jean");
    expect(result.current.formData.ssn).toBe("111456789");
  });

  it("initializes empty form when patient is null", () => {
    const { result } = renderHook(() => useEditPatientModal(null, onSuccess));

    expect(result.current.formData).toEqual({ name: "", ssn: "" });
  });

  it("resets formData and clears errors when patient prop changes", () => {
    const patient1 = makeTestPatient("p-1", "Dupont Jean", "111");
    const patient2 = makeTestPatient("p-2", "Martin Alice", "222");
    const { result, rerender } = renderHook(
      ({ patient }) => useEditPatientModal(patient, onSuccess),
      { initialProps: { patient: patient1 } },
    );

    rerender({ patient: patient2 });

    expect(result.current.formData.name).toBe("Martin Alice");
    expect(result.current.errors).toEqual({});
  });

  it("handleChange clears the error for the edited field", async () => {
    const patient = makeTestPatient("p-1", "", "111");
    const { result } = renderHook(() => useEditPatientModal(patient, onSuccess));

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

  it("does not call gateway when patient is null", async () => {
    const { result } = renderHook(() => useEditPatientModal(null, onSuccess));

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("sets name error and does not call gateway when name is empty", async () => {
    const patient = makeTestPatient("p-1", "", "111");
    const { result } = renderHook(() => useEditPatientModal(patient, onSuccess));

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(result.current.errors.name).toBeTruthy();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("calls onSuccess and shows success toast when update succeeds", async () => {
    const patient = makeTestPatient("p-1", "Dupont Jean", "111");
    mockUpdate.mockResolvedValue({ success: true, data: patient });

    const { result } = renderHook(() => useEditPatientModal(patient, onSuccess));

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(onSuccess).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith("success", expect.any(String));
  });

  it("shows error toast and does not call onSuccess when gateway returns failure", async () => {
    const patient = makeTestPatient("p-1", "Dupont Jean", "111");
    mockUpdate.mockResolvedValue({ success: false, error: "Duplicate name" });

    const { result } = renderHook(() => useEditPatientModal(patient, onSuccess));

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith("error", expect.any(String));
  });

  it("shows error toast when gateway throws an exception", async () => {
    const patient = makeTestPatient("p-1", "Dupont Jean", "111");
    mockUpdate.mockRejectedValue(new Error("network failure"));

    const { result } = renderHook(() => useEditPatientModal(patient, onSuccess));

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith("error", expect.any(String));
    expect(result.current.loading).toBe(false);
  });
});

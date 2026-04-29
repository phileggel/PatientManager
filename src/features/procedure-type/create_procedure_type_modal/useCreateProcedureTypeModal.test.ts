import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCreateProcedureTypeModal } from "./useCreateProcedureTypeModal";

vi.mock("../gateway", () => ({
  addProcedureType: vi.fn(),
}));

import { toastService } from "@/core/snackbar";
import { addProcedureType } from "../gateway";

const mockAddProcedureType = vi.mocked(addProcedureType);
const mockToast = vi.mocked(toastService.show);

describe("useCreateProcedureTypeModal", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates form data on handleChange", () => {
    const { result } = renderHook(() => useCreateProcedureTypeModal(true, onClose));

    act(() => {
      result.current.handleChange({
        target: { name: "name", value: "Consultation" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.formData.name).toBe("Consultation");
  });

  it("shows validation error when name is empty", async () => {
    const { result } = renderHook(() => useCreateProcedureTypeModal(true, onClose));

    await act(async () => {
      result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(result.current.errors.name).toBeTruthy();
    expect(mockAddProcedureType).not.toHaveBeenCalled();
  });

  it("calls addProcedureType and closes modal on success", async () => {
    mockAddProcedureType.mockResolvedValue({ success: true, data: {} as never });

    const { result } = renderHook(() => useCreateProcedureTypeModal(true, onClose));

    act(() => {
      result.current.handleChange({
        target: { name: "name", value: "Consultation" },
      } as React.ChangeEvent<HTMLInputElement>);
      result.current.handleChange({
        target: { name: "defaultAmount", value: "50" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(mockAddProcedureType).toHaveBeenCalledWith("Consultation", 50000, undefined);
    expect(mockToast).toHaveBeenCalledWith("success", expect.any(String));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows error toast and keeps modal open on backend error (duplicate)", async () => {
    mockAddProcedureType.mockResolvedValue({
      success: false,
      error: "Un type d'acte portant ce nom existe déjà",
    });

    const { result } = renderHook(() => useCreateProcedureTypeModal(true, onClose));

    act(() => {
      result.current.handleChange({
        target: { name: "name", value: "Consultation" },
      } as React.ChangeEvent<HTMLInputElement>);
      result.current.handleChange({
        target: { name: "defaultAmount", value: "50" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(mockToast).toHaveBeenCalledWith("error", expect.any(String));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("resets form when modal is closed", () => {
    const { result, rerender } = renderHook(
      ({ isOpen }) => useCreateProcedureTypeModal(isOpen, onClose),
      { initialProps: { isOpen: true } },
    );

    act(() => {
      result.current.handleChange({
        target: { name: "name", value: "Filled" },
      } as React.ChangeEvent<HTMLInputElement>);
    });
    expect(result.current.formData.name).toBe("Filled");

    rerender({ isOpen: false });

    expect(result.current.formData.name).toBe("");
  });
});

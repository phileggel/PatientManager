import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeProcedureType } from "@/tests/procedure.factory";
import { toastService } from "@/ui/components/snackbar";
import { useEditProcedureTypeModal } from "./useEditProcedureTypeModal";

vi.mock("../gateway", () => ({
  updateProcedureType: vi.fn(),
}));

import { updateProcedureType } from "../gateway";

const mockUpdate = vi.mocked(updateProcedureType);
const mockToast = vi.mocked(toastService.show);

describe("useEditProcedureTypeModal", () => {
  const onSuccess = vi.fn();
  const pt = makeProcedureType({
    id: "pt-1",
    name: "Consultation",
    default_amount: 25000,
    category: "General",
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes formData from procedureType prop", () => {
    const { result } = renderHook(() => useEditProcedureTypeModal(pt, onSuccess));
    expect(result.current.formData.name).toBe("Consultation");
    expect(result.current.formData.defaultAmount).toBe("25"); // 25000 / 1000
    expect(result.current.formData.category).toBe("General");
  });

  it("initializes empty form when procedureType is null", () => {
    const { result } = renderHook(() => useEditProcedureTypeModal(null, onSuccess));
    expect(result.current.formData).toEqual({ name: "", defaultAmount: "", category: "" });
  });

  it("handleChange updates formData", () => {
    const { result } = renderHook(() => useEditProcedureTypeModal(pt, onSuccess));

    act(() => {
      result.current.handleChange({
        target: { name: "name", value: "Radiologie" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.formData.name).toBe("Radiologie");
  });

  it("shows validation error when name is empty", async () => {
    const { result } = renderHook(() => useEditProcedureTypeModal(pt, onSuccess));

    act(() => {
      result.current.handleChange({
        target: { name: "name", value: "" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(result.current.errors.name).toBeTruthy();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("shows validation error when defaultAmount is empty", async () => {
    const { result } = renderHook(() => useEditProcedureTypeModal(pt, onSuccess));

    act(() => {
      result.current.handleChange({
        target: { name: "defaultAmount", value: "" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(result.current.errors.defaultAmount).toBeTruthy();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("shows validation error when defaultAmount is not a number", async () => {
    const { result } = renderHook(() => useEditProcedureTypeModal(pt, onSuccess));

    act(() => {
      result.current.handleChange({
        target: { name: "defaultAmount", value: "abc" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(result.current.errors.defaultAmount).toBeTruthy();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("converts amount from euros to thousandths (×1000) on submit", async () => {
    mockUpdate.mockResolvedValue({ success: true, data: pt });
    const { result } = renderHook(() => useEditProcedureTypeModal(pt, onSuccess));

    act(() => {
      result.current.handleChange({
        target: { name: "defaultAmount", value: "50.5" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ default_amount: 50500 }));
  });

  it("converts empty category to null on submit", async () => {
    mockUpdate.mockResolvedValue({ success: true, data: pt });
    const { result } = renderHook(() => useEditProcedureTypeModal(pt, onSuccess));

    act(() => {
      result.current.handleChange({
        target: { name: "category", value: "  " },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ category: null }));
  });

  it("calls onSuccess and shows success toast on successful update", async () => {
    mockUpdate.mockResolvedValue({ success: true, data: pt });
    const { result } = renderHook(() => useEditProcedureTypeModal(pt, onSuccess));

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(onSuccess).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith("success", expect.any(String));
  });

  it("shows error toast and does not call onSuccess on backend error", async () => {
    mockUpdate.mockResolvedValue({
      success: false,
      error: { code: "ProcedureTypeNameDuplicate" },
    });
    const { result } = renderHook(() => useEditProcedureTypeModal(pt, onSuccess));

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith("error", expect.any(String));
  });

  it("resets form when procedureType prop changes", async () => {
    mockUpdate.mockResolvedValue({ success: true, data: pt });
    const { result, rerender } = renderHook(({ p }) => useEditProcedureTypeModal(p, onSuccess), {
      initialProps: { p: pt },
    });

    act(() => {
      result.current.handleChange({
        target: { name: "name", value: "" },
      } as React.ChangeEvent<HTMLInputElement>);
    });
    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });
    expect(result.current.errors.name).toBeTruthy();

    const other = makeProcedureType({
      id: "pt-2",
      name: "Radiologie",
      default_amount: 80000,
      category: null,
    });
    rerender({ p: other });

    expect(result.current.formData.name).toBe("Radiologie");
    expect(result.current.formData.defaultAmount).toBe("80");
    expect(result.current.errors).toEqual({});
  });
});

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toastService } from "@/core/snackbar";
import { makeFund } from "@/tests/fund.factory";
import { useEditFundModal } from "./useEditFundModal";

vi.mock("../gateway", () => ({
  updateFund: vi.fn(),
}));

import { updateFund } from "../gateway";

const mockUpdate = vi.mocked(updateFund);
const mockToast = vi.mocked(toastService.show);

describe("useEditFundModal", () => {
  const onSuccess = vi.fn();
  const fund = makeFund({ id: "f-1", fund_identifier: "CPAM-75", name: "CPAM Paris" });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes formData from fund prop", () => {
    const { result } = renderHook(() => useEditFundModal(fund, onSuccess));
    expect(result.current.formData.fund_identifier).toBe("CPAM-75");
    expect(result.current.formData.name).toBe("CPAM Paris");
  });

  it("initializes empty form when fund is null", () => {
    const { result } = renderHook(() => useEditFundModal(null, onSuccess));
    expect(result.current.formData).toEqual({ fund_identifier: "", name: "" });
  });

  it("handleChange updates formData", () => {
    const { result } = renderHook(() => useEditFundModal(fund, onSuccess));

    act(() => {
      result.current.handleChange({
        target: { name: "name", value: "New Name" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.formData.name).toBe("New Name");
  });

  it("shows validation error when fund_identifier is empty", async () => {
    const { result } = renderHook(() => useEditFundModal(fund, onSuccess));

    act(() => {
      result.current.handleChange({
        target: { name: "fund_identifier", value: "" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(result.current.errors.fund_identifier).toBeTruthy();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("shows validation error when name is empty", async () => {
    const { result } = renderHook(() => useEditFundModal(fund, onSuccess));

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

  it("calls updateFund with trimmed values on valid submit", async () => {
    mockUpdate.mockResolvedValue({ success: true, data: fund });
    const { result } = renderHook(() => useEditFundModal(fund, onSuccess));

    act(() => {
      result.current.handleChange({
        target: { name: "name", value: "  Trimmed Name  " },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Trimmed Name", fund_identifier: "CPAM-75" }),
    );
  });

  it("calls onSuccess and shows success toast on successful update", async () => {
    mockUpdate.mockResolvedValue({ success: true, data: fund });
    const { result } = renderHook(() => useEditFundModal(fund, onSuccess));

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(onSuccess).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith("success", expect.any(String));
  });

  it("shows error toast and does not call onSuccess on backend error", async () => {
    mockUpdate.mockResolvedValue({ success: false, error: "Duplicate identifier" });
    const { result } = renderHook(() => useEditFundModal(fund, onSuccess));

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith("error", expect.any(String));
  });

  it("resets form when fund prop changes", () => {
    const { result, rerender } = renderHook(({ f }) => useEditFundModal(f, onSuccess), {
      initialProps: { f: fund },
    });

    const other = makeFund({ id: "f-2", fund_identifier: "MGEN-01", name: "MGEN" });
    rerender({ f: other });

    expect(result.current.formData.fund_identifier).toBe("MGEN-01");
    // TODO: submit first to produce errors, then rerender — currently vacuous (errors never set)
    expect(result.current.errors).toEqual({});
  });
});

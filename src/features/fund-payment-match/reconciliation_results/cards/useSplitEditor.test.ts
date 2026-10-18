import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedPdfLine } from "@/bindings";
import { useSplitEditor } from "./useSplitEditor";

vi.mock("../../gateway", () => ({ checkSplitIntoProcedures: vi.fn() }));
vi.mock("@/ui/components/snackbar", () => ({ toastService: { show: vi.fn() } }));

import * as gateway from "../../gateway";

const LINE: NormalizedPdfLine = {
  line_index: 4,
  payment_date: "2026-10-05",
  invoice_number: "F-1",
  fund_name: "CPAM n° 931",
  patient_name: "Test Patient",
  ssn: "1000000000000",
  nature: "SEANCE",
  procedure_start_date: "2026-09-01",
  procedure_end_date: "2026-09-30",
  is_period: true,
  amount: 135000,
};

const onAccept = vi.fn();

describe("useSplitEditor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("FPA-252: opens with one row at the line's start date and no amount", () => {
    const { result } = renderHook(() => useSplitEditor(LINE, onAccept));
    expect(result.current.rows).toEqual([{ date: "2026-09-01", amount: null }]);
  });

  it("FPA-253: the total is the sum of the rows, for display only", () => {
    const { result } = renderHook(() => useSplitEditor(LINE, onAccept));
    act(() => {
      result.current.setAmount(0, 45);
      result.current.addRow();
    });
    act(() => result.current.setAmount(1, 90));
    expect(result.current.total).toBe(135000);
  });

  it("FPA-258: validating sends every row to the backend, then accepts the split", async () => {
    vi.mocked(gateway.checkSplitIntoProcedures).mockResolvedValue({ success: true, data: null });
    const { result } = renderHook(() => useSplitEditor(LINE, onAccept));
    act(() => result.current.setAmount(0, 135));

    await act(async () => {
      await result.current.validate();
    });

    const parts = [{ procedure_date: "2026-09-01", billed_amount: 135000 }];
    expect(gateway.checkSplitIntoProcedures).toHaveBeenCalledWith(LINE, parts);
    expect(onAccept).toHaveBeenCalledWith(parts);
  });

  it("FPA-254A: a refused split shows the total's and each row's messages, accepts nothing", async () => {
    vi.mocked(gateway.checkSplitIntoProcedures).mockResolvedValue({
      success: false,
      error: { code: "SplitInvalid", reasons: ["TotalMismatch"], parts: [[], ["DateOutOfRange"]] },
    });
    const { result } = renderHook(() => useSplitEditor(LINE, onAccept));
    act(() => result.current.addRow());

    await act(async () => {
      await result.current.validate();
    });

    expect(result.current.errors.split).toBe("fund-payment-match:split.errors.total_mismatch");
    expect(result.current.errors.parts[1]?.date).toBe(
      "fund-payment-match:split.errors.date_out_of_range",
    );
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("FPA-254B: editing a row's date clears that date's message only", async () => {
    vi.mocked(gateway.checkSplitIntoProcedures).mockResolvedValue({
      success: false,
      error: {
        code: "SplitInvalid",
        reasons: [],
        parts: [["DateOutOfRange", "AmountEmpty"]],
      },
    });
    const { result } = renderHook(() => useSplitEditor(LINE, onAccept));
    await act(async () => {
      await result.current.validate();
    });

    act(() => result.current.setDate(0, "2026-09-04"));

    expect(result.current.errors.parts[0]).toEqual({
      amount: "fund-payment-match:split.errors.amount_empty",
    });
  });

  it("FPA-254B: an amount edit clears the total's message, a removed row every message", async () => {
    vi.mocked(gateway.checkSplitIntoProcedures).mockResolvedValue({
      success: false,
      error: { code: "SplitInvalid", reasons: ["TotalMismatch"], parts: [["DateOutOfRange"], []] },
    });
    const { result } = renderHook(() => useSplitEditor(LINE, onAccept));
    act(() => result.current.addRow());
    await act(async () => {
      await result.current.validate();
    });

    act(() => result.current.setAmount(1, 10));
    expect(result.current.errors.split).toBeUndefined();
    expect(result.current.errors.parts[0]?.date).toBeTruthy();

    act(() => result.current.removeRow(1));
    expect(result.current.errors).toEqual({ parts: [] });
    expect(result.current.rows).toHaveLength(1);
  });

  it("FPA-254A: a failure that is not a split refusal goes to the snackbar", async () => {
    const { toastService } = await import("@/ui/components/snackbar");
    vi.mocked(gateway.checkSplitIntoProcedures).mockResolvedValue({
      success: false,
      error: { code: "DatabaseError" },
    });
    const { result } = renderHook(() => useSplitEditor(LINE, onAccept));

    await act(async () => {
      await result.current.validate();
    });

    expect(toastService.show).toHaveBeenCalledWith("error", expect.any(String));
    expect(result.current.errors).toEqual({ parts: [] });
    expect(onAccept).not.toHaveBeenCalled();
  });
});

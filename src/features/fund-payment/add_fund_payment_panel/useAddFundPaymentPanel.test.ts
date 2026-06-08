import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Fund, Procedure } from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";
import { makeProcedure } from "@/tests/procedure.factory";
import { useAddFundPaymentPanel } from "./useAddFundPaymentPanel";

vi.mock("../gateway", () => ({
  getUnpaidProceduresByFund: vi.fn(),
  createFundPayment: vi.fn(),
  deleteFundPaymentGroup: vi.fn(),
  updatePaymentGroupWithProcedures: vi.fn(),
  getFundPaymentGroupEditData: vi.fn(),
}));

import { createFundPayment } from "../gateway";

const mockCreate = vi.mocked(createFundPayment);

const mockFunds: Fund[] = [
  {
    id: "f1",
    fund_identifier: "CPAM",
    name: "CPAM France",
    temp_id: null,
  },
  {
    id: "f2",
    fund_identifier: "MGEN",
    name: "MGEN Santé",
    temp_id: null,
  },
  {
    id: "f3",
    fund_identifier: "MSA",
    name: "MSA Protection",
    temp_id: null,
  },
];

describe("useAddFundPaymentPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ funds: mockFunds });
  });

  it("initializes with empty fund selection and payment date", () => {
    const { result } = renderHook(() => useAddFundPaymentPanel());

    expect(result.current.selectedFundId).toBe("");
    expect(result.current.paymentDate).toBe("");
  });

  it("creates selector options with all funds sorted by identifier", () => {
    const { result } = renderHook(() => useAddFundPaymentPanel());

    expect(result.current.fundSelectorLabels).toHaveLength(4); // "Select a fund" + 3 funds
    expect(result.current.fundSelectorLabels[0]).toEqual({
      label: "Select a fund",
      value: "",
    });

    // Should be sorted by fund_identifier (CPAM, MGEN, MSA)
    expect(result.current.fundSelectorLabels[1]).toEqual({
      label: "CPAM (CPAM France)",
      value: "f1",
    });
    expect(result.current.fundSelectorLabels[2]).toEqual({
      label: "MGEN (MGEN Santé)",
      value: "f2",
    });
    expect(result.current.fundSelectorLabels[3]).toEqual({
      label: "MSA (MSA Protection)",
      value: "f3",
    });
  });

  it("updates selectedFundId when setSelectedFundId is called", () => {
    const { result } = renderHook(() => useAddFundPaymentPanel());

    act(() => {
      result.current.setSelectedFundId("f1");
    });

    expect(result.current.selectedFundId).toBe("f1");
  });

  it("updates paymentDate when setPaymentDate is called", () => {
    const { result } = renderHook(() => useAddFundPaymentPanel());

    act(() => {
      result.current.setPaymentDate("2025-02-15");
    });

    expect(result.current.paymentDate).toBe("2025-02-15");
  });

  it("computes selectedFund from selectedFundId", () => {
    const { result } = renderHook(() => useAddFundPaymentPanel());

    expect(result.current.selectedFund).toBeNull();

    act(() => {
      result.current.setSelectedFundId("f2");
    });

    expect(result.current.selectedFund).toEqual({
      fundIdentifier: "MGEN",
      fundName: "MGEN Santé",
    });
  });

  it("returns null selectedFund when no fund is selected", () => {
    const { result } = renderHook(() => useAddFundPaymentPanel());

    expect(result.current.selectedFund).toBeNull();
  });

  it("does not open modal when fund is not selected", () => {
    const { result } = renderHook(() => useAddFundPaymentPanel());

    act(() => {
      result.current.setPaymentDate("2025-02-15");
      const mockEvent = {
        preventDefault: vi.fn(),
      } as unknown as React.SyntheticEvent;
      result.current.handleOpenSelection(mockEvent);
    });

    expect(result.current.isModalOpen).toBe(false);
  });

  it("does not open modal when payment date is not entered", () => {
    const { result } = renderHook(() => useAddFundPaymentPanel());

    act(() => {
      result.current.setSelectedFundId("f1");
      const mockEvent = {
        preventDefault: vi.fn(),
      } as unknown as React.SyntheticEvent;
      result.current.handleOpenSelection(mockEvent);
    });

    expect(result.current.isModalOpen).toBe(false);
  });

  it("stores selected procedures when confirmed from modal", () => {
    const { result } = renderHook(() => useAddFundPaymentPanel());

    const mockProcedures: Procedure[] = [
      {
        id: "p1",
        patient_id: "pat1",
        fund_id: "f1",
        procedure_type_id: "pt1",
        procedure_date: "2025-02-01",
        billed_amount: 50,
        payment_method: "NONE",
        fund_reconciliation_date: "",

        confirmed_payment_date: "",
        paid_amount: null,
        payment_status: "CREATED",
      },
    ];

    act(() => {
      result.current.handleConfirmSelection(mockProcedures);
    });

    // Verify procedures are selected
    expect(result.current.selectionSummary.count).toBe(1);
    expect(result.current.isModalOpen).toBe(false);
  });

  it("handles empty fund array gracefully", () => {
    useCacheStore.setState({ funds: [] });
    const { result } = renderHook(() => useAddFundPaymentPanel());

    expect(result.current.fundSelectorLabels).toEqual([{ label: "Select a fund", value: "" }]);
    expect(result.current.selectedFund).toBeNull();
  });

  it("sorts funds by identifier correctly with special characters", () => {
    const fundsWithSpecialChars: Fund[] = [
      {
        id: "f1",
        fund_identifier: "Z-FUND",
        name: "Z Fund",
        temp_id: null,
      },
      {
        id: "f2",
        fund_identifier: "A-FUND",
        name: "A Fund",
        temp_id: null,
      },
      {
        id: "f3",
        fund_identifier: "M-FUND",
        name: "M Fund",
        temp_id: null,
      },
    ];

    useCacheStore.setState({ funds: fundsWithSpecialChars });
    const { result } = renderHook(() => useAddFundPaymentPanel());

    // Should be sorted: A-FUND, M-FUND, Z-FUND
    expect(result.current.fundSelectorLabels).toHaveLength(4);
    expect(result.current.fundSelectorLabels[1]?.label).toBe("A-FUND (A Fund)");
    expect(result.current.fundSelectorLabels[2]?.label).toBe("M-FUND (M Fund)");
    expect(result.current.fundSelectorLabels[3]?.label).toBe("Z-FUND (Z Fund)");
  });

  it("setSelectedFundId clears fund error when a fund error is already set", async () => {
    const { result } = renderHook(() => useAddFundPaymentPanel());

    // Trigger validation to set the fund error
    await act(async () => {
      result.current.handleOpenSelection();
    });
    expect(result.current.errors.fund).toBeTruthy();

    act(() => result.current.setSelectedFundId("f1"));

    expect(result.current.errors.fund).toBeUndefined();
  });

  it("setPaymentDate clears paymentDate error when a date error is already set", async () => {
    const { result } = renderHook(() => useAddFundPaymentPanel());

    act(() => result.current.setSelectedFundId("f1"));
    await act(async () => {
      result.current.handleOpenSelection();
    });
    expect(result.current.errors.paymentDate).toBeTruthy();

    act(() => result.current.setPaymentDate("2026-01-15"));

    expect(result.current.errors.paymentDate).toBeUndefined();
  });

  it("handleOpenSelection opens modal when fund and date are both valid", async () => {
    const { result } = renderHook(() => useAddFundPaymentPanel());

    act(() => {
      result.current.setSelectedFundId("f1");
      result.current.setPaymentDate("2026-01-15");
    });

    act(() => result.current.handleOpenSelection());

    expect(result.current.isModalOpen).toBe(true);
  });

  it("handleConfirmSelection clears procedures error when procedures are provided", async () => {
    const proc = makeProcedure({ id: "p1" });
    const { result } = renderHook(() => useAddFundPaymentPanel());

    act(() => {
      result.current.setSelectedFundId("f1");
      result.current.setPaymentDate("2026-01-15");
    });
    // trigger procedures error via handleCreatePayment (no procedures selected)
    await act(async () => {
      await result.current.handleCreatePayment();
    });
    expect(result.current.errors.procedures).toBeTruthy();

    act(() => result.current.handleConfirmSelection([proc]));

    expect(result.current.errors.procedures).toBeUndefined();
  });

  it("handleCreatePayment returns success:false and sets errors when validation fails", async () => {
    const { result } = renderHook(() => useAddFundPaymentPanel());

    const outcome = await act(async () => result.current.handleCreatePayment());

    expect(outcome).toEqual({ success: false });
    expect(result.current.errors.fund).toBeTruthy();
  });

  it("handleCreatePayment resets state and returns success:true on gateway success", async () => {
    mockCreate.mockResolvedValue({ success: true, data: undefined as never });

    const proc = makeProcedure({ id: "p1" });
    const { result } = renderHook(() => useAddFundPaymentPanel());

    act(() => {
      result.current.setSelectedFundId("f1");
      result.current.setPaymentDate("2026-01-15");
      result.current.handleConfirmSelection([proc]);
    });

    const outcome = await act(async () => result.current.handleCreatePayment());

    expect(outcome).toEqual({ success: true });
    expect(result.current.selectedFundId).toBe("");
    expect(result.current.paymentDate).toBe("");
  });

  it("handleCreatePayment maps a typed gateway error to a translated message (F27)", async () => {
    mockCreate.mockResolvedValue({ success: false, error: { code: "DatabaseError" } });

    const proc = makeProcedure({ id: "p1" });
    const { result } = renderHook(() => useAddFundPaymentPanel());

    act(() => {
      result.current.setSelectedFundId("f1");
      result.current.setPaymentDate("2026-01-15");
      result.current.handleConfirmSelection([proc]);
    });

    const outcome = await act(async () => result.current.handleCreatePayment());

    expect(outcome?.success).toBe(false);
    expect(outcome && "error" in outcome ? outcome.error : "").toMatch(/database/i);
    expect(result.current.isSubmitting).toBe(false);
  });
});

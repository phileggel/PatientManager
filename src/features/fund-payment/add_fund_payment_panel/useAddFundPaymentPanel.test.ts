import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AffiliatedFund, Procedure } from "@/bindings";
import { useAppStore } from "@/lib/appStore";
import { useAddFundPaymentPanel } from "./useAddFundPaymentPanel";

const mockFunds: AffiliatedFund[] = [
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
    // Mock the app store to return our test funds
    useAppStore.setState({ funds: mockFunds });
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
        procedure_amount: 50,
        payment_method: "NONE",
        confirmed_payment_date: "",
        actual_payment_amount: null,
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
    useAppStore.setState({ funds: [] });
    const { result } = renderHook(() => useAddFundPaymentPanel());

    expect(result.current.fundSelectorLabels).toEqual([{ label: "Select a fund", value: "" }]);
    expect(result.current.selectedFund).toBeNull();
  });

  it("sorts funds by identifier correctly with special characters", () => {
    const fundsWithSpecialChars: AffiliatedFund[] = [
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

    useAppStore.setState({ funds: fundsWithSpecialChars });
    const { result } = renderHook(() => useAddFundPaymentPanel());

    // Should be sorted: A-FUND, M-FUND, Z-FUND
    expect(result.current.fundSelectorLabels).toHaveLength(4);
    expect(result.current.fundSelectorLabels[1]?.label).toBe("A-FUND (A Fund)");
    expect(result.current.fundSelectorLabels[2]?.label).toBe("M-FUND (M Fund)");
    expect(result.current.fundSelectorLabels[3]?.label).toBe("Z-FUND (Z Fund)");
  });
});

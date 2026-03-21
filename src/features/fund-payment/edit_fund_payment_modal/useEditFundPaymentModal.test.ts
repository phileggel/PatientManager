import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FundPaymentGroup, Patient, Procedure } from "@/bindings";
import { useAppStore } from "@/lib/appStore";
import * as gateway from "../gateway";

vi.mock("../gateway");
vi.mock("@/core/snackbar", () => ({
  toastService: { show: vi.fn(), subscribe: vi.fn(() => vi.fn()) },
}));

import { useEditFundPaymentModal } from "./useEditFundPaymentModal";

const makePayment = (overrides?: Partial<FundPaymentGroup>): FundPaymentGroup => ({
  id: "group-1",
  fund_id: "fund-1",
  payment_date: "2025-03-01",
  total_amount: 150000,
  lines: [{ id: "line-1", fund_payment_group_id: "group-1", procedure_id: "proc-1" }],
  status: "ACTIVE",
  is_locked: false,
  ...overrides,
});

const mockPatients: Patient[] = [
  {
    id: "pat-1",
    name: "Marie Dupont",
    ssn: null,
    is_anonymous: false,
    temp_id: null,
    latest_procedure_type: null,
    latest_fund: null,
    latest_date: "",
    latest_procedure_amount: null,
  },
];

const mockCurrentProcedure: Procedure = {
  id: "proc-1",
  patient_id: "pat-1",
  fund_id: "fund-1",
  procedure_type_id: "pt-1",
  procedure_date: "2025-02-01",
  procedure_amount: 75000,
  payment_method: "NONE" as const,
  confirmed_payment_date: "",
  actual_payment_amount: null,
  payment_status: "RECONCILIATED" as const,
};

const mockAvailableProcedure: Procedure = {
  id: "proc-2",
  patient_id: "pat-1",
  fund_id: "fund-1",
  procedure_type_id: "pt-1",
  procedure_date: "2025-02-10",
  procedure_amount: 50000,
  payment_method: "NONE" as const,
  confirmed_payment_date: "",
  actual_payment_amount: null,
  payment_status: "CREATED" as const,
};

describe("useEditFundPaymentModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ patients: mockPatients, funds: [] });
  });

  it("initializes with payment date from group", () => {
    vi.mocked(gateway.getFundPaymentGroupEditData).mockResolvedValue({
      success: true,
      data: { current_procedures: [], available_procedures: [] },
    });

    const { result } = renderHook(() => useEditFundPaymentModal(makePayment(), vi.fn()));

    expect(result.current.paymentDate).toBe("2025-03-01");
    expect(result.current.loading).toBe(true);
  });

  it("loads current and available procedures on mount", async () => {
    vi.mocked(gateway.getFundPaymentGroupEditData).mockResolvedValue({
      success: true,
      data: {
        current_procedures: [mockCurrentProcedure],
        available_procedures: [mockAvailableProcedure],
      },
    });

    const { result } = renderHook(() => useEditFundPaymentModal(makePayment(), vi.fn()));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.currentProcedures).toHaveLength(1);
    expect(result.current.proceduresForModal).toHaveLength(1);
    expect(gateway.getFundPaymentGroupEditData).toHaveBeenCalledWith("group-1", "fund-1");
  });

  it("pre-selects all current procedures on load", async () => {
    vi.mocked(gateway.getFundPaymentGroupEditData).mockResolvedValue({
      success: true,
      data: {
        current_procedures: [mockCurrentProcedure],
        available_procedures: [mockAvailableProcedure],
      },
    });

    const { result } = renderHook(() => useEditFundPaymentModal(makePayment(), vi.fn()));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.selectedIds.has("proc-1")).toBe(true);
    expect(result.current.selectedIds.has("proc-2")).toBe(false);
  });

  it("toggleId removes a selected current procedure", async () => {
    vi.mocked(gateway.getFundPaymentGroupEditData).mockResolvedValue({
      success: true,
      data: {
        current_procedures: [mockCurrentProcedure],
        available_procedures: [],
      },
    });

    const { result } = renderHook(() => useEditFundPaymentModal(makePayment(), vi.fn()));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.selectedIds.has("proc-1")).toBe(true);

    act(() => result.current.toggleId("proc-1"));

    expect(result.current.selectedIds.has("proc-1")).toBe(false);
  });

  it("handleProceduresAdded adds procedures to selectedIds", async () => {
    vi.mocked(gateway.getFundPaymentGroupEditData).mockResolvedValue({
      success: true,
      data: {
        current_procedures: [mockCurrentProcedure],
        available_procedures: [mockAvailableProcedure],
      },
    });

    const { result } = renderHook(() => useEditFundPaymentModal(makePayment(), vi.fn()));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.selectedIds.has("proc-2")).toBe(false);

    act(() => result.current.handleProceduresAdded([mockAvailableProcedure]));

    expect(result.current.selectedIds.has("proc-2")).toBe(true);
  });

  it("handleProceduresAdded closes the select modal", async () => {
    vi.mocked(gateway.getFundPaymentGroupEditData).mockResolvedValue({
      success: true,
      data: { current_procedures: [], available_procedures: [] },
    });

    const { result } = renderHook(() => useEditFundPaymentModal(makePayment(), vi.fn()));

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.openSelectModal());
    expect(result.current.isSelectModalOpen).toBe(true);

    act(() => result.current.handleProceduresAdded([]));
    expect(result.current.isSelectModalOpen).toBe(false);
  });

  it("totalAmount reflects selected procedures", async () => {
    vi.mocked(gateway.getFundPaymentGroupEditData).mockResolvedValue({
      success: true,
      data: {
        current_procedures: [mockCurrentProcedure],
        available_procedures: [mockAvailableProcedure],
      },
    });

    const { result } = renderHook(() => useEditFundPaymentModal(makePayment(), vi.fn()));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Only proc-1 (75000) is selected
    expect(result.current.totalAmount).toBe(75000);

    // Add proc-2 (50000)
    act(() => result.current.handleProceduresAdded([mockAvailableProcedure]));
    expect(result.current.totalAmount).toBe(125000);
  });

  it("getPatientName resolves patient name from store", async () => {
    vi.mocked(gateway.getFundPaymentGroupEditData).mockResolvedValue({
      success: true,
      data: { current_procedures: [], available_procedures: [] },
    });

    const { result } = renderHook(() => useEditFundPaymentModal(makePayment(), vi.fn()));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.getPatientName("pat-1")).toBe("Marie Dupont");
    expect(result.current.getPatientName("unknown")).toBe("unknown");
  });

  it("handleSubmit calls updatePaymentGroupWithProcedures with selected procedures", async () => {
    vi.mocked(gateway.getFundPaymentGroupEditData).mockResolvedValue({
      success: true,
      data: {
        current_procedures: [mockCurrentProcedure],
        available_procedures: [],
      },
    });
    vi.mocked(gateway.updatePaymentGroupWithProcedures).mockResolvedValue({
      success: true,
      data: makePayment(),
    });

    const onClose = vi.fn();
    const { result } = renderHook(() => useEditFundPaymentModal(makePayment(), onClose));

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(gateway.updatePaymentGroupWithProcedures).toHaveBeenCalledWith("group-1", "2025-03-01", [
      mockCurrentProcedure,
    ]);
    expect(onClose).toHaveBeenCalled();
  });

  it("handleSubmit includes added procedures on submit", async () => {
    vi.mocked(gateway.getFundPaymentGroupEditData).mockResolvedValue({
      success: true,
      data: {
        current_procedures: [mockCurrentProcedure],
        available_procedures: [mockAvailableProcedure],
      },
    });
    vi.mocked(gateway.updatePaymentGroupWithProcedures).mockResolvedValue({
      success: true,
      data: makePayment(),
    });

    const onClose = vi.fn();
    const { result } = renderHook(() => useEditFundPaymentModal(makePayment(), onClose));

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.handleProceduresAdded([mockAvailableProcedure]));

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(gateway.updatePaymentGroupWithProcedures).toHaveBeenCalledWith(
      "group-1",
      "2025-03-01",
      expect.arrayContaining([mockCurrentProcedure, mockAvailableProcedure]),
    );
  });

  it("handleSubmit shows error toast and does not call onClose on API failure", async () => {
    const { toastService } = await import("@/core/snackbar");

    vi.mocked(gateway.getFundPaymentGroupEditData).mockResolvedValue({
      success: true,
      data: { current_procedures: [mockCurrentProcedure], available_procedures: [] },
    });
    vi.mocked(gateway.updatePaymentGroupWithProcedures).mockResolvedValue({
      success: false,
      error: "Server error",
    });

    const onClose = vi.fn();
    const { result } = renderHook(() => useEditFundPaymentModal(makePayment(), onClose));

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(toastService.show).toHaveBeenCalledWith(
      "error",
      expect.stringContaining("Server error"),
    );
  });

  it("handleSubmit shows validation error when no procedures selected", async () => {
    const { toastService } = await import("@/core/snackbar");

    vi.mocked(gateway.getFundPaymentGroupEditData).mockResolvedValue({
      success: true,
      data: { current_procedures: [], available_procedures: [] },
    });

    const { result } = renderHook(() => useEditFundPaymentModal(makePayment(), vi.fn()));

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(gateway.updatePaymentGroupWithProcedures).not.toHaveBeenCalled();
    expect(toastService.show).toHaveBeenCalledWith("error", expect.any(String));
  });

  it("shows error toast on load failure", async () => {
    const { toastService } = await import("@/core/snackbar");

    vi.mocked(gateway.getFundPaymentGroupEditData).mockResolvedValue({
      success: false,
      error: "Load failed",
    });

    const { result } = renderHook(() => useEditFundPaymentModal(makePayment(), vi.fn()));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(toastService.show).toHaveBeenCalledWith("error", expect.stringContaining("Load failed"));
  });
});

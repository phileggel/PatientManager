import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BankTransfer } from "@/bindings";

const mockToastShow = vi.hoisted(() => vi.fn());

vi.mock("@/core/snackbar", () => ({
  toastService: { show: mockToastShow, subscribe: vi.fn(() => vi.fn()) },
}));

vi.mock("../gateway", () => ({
  getTransferFundGroupIds: vi.fn(),
  getTransferProcedureIds: vi.fn(),
  getFundGroupsByIds: vi.fn(),
  getProceduresByIds: vi.fn(),
  updateFundTransfer: vi.fn(),
  updateDirectTransfer: vi.fn(),
}));

import * as gateway from "../gateway";
import { useEditBankTransferModal } from "./useEditBankTransferModal";

const makeBankAccount = () => ({ id: "account-1", name: "Compte principal", iban: null });

const makeFundTransfer = (overrides?: Partial<BankTransfer>): BankTransfer => ({
  id: "transfer-fund-1",
  transfer_date: "2026-03-10",
  amount: 150000,
  transfer_type: "FUND",
  bank_account: makeBankAccount(),
  ...overrides,
});

const makeDirectTransfer = (overrides?: Partial<BankTransfer>): BankTransfer => ({
  id: "transfer-check-1",
  transfer_date: "2026-03-12",
  amount: 120000,
  transfer_type: "CHECK",
  bank_account: makeBankAccount(),
  ...overrides,
});

const mockGroup = {
  group_id: "group-1",
  fund_id: "fund-1",
  payment_date: "2026-03-08",
  total_amount: 150000,
};

const mockProcedure = {
  procedure_id: "proc-1",
  patient_id: "pat-1",
  procedure_date: "2026-03-10",
  procedure_amount: 120000,
};

describe("useEditBankTransferModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToastShow.mockReset();
    vi.mocked(gateway.getTransferFundGroupIds).mockResolvedValue({ success: true, data: [] });
    vi.mocked(gateway.getTransferProcedureIds).mockResolvedValue({ success: true, data: [] });
    vi.mocked(gateway.getFundGroupsByIds).mockResolvedValue({ success: true, data: [] });
    vi.mocked(gateway.getProceduresByIds).mockResolvedValue({ success: true, data: [] });
  });

  // ===== Initialization =====

  it("R21 — initializes transferDate from FUND transfer", async () => {
    const transfer = makeFundTransfer();
    const { result } = renderHook(() => useEditBankTransferModal(transfer, vi.fn()));

    await waitFor(() => expect(gateway.getTransferFundGroupIds).toHaveBeenCalled());

    expect(result.current.transferDate).toBe("2026-03-10");
  });

  it("R21 — initializes transferDate from direct transfer", async () => {
    const transfer = makeDirectTransfer();
    const { result } = renderHook(() => useEditBankTransferModal(transfer, vi.fn()));

    await waitFor(() => expect(gateway.getTransferProcedureIds).toHaveBeenCalled());

    expect(result.current.transferDate).toBe("2026-03-12");
  });

  it("does not load anything when transfer is null", () => {
    const { result } = renderHook(() => useEditBankTransferModal(null, vi.fn()));

    expect(result.current.transferDate).toBe("");
    expect(result.current.selectedGroupIds).toEqual([]);
    expect(gateway.getTransferFundGroupIds).not.toHaveBeenCalled();
  });

  it("R13 — syncs bankAccount from transfer on open", async () => {
    const transfer = makeFundTransfer();
    const { result } = renderHook(() => useEditBankTransferModal(transfer, vi.fn()));

    await waitFor(() => expect(gateway.getTransferFundGroupIds).toHaveBeenCalled());

    expect(result.current.bankAccount).toBe("account-1");
  });

  it("R13 — isCash is true for CASH transfer and false for CHECK", async () => {
    // CASH falls into the direct-payment branch → calls getTransferProcedureIds
    const cashTransfer = makeFundTransfer({ transfer_type: "CASH" });
    const { result: cashResult } = renderHook(() =>
      useEditBankTransferModal(cashTransfer, vi.fn()),
    );
    await waitFor(() => expect(gateway.getTransferProcedureIds).toHaveBeenCalled());
    expect(cashResult.current.isCash).toBe(true);

    vi.clearAllMocks();
    vi.mocked(gateway.getTransferProcedureIds).mockResolvedValue({ success: true, data: [] });

    const checkTransfer = makeDirectTransfer();
    const { result: checkResult } = renderHook(() =>
      useEditBankTransferModal(checkTransfer, vi.fn()),
    );
    await waitFor(() => expect(gateway.getTransferProcedureIds).toHaveBeenCalled());
    expect(checkResult.current.isCash).toBe(false);
  });

  // ===== FUND type loading =====

  it("R21 — loads selectedGroupIds and currentGroups for FUND transfer", async () => {
    vi.mocked(gateway.getTransferFundGroupIds).mockResolvedValue({
      success: true,
      data: ["group-1"],
    });
    vi.mocked(gateway.getFundGroupsByIds).mockResolvedValue({ success: true, data: [mockGroup] });

    const transfer = makeFundTransfer();
    const { result } = renderHook(() => useEditBankTransferModal(transfer, vi.fn()));

    await waitFor(() => expect(result.current.currentGroups).toHaveLength(1));

    expect(result.current.selectedGroupIds).toEqual(["group-1"]);
    expect(result.current.currentGroups[0]?.group_id).toBe("group-1");
    expect(gateway.getFundGroupsByIds).toHaveBeenCalledWith(["group-1"]);
  });

  it("does not call getFundGroupsByIds when FUND transfer has no linked groups", async () => {
    const transfer = makeFundTransfer();
    const { result } = renderHook(() => useEditBankTransferModal(transfer, vi.fn()));

    await waitFor(() => expect(gateway.getTransferFundGroupIds).toHaveBeenCalled());

    expect(gateway.getFundGroupsByIds).not.toHaveBeenCalled();
    expect(result.current.currentGroups).toEqual([]);
  });

  // ===== Direct type loading =====

  it("R21 — loads selectedProcedureIds and currentProcedures for direct transfer", async () => {
    vi.mocked(gateway.getTransferProcedureIds).mockResolvedValue({
      success: true,
      data: ["proc-1"],
    });
    vi.mocked(gateway.getProceduresByIds).mockResolvedValue({
      success: true,
      data: [mockProcedure],
    });

    const transfer = makeDirectTransfer();
    const { result } = renderHook(() => useEditBankTransferModal(transfer, vi.fn()));

    await waitFor(() => expect(result.current.currentProcedures).toHaveLength(1));

    expect(result.current.selectedProcedureIds).toEqual(["proc-1"]);
    expect(result.current.currentProcedures[0]?.procedure_id).toBe("proc-1");
    expect(gateway.getProceduresByIds).toHaveBeenCalledWith(["proc-1"]);
  });

  // ===== handleSubmit — FUND =====

  it("calls updateFundTransfer with correct args on FUND submit", async () => {
    vi.mocked(gateway.getTransferFundGroupIds).mockResolvedValue({
      success: true,
      data: ["group-1"],
    });
    vi.mocked(gateway.getFundGroupsByIds).mockResolvedValue({ success: true, data: [mockGroup] });
    vi.mocked(gateway.updateFundTransfer).mockResolvedValue({
      success: true,
      data: { transfer_id: "transfer-fund-1", linked_count: 1 },
    });

    const onClose = vi.fn();
    const transfer = makeFundTransfer();
    const { result } = renderHook(() => useEditBankTransferModal(transfer, onClose));

    await waitFor(() => expect(result.current.selectedGroupIds).toEqual(["group-1"]));

    await act(async () => {
      await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(gateway.updateFundTransfer).toHaveBeenCalledWith("transfer-fund-1", "2026-03-10", [
      "group-1",
    ]);
    expect(gateway.updateDirectTransfer).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("calls updateDirectTransfer with correct args on direct submit", async () => {
    vi.mocked(gateway.getTransferProcedureIds).mockResolvedValue({
      success: true,
      data: ["proc-1"],
    });
    vi.mocked(gateway.getProceduresByIds).mockResolvedValue({
      success: true,
      data: [mockProcedure],
    });
    vi.mocked(gateway.updateDirectTransfer).mockResolvedValue({
      success: true,
      data: { transfer_id: "transfer-check-1", linked_count: 1 },
    });

    const onClose = vi.fn();
    const transfer = makeDirectTransfer();
    const { result } = renderHook(() => useEditBankTransferModal(transfer, onClose));

    await waitFor(() => expect(result.current.selectedProcedureIds).toEqual(["proc-1"]));

    await act(async () => {
      await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(gateway.updateDirectTransfer).toHaveBeenCalledWith("transfer-check-1", "2026-03-12", [
      "proc-1",
    ]);
    expect(gateway.updateFundTransfer).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("shows error snackbar and does not close when updateFundTransfer fails", async () => {
    vi.mocked(gateway.getTransferFundGroupIds).mockResolvedValue({
      success: true,
      data: ["group-1"],
    });
    vi.mocked(gateway.getFundGroupsByIds).mockResolvedValue({ success: true, data: [mockGroup] });
    vi.mocked(gateway.updateFundTransfer).mockResolvedValue({
      success: false,
      error: "Server error",
    });

    const onClose = vi.fn();
    const transfer = makeFundTransfer();
    const { result } = renderHook(() => useEditBankTransferModal(transfer, onClose));

    await waitFor(() => expect(result.current.selectedGroupIds).toEqual(["group-1"]));

    await act(async () => {
      await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(mockToastShow).toHaveBeenCalledWith("error", expect.any(String));
  });

  it("shows validation error when no groups selected for FUND", async () => {
    const transfer = makeFundTransfer();
    const { result } = renderHook(() => useEditBankTransferModal(transfer, vi.fn()));

    await waitFor(() => expect(gateway.getTransferFundGroupIds).toHaveBeenCalled());

    await act(async () => {
      await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(gateway.updateFundTransfer).not.toHaveBeenCalled();
    expect(mockToastShow).toHaveBeenCalledWith("error", expect.any(String));
  });
});

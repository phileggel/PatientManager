import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeBankEntry } from "@/tests/bank.factory";
import { useBankTransferStore } from "./store";
import { useBankTransferOperations } from "./useBankTransferOperations";

vi.mock("./gateway", () => ({
  readAllBankTransfers: vi.fn(),
  deleteTransferByType: vi.fn(),
  createBankTransfer: vi.fn(),
  updateBankTransfer: vi.fn(),
  getCashBankAccountId: vi.fn(),
  getUnsettledFundGroups: vi.fn(),
  getAllUnsettledFundGroups: vi.fn(),
  getFundGroupsByIds: vi.fn(),
  createFundTransfer: vi.fn(),
  updateFundTransfer: vi.fn(),
  getTransferFundGroupIds: vi.fn(),
  getEligibleProceduresForDirectPayment: vi.fn(),
  getAllEligibleProceduresForDirectPayment: vi.fn(),
  getProceduresByIds: vi.fn(),
  createDirectTransfer: vi.fn(),
  updateDirectTransfer: vi.fn(),
  getTransferProcedureIds: vi.fn(),
}));

import * as gateway from "./gateway";

const mockRead = vi.mocked(gateway.readAllBankTransfers);
const TRANSFER_1 = makeBankEntry({ id: "t1" });
const TRANSFER_2 = makeBankEntry({ id: "t2" });

describe("useBankTransferOperations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBankTransferStore.setState({ transfers: [], loading: false, error: null });
  });

  it("calls readAllBankTransfers on mount and populates transfers", async () => {
    mockRead.mockResolvedValue({ success: true, data: [TRANSFER_1] });
    const { result } = renderHook(() => useBankTransferOperations());
    await waitFor(() => expect(result.current.transfers).toHaveLength(1));
    expect(result.current.transfers[0]?.id).toBe("t1");
    expect(result.current.isLoading).toBe(false);
  });

  it("sets store error when readAllBankTransfers returns failure", async () => {
    mockRead.mockResolvedValue({ success: false, error: { code: "DatabaseError" } });
    const { result } = renderHook(() => useBankTransferOperations());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeTruthy();
    expect(result.current.transfers).toHaveLength(0);
  });

  it("re-fetches when banktransfer_updated event fires", async () => {
    mockRead.mockResolvedValue({ success: true, data: [] });
    const { result } = renderHook(() => useBankTransferOperations());
    await waitFor(() => expect(mockRead).toHaveBeenCalledTimes(1));

    mockRead.mockResolvedValue({ success: true, data: [TRANSFER_2] });
    act(() => window.dispatchEvent(new Event("banktransfer_updated")));

    await waitFor(() => expect(result.current.transfers).toHaveLength(1));
    expect(result.current.transfers[0]?.id).toBe("t2");
  });
});

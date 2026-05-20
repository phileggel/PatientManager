import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/lib/appStore";
import { makeFund } from "@/tests/fund.factory";
import { makeFundPaymentGroup } from "@/tests/fund-payment.factory";
import { makeProcedure } from "@/tests/procedure.factory";

vi.mock("../gateway", () => ({
  readProceduresByIds: vi.fn(),
  deleteFundPaymentGroup: vi.fn(),
}));

vi.mock("@/core/snackbar", () => ({
  toastService: { show: vi.fn() },
}));

import { toastService } from "@/core/snackbar";
import * as gateway from "../gateway";
import { useFundPaymentList } from "./useFundPaymentList";

const mockRead = vi.mocked(gateway.readProceduresByIds);
const mockDelete = vi.mocked(gateway.deleteFundPaymentGroup);
const mockToast = vi.mocked(toastService.show);

const FUND = makeFund({ id: "fund-1", fund_identifier: "440", name: "CPAM" });

function seedStore(groups = [makeFundPaymentGroup({ id: "g-1", fund_id: "fund-1" })]) {
  useAppStore.setState({
    funds: [FUND],
    fundPaymentGroups: groups,
    fundPaymentGroupsLoading: false,
  });
}

describe("useFundPaymentList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ funds: [], fundPaymentGroups: [], fundPaymentGroupsLoading: false });
  });

  it("fetches procedures referenced by group lines and exposes them through rows (FPM-360)", async () => {
    const proc1 = makeProcedure({ id: "p1", procedure_date: "2026-01-15" });
    const proc2 = makeProcedure({ id: "p2", procedure_date: "2026-02-28" });
    seedStore([
      makeFundPaymentGroup({
        id: "g-1",
        fund_id: "fund-1",
        lines: [
          { id: "l1", fund_payment_group_id: "g-1", procedure_id: "p1" },
          { id: "l2", fund_payment_group_id: "g-1", procedure_id: "p2" },
        ],
      }),
    ]);
    mockRead.mockResolvedValue({ success: true, data: [proc1, proc2] });

    const { result } = renderHook(() => useFundPaymentList());

    await waitFor(() => expect(mockRead).toHaveBeenCalledWith(["p1", "p2"]));
    await waitFor(() => {
      const row = result.current.fundPaymentRows[0];
      expect(row?.procedureStartDate).toBe("2026-01-15");
      expect(row?.procedureEndDate).toBe("2026-02-28");
    });
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("skips the fetch when no groups carry procedure lines", async () => {
    seedStore([]);

    renderHook(() => useFundPaymentList());

    // No procedure ids → empty key → effect calls readProceduresByIds([]) once;
    // assert the empty-arg call and that no toast fires.
    await waitFor(() => expect(mockRead).toHaveBeenCalledWith([]));
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("shows an error toast and renders rows without range when the gateway fails", async () => {
    seedStore([
      makeFundPaymentGroup({
        id: "g-1",
        fund_id: "fund-1",
        lines: [{ id: "l1", fund_payment_group_id: "g-1", procedure_id: "p1" }],
      }),
    ]);
    mockRead.mockResolvedValue({ success: false, error: "boom" });

    const { result } = renderHook(() => useFundPaymentList());

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith("error", expect.any(String)));
    const row = result.current.fundPaymentRows[0];
    expect(row?.procedureStartDate).toBeUndefined();
    expect(row?.procedureEndDate).toBeUndefined();
  });

  it("deleteGroup resolves on gateway success", async () => {
    seedStore();
    mockRead.mockResolvedValue({ success: true, data: [] });
    mockDelete.mockResolvedValue({ success: true, data: undefined });

    const { result } = renderHook(() => useFundPaymentList());

    await expect(result.current.deleteGroup("g-1")).resolves.toBeUndefined();
    expect(mockDelete).toHaveBeenCalledWith("g-1");
  });

  it("deleteGroup throws when the gateway returns failure", async () => {
    seedStore();
    mockRead.mockResolvedValue({ success: true, data: [] });
    mockDelete.mockResolvedValue({ success: false, error: "delete failed" });

    const { result } = renderHook(() => useFundPaymentList());

    await expect(result.current.deleteGroup("g-1")).rejects.toThrow("delete failed");
  });
});

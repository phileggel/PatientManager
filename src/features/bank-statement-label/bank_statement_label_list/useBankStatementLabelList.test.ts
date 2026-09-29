import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCacheStore } from "@/infra/cache/store";
import { makeBankAccount } from "@/tests/bank.factory";
import { makeFund } from "@/tests/fund.factory";
import { toastService } from "@/ui/components/snackbar";
import * as gateway from "../gateway";
import { useBankStatementLabelList } from "./useBankStatementLabelList";

vi.mock("../gateway");

const LABEL = { id: "m1", bank_account_id: "acc-1", bank_label: "VIR CPAM", fund_id: "fund-1" };

beforeEach(() => {
  vi.clearAllMocks();
  useCacheStore.setState({
    bankAccounts: [makeBankAccount({ id: "acc-1", name: "Compte courant" })],
    funds: [makeFund({ id: "fund-1", name: "CPAM 75" })],
  });
  vi.mocked(gateway.listBankStatementLabels).mockResolvedValue({ success: true, data: [LABEL] });
});

describe("useBankStatementLabelList", () => {
  it("test_bas_041c_loads_the_labels_and_leaves_the_loading_state", async () => {
    const { result } = renderHook(() => useBankStatementLabelList());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows.map((r) => r.label)).toEqual(["VIR CPAM"]);
    expect(result.current.loadFailed).toBe(false);
  });

  it("test_bas_041c_a_load_failure_is_reported", async () => {
    vi.mocked(gateway.listBankStatementLabels).mockResolvedValue({
      success: false,
      error: { code: "DatabaseError" },
    });
    const { result } = renderHook(() => useBankStatementLabelList());
    await waitFor(() => expect(result.current.loadFailed).toBe(true));
  });

  it("test_bas_045_a_successful_reassign_confirms_and_reloads", async () => {
    vi.mocked(gateway.reassignBankStatementLabel).mockResolvedValue({
      success: true,
      data: { ...LABEL, fund_id: null },
    });
    const { result } = renderHook(() => useBankStatementLabelList());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.reassign("m1", { type: "Rejected" }));

    expect(gateway.reassignBankStatementLabel).toHaveBeenCalledWith("m1", { type: "Rejected" });
    expect(toastService.show).toHaveBeenCalledWith("success", expect.any(String));
    expect(gateway.listBankStatementLabels).toHaveBeenCalledTimes(2);
  });

  it("test_bas_044_a_gone_label_is_reported_and_the_list_reloads", async () => {
    vi.mocked(gateway.deleteBankStatementLabel).mockResolvedValue({
      success: false,
      error: { code: "LabelMappingNotFound" },
    });
    const { result } = renderHook(() => useBankStatementLabelList());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.remove("m1"));

    expect(toastService.show).toHaveBeenCalledWith("error", expect.any(String));
    expect(gateway.listBankStatementLabels).toHaveBeenCalledTimes(2);
  });

  it("test_bas_045_any_other_failure_keeps_the_list", async () => {
    vi.mocked(gateway.deleteBankStatementLabel).mockResolvedValue({
      success: false,
      error: { code: "DatabaseError" },
    });
    const { result } = renderHook(() => useBankStatementLabelList());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.remove("m1"));

    expect(toastService.show).toHaveBeenCalledWith("error", expect.any(String));
    expect(gateway.listBankStatementLabels).toHaveBeenCalledTimes(1);
  });
});

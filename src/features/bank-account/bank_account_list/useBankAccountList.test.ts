import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCacheStore } from "@/infra/cache/store";
import { makeBankAccount } from "@/tests/bank.factory";
import { useBankAccountList } from "./useBankAccountList";

vi.mock("../gateway", () => ({
  deleteBankAccount: vi.fn(),
}));

import { deleteBankAccount } from "../gateway";

const mockDelete = vi.mocked(deleteBankAccount);

describe("useBankAccountList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ bankAccounts: [], bankAccountsLoading: false });
  });

  it("maps store accounts to rows via BankAccountPresenter.toRow", async () => {
    useCacheStore.setState({
      bankAccounts: [makeBankAccount({ id: "acc-1", name: "Main", iban: "FR76" })],
    });

    const { result } = renderHook(() => useBankAccountList());
    await act(async () => {});

    expect(result.current.bankAccountRows).toHaveLength(1);
    expect(result.current.bankAccountRows[0]?.name).toBe("Main");
  });

  it("deleteBankAccount resolves without throwing when gateway returns success=true", async () => {
    mockDelete.mockResolvedValue({ success: true, data: undefined });

    const { result } = renderHook(() => useBankAccountList());
    await act(async () => {});

    await expect(result.current.deleteBankAccount("acc-1")).resolves.toBeUndefined();
  });

  it("deleteBankAccount throws when gateway returns success=false", async () => {
    mockDelete.mockResolvedValue({ success: false, error: { code: "DatabaseError" } });

    const { result } = renderHook(() => useBankAccountList());
    await act(async () => {});

    await expect(result.current.deleteBankAccount("acc-1")).rejects.toThrow(/database error/i);
  });

  it("ticket #511: a failure that is not a refusal throws a generic message (BAC-044)", async () => {
    mockDelete.mockRejectedValue(new Error("ipc: connection reset"));

    const { result } = renderHook(() => useBankAccountList());
    await act(async () => {});

    await expect(result.current.deleteBankAccount("acc-1")).rejects.toThrow(
      "An unexpected error occurred. Please try again.",
    );
  });

  it("ticket #448: a refusal throws the translated reason (BAC-043)", async () => {
    mockDelete.mockResolvedValue({
      success: false,
      error: { code: "BankAccountHoldsBankEntries" },
    });

    const { result } = renderHook(() => useBankAccountList());
    await act(async () => {});

    await expect(result.current.deleteBankAccount("acc-1")).rejects.toThrow(
      "This account holds entries and cannot be deleted",
    );
  });
});

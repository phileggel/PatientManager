import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/lib/appStore";
import { makeBankAccount } from "@/tests/bank.factory";
import { useBankAccountList } from "./useBankAccountList";

vi.mock("../gateway", () => ({
  getCashBankAccountId: vi.fn(),
  deleteBankAccount: vi.fn(),
}));

import { deleteBankAccount, getCashBankAccountId } from "../gateway";

const mockGetCashId = vi.mocked(getCashBankAccountId);
const mockDelete = vi.mocked(deleteBankAccount);

describe("useBankAccountList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ bankAccounts: [], bankAccountsLoading: false });
  });

  it("sets cashAccountId from gateway on mount when call succeeds", async () => {
    mockGetCashId.mockResolvedValue({ success: true, data: "acc-cash" });

    const { result } = renderHook(() => useBankAccountList());

    await act(async () => {});

    expect(result.current.cashAccountId).toBe("acc-cash");
  });

  it("leaves cashAccountId null when gateway call fails", async () => {
    mockGetCashId.mockResolvedValue({ success: false, error: "not found" });

    const { result } = renderHook(() => useBankAccountList());

    await act(async () => {});

    expect(result.current.cashAccountId).toBeNull();
  });

  it("maps store accounts to rows via BankAccountPresenter.toRow", async () => {
    mockGetCashId.mockResolvedValue({ success: true, data: "acc-1" });
    useAppStore.setState({
      bankAccounts: [makeBankAccount({ id: "acc-1", name: "Main", iban: "FR76" })],
    });

    const { result } = renderHook(() => useBankAccountList());
    await act(async () => {});

    expect(result.current.bankAccountRows).toHaveLength(1);
    expect(result.current.bankAccountRows[0]?.name).toBe("Main");
  });

  it("deleteBankAccount resolves without throwing when gateway returns success=true", async () => {
    mockGetCashId.mockResolvedValue({ success: true, data: "acc-cash" });
    mockDelete.mockResolvedValue({ success: true, data: undefined });

    const { result } = renderHook(() => useBankAccountList());
    await act(async () => {});

    await expect(result.current.deleteBankAccount("acc-1")).resolves.toBeUndefined();
  });

  it("deleteBankAccount throws when gateway returns success=false", async () => {
    mockGetCashId.mockResolvedValue({ success: true, data: "acc-cash" });
    mockDelete.mockResolvedValue({ success: false, error: "Account in use" });

    const { result } = renderHook(() => useBankAccountList());
    await act(async () => {});

    await expect(result.current.deleteBankAccount("acc-1")).rejects.toThrow("Account in use");
  });
});

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/lib/appStore";

vi.mock("../gateway", () => ({
  getCashBankAccountId: vi.fn(),
  createFundTransfer: vi.fn(),
  createDirectTransfer: vi.fn(),
}));

vi.mock("@/core/snackbar", () => ({
  useSnackbar: () => ({ showSnackbar: vi.fn() }),
}));

import * as gateway from "../gateway";
import { useAddBankTransferForm } from "./useAddBankTransferForm";

const CASH_ID = "cash-account-default";

const makeBankAccount = (id: string, name: string) => ({
  id,
  name,
  iban: null,
});

describe("useAddBankTransferForm — R13 (CASH auto-account)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(gateway.getCashBankAccountId).mockResolvedValue({ success: true, data: CASH_ID });
    useAppStore.setState({
      bankAccounts: [
        makeBankAccount(CASH_ID, "Caisse"),
        makeBankAccount("acc-1", "Compte principal"),
      ],
    });
  });

  it("fetches the cash account id on mount", async () => {
    renderHook(() => useAddBankTransferForm());

    await waitFor(() => expect(gateway.getCashBankAccountId).toHaveBeenCalledOnce());
  });

  it("excludes the cash account from bankAccountOptions once id is loaded", async () => {
    const { result } = renderHook(() => useAddBankTransferForm());

    await waitFor(() => expect(result.current.bankAccountOptions).toHaveLength(1));
    expect(result.current.bankAccountOptions[0]?.value).toBe("acc-1");
  });

  it("auto-assigns bankAccount to cash id when type changes to CASH", async () => {
    const { result } = renderHook(() => useAddBankTransferForm());

    await waitFor(() => expect(gateway.getCashBankAccountId).toHaveBeenCalled());

    act(() => result.current.handleTypeChange("CASH"));

    expect(result.current.bankAccount).toBe(CASH_ID);
    expect(result.current.isCash).toBe(true);
  });

  it("assigns bankAccount reactively if cashAccountId loads after CASH is already selected", async () => {
    let resolveCash!: (v: { success: true; data: string }) => void;
    vi.mocked(gateway.getCashBankAccountId).mockReturnValue(
      new Promise((resolve) => {
        resolveCash = resolve;
      }),
    );

    const { result } = renderHook(() => useAddBankTransferForm());

    // Select CASH before the fetch completes — bankAccount still empty
    act(() => result.current.handleTypeChange("CASH"));
    expect(result.current.bankAccount).toBe("");

    // Now the fetch resolves
    await act(async () => resolveCash({ success: true, data: CASH_ID }));

    expect(result.current.bankAccount).toBe(CASH_ID);
  });

  it("clears bankAccount when switching from CASH to another type", async () => {
    const { result } = renderHook(() => useAddBankTransferForm());

    await waitFor(() => expect(gateway.getCashBankAccountId).toHaveBeenCalled());

    act(() => result.current.handleTypeChange("CASH"));
    expect(result.current.bankAccount).toBe(CASH_ID);

    act(() => result.current.handleTypeChange("CHECK"));
    expect(result.current.bankAccount).toBe("");
    expect(result.current.isCash).toBe(false);
  });

  it("does not assign cash account for non-CASH types on mount", async () => {
    const { result } = renderHook(() => useAddBankTransferForm());

    await waitFor(() => expect(gateway.getCashBankAccountId).toHaveBeenCalled());

    // Default type is FUND — bankAccount should remain empty
    expect(result.current.transferType).toBe("FUND");
    expect(result.current.bankAccount).toBe("");
  });
});

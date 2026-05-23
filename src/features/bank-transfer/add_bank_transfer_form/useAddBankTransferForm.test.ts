import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCacheStore } from "@/infra/cache/store";
import { makeBankAccount } from "@/tests/bank.factory";
import { toastService } from "@/ui/components/snackbar";

vi.mock("../gateway", () => ({
  getCashBankAccountId: vi.fn(),
  createFundTransfer: vi.fn(),
  createDirectTransfer: vi.fn(),
}));

import * as gateway from "../gateway";
import { useAddBankTransferForm } from "./useAddBankTransferForm";

const CASH_ID = "cash-account-default";

describe("useAddBankTransferForm — R13 (CASH auto-account)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(gateway.getCashBankAccountId).mockResolvedValue({ success: true, data: CASH_ID });
    useCacheStore.setState({
      bankAccounts: [
        makeBankAccount({ id: CASH_ID, name: "Caisse" }),
        makeBankAccount({ id: "acc-1", name: "Compte principal" }),
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

    act(() => result.current.handleTypeChange("PATIENT_CASH"));

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
    act(() => result.current.handleTypeChange("PATIENT_CASH"));
    expect(result.current.bankAccount).toBe("");

    // Now the fetch resolves
    await act(async () => resolveCash({ success: true, data: CASH_ID }));

    expect(result.current.bankAccount).toBe(CASH_ID);
  });

  it("clears bankAccount when switching from CASH to another type", async () => {
    const { result } = renderHook(() => useAddBankTransferForm());

    await waitFor(() => expect(gateway.getCashBankAccountId).toHaveBeenCalled());

    act(() => result.current.handleTypeChange("PATIENT_CASH"));
    expect(result.current.bankAccount).toBe(CASH_ID);

    act(() => result.current.handleTypeChange("PATIENT_CHECK"));
    expect(result.current.bankAccount).toBe("");
    expect(result.current.isCash).toBe(false);
  });

  it("does not assign cash account for non-CASH types on mount", async () => {
    const { result } = renderHook(() => useAddBankTransferForm());

    await waitFor(() => expect(gateway.getCashBankAccountId).toHaveBeenCalled());

    // Default type is FUND — bankAccount should remain empty
    expect(result.current.transferType).toBe("FUND_WIRE");
    expect(result.current.bankAccount).toBe("");
  });
});

describe("useAddBankTransferForm — form fields and validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(gateway.getCashBankAccountId).mockResolvedValue({ success: true, data: CASH_ID });
    useCacheStore.setState({ bankAccounts: [] });
  });

  it("setTransferDate updates date and clears selections", () => {
    const { result } = renderHook(() => useAddBankTransferForm());

    act(() => result.current.handleFundGroupSelectionChange(["g-1"], 5000));
    act(() => result.current.setTransferDate("2025-06-01"));

    expect(result.current.transferDate).toBe("2025-06-01");
    expect(result.current.selectedGroupIds).toHaveLength(0);
    expect(result.current.totalAmountMillis).toBe(0);
  });

  it("handleFundGroupSelectionChange updates selectedGroupIds and totalAmountMillis", () => {
    const { result } = renderHook(() => useAddBankTransferForm());

    act(() => result.current.handleFundGroupSelectionChange(["g-1", "g-2"], 75000));

    expect(result.current.selectedGroupIds).toEqual(["g-1", "g-2"]);
    expect(result.current.totalAmountMillis).toBe(75000);
  });

  it("handleProcedureSelectionChange updates selectedProcedureIds and totalAmountMillis", () => {
    const { result } = renderHook(() => useAddBankTransferForm());

    act(() => result.current.handleTypeChange("PATIENT_CHECK"));
    act(() => result.current.handleProcedureSelectionChange(["p-1"], 30000));

    expect(result.current.selectedProcedureIds).toEqual(["p-1"]);
    expect(result.current.totalAmountMillis).toBe(30000);
  });

  it("handleSubmit sets validation errors when date, bankAccount or items are missing", async () => {
    const { result } = renderHook(() => useAddBankTransferForm());

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(result.current.errors.transferDate).toBeTruthy();
    expect(gateway.createFundTransfer).not.toHaveBeenCalled();
  });

  it("handleSubmit calls createFundTransfer for FUND_WIRE type", async () => {
    vi.mocked(gateway.createFundTransfer).mockResolvedValue({ success: true });
    const { result } = renderHook(() => useAddBankTransferForm());

    act(() => result.current.setTransferDate("2025-06-01"));
    act(() => result.current.setBankAccount("acc-1"));
    act(() => result.current.handleFundGroupSelectionChange(["g-1"], 25000));

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(gateway.createFundTransfer).toHaveBeenCalledWith("acc-1", "2025-06-01", ["g-1"]);
    expect(gateway.createDirectTransfer).not.toHaveBeenCalled();
  });

  it("handleSubmit calls createDirectTransfer for PATIENT_CHECK type", async () => {
    vi.mocked(gateway.createDirectTransfer).mockResolvedValue({ success: true });
    const { result } = renderHook(() => useAddBankTransferForm());

    act(() => result.current.handleTypeChange("PATIENT_CHECK"));
    act(() => result.current.setTransferDate("2025-06-01"));
    act(() => result.current.setBankAccount("acc-1"));
    act(() => result.current.handleProcedureSelectionChange(["p-1"], 15000));

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(gateway.createDirectTransfer).toHaveBeenCalledWith(
      "acc-1",
      "2025-06-01",
      "PATIENT_CHECK",
      ["p-1"],
    );
  });

  it("handleSubmit shows success toast and resets form on success", async () => {
    vi.mocked(gateway.createFundTransfer).mockResolvedValue({ success: true });
    const { result } = renderHook(() => useAddBankTransferForm());

    act(() => result.current.setTransferDate("2025-06-01"));
    act(() => result.current.setBankAccount("acc-1"));
    act(() => result.current.handleFundGroupSelectionChange(["g-1"], 25000));

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(vi.mocked(toastService.show)).toHaveBeenCalledWith("success", expect.any(String));
    expect(result.current.transferDate).toBe("");
    expect(result.current.selectedGroupIds).toHaveLength(0);
  });

  it("handleSubmit shows error toast on backend failure", async () => {
    vi.mocked(gateway.createFundTransfer).mockResolvedValue({
      success: false,
      error: "Server error",
    });
    const { result } = renderHook(() => useAddBankTransferForm());

    act(() => result.current.setTransferDate("2025-06-01"));
    act(() => result.current.setBankAccount("acc-1"));
    act(() => result.current.handleFundGroupSelectionChange(["g-1"], 25000));

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(vi.mocked(toastService.show)).toHaveBeenCalledWith("error", expect.any(String));
  });
});

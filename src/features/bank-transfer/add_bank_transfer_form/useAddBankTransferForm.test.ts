import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCacheStore } from "@/infra/cache/store";
import { makeBankAccount } from "@/tests/bank.factory";
import { toastService } from "@/ui/components/snackbar";

vi.mock("../gateway", () => ({
  createFundTransfer: vi.fn(),
  createDirectTransfer: vi.fn(),
}));

import * as gateway from "../gateway";
import { useAddBankTransferForm } from "./useAddBankTransferForm";

describe("useAddBankTransferForm — BSM-026 (a direct payment's account is set by the backend)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({
      bankAccounts: [makeBankAccount({ id: "acc-1", name: "Compte principal" })],
    });
  });

  it("ticket #518: offers the store's accounts, the user's only", () => {
    const { result } = renderHook(() => useAddBankTransferForm());

    expect(result.current.bankAccountOptions).toEqual([
      { value: "acc-1", label: "Compte principal" },
    ]);
  });

  it("ticket #518: every direct payment type sends no account", async () => {
    vi.mocked(gateway.createDirectTransfer).mockResolvedValue({
      success: true,
      data: { transfer_id: "t-1", linked_count: 1 },
    });
    for (const type of ["PATIENT_CASH", "PATIENT_CHECK", "PATIENT_CREDIT_CARD"] as const) {
      const { result } = renderHook(() => useAddBankTransferForm());
      act(() => result.current.setBankAccount("acc-1"));
      act(() => result.current.handleTypeChange(type));
      act(() => result.current.setTransferDate("2026-03-10"));
      act(() => result.current.handleProcedureSelectionChange(["p-1"], 30000));
      await act(async () => {
        await result.current.handleSubmit({
          preventDefault: vi.fn(),
        } as unknown as React.FormEvent);
      });

      expect(gateway.createDirectTransfer).toHaveBeenLastCalledWith("", "2026-03-10", type, [
        "p-1",
      ]);
    }
  });
});

describe("useAddBankTransferForm — form fields and validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("handleSubmit calls createFundTransfer for FUND_WIRE type", async () => {
    vi.mocked(gateway.createFundTransfer).mockResolvedValue({
      success: true,
      data: { transfer_id: "bt-1", linked_count: 1 },
    });
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
    vi.mocked(gateway.createDirectTransfer).mockResolvedValue({
      success: true,
      data: { transfer_id: "bt-1", linked_count: 1 },
    });
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
    vi.mocked(gateway.createFundTransfer).mockResolvedValue({
      success: true,
      data: { transfer_id: "bt-1", linked_count: 1 },
    });
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
      error: { code: "DatabaseError" },
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

// #351 — the backend judges the form (BSM-020, BSM-022 to BSM-025).
describe("useAddBankTransferForm — refusals at the field (BSM-022 to BSM-025)", () => {
  const refused = {
    success: false as const,
    error: {
      code: "BankEntryInvalid" as const,
      reasons: ["AccountMissing", "DateMissing", "NothingSelected"] as (
        | "AccountMissing"
        | "DateMissing"
        | "DateInvalid"
        | "NothingSelected"
      )[],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ bankAccounts: [] });
  });

  async function submit(result: { current: ReturnType<typeof useAddBankTransferForm> }) {
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });
  }

  it("BSM-022: sends an empty form to the backend instead of blocking it", async () => {
    vi.mocked(gateway.createFundTransfer).mockResolvedValue(refused);
    const { result } = renderHook(() => useAddBankTransferForm());

    await submit(result);

    expect(gateway.createFundTransfer).toHaveBeenCalledWith("", "", []);
  });

  it("BSM-023, BSM-024: shows each reason at its field and an error snackbar", async () => {
    vi.mocked(gateway.createFundTransfer).mockResolvedValue(refused);
    const { result } = renderHook(() => useAddBankTransferForm());

    await submit(result);

    expect(result.current.fieldErrors).toEqual({
      transferDate: "transfer.validate.date_required",
      bankAccount: "transfer.validate.bank_account_required",
      selection: "transfer.validate.no_items_selected",
    });
    expect(vi.mocked(toastService.show)).toHaveBeenCalledWith("error", expect.any(String));
  });

  it("BSM-024: a refused save keeps what the form holds", async () => {
    vi.mocked(gateway.createDirectTransfer).mockResolvedValue(refused);
    const { result } = renderHook(() => useAddBankTransferForm());
    act(() => result.current.handleTypeChange("PATIENT_CHECK"));
    act(() => result.current.setTransferDate("2026-03-10"));
    act(() => result.current.setBankAccount("acc-1"));

    await submit(result);

    expect(result.current.transferDate).toBe("2026-03-10");
    expect(result.current.bankAccount).toBe("acc-1");
    expect(result.current.transferType).toBe("PATIENT_CHECK");
  });

  it("BSM-023: a malformed date has its own message", async () => {
    vi.mocked(gateway.createFundTransfer).mockResolvedValue({
      success: false,
      error: { code: "BankEntryInvalid", reasons: ["DateInvalid"] },
    });
    const { result } = renderHook(() => useAddBankTransferForm());

    await submit(result);

    expect(result.current.fieldErrors).toEqual({ transferDate: "transfer.validate.date_invalid" });
  });

  it("BSM-025: editing a field clears its message; changing the type clears account and selection", async () => {
    vi.mocked(gateway.createFundTransfer).mockResolvedValue(refused);
    const { result } = renderHook(() => useAddBankTransferForm());
    await submit(result);

    act(() => result.current.setBankAccount("acc-1"));
    expect(result.current.fieldErrors.bankAccount).toBeUndefined();
    expect(result.current.fieldErrors.transferDate).toBe("transfer.validate.date_required");

    act(() => result.current.handleTypeChange("PATIENT_CHECK"));
    expect(result.current.fieldErrors).toEqual({ transferDate: "transfer.validate.date_required" });

    act(() => result.current.setTransferDate("2026-03-10"));
    expect(result.current.fieldErrors).toEqual({});
  });

  it("BSM-023: a new save clears every message first; another refusal shows none at a field", async () => {
    vi.mocked(gateway.createFundTransfer)
      .mockResolvedValueOnce(refused)
      .mockResolvedValueOnce({
        success: false,
        error: { code: "BankAccountNotFound", bank_account_id: "acc-9" },
      });
    const { result } = renderHook(() => useAddBankTransferForm());
    await submit(result);

    await submit(result);

    expect(result.current.fieldErrors).toEqual({});
  });
});

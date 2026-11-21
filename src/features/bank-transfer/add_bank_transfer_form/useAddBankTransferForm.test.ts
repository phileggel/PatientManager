import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCacheStore } from "@/infra/cache/store";
import { makeBankAccount } from "@/tests/bank.factory";
import { toastService } from "@/ui/components/snackbar";

vi.mock("../gateway", () => ({
  createFundTransfer: vi.fn(),
  createDirectTransfer: vi.fn(),
  createFundWireFromProcedures: vi.fn(),
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
    const { result } = renderHook(() => useAddBankTransferForm("fund"));

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
      const { result } = renderHook(() => useAddBankTransferForm("direct"));
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
    const { result } = renderHook(() => useAddBankTransferForm("fund"));

    act(() => result.current.handleFundGroupSelectionChange(["g-1"], 5000));
    act(() => result.current.setTransferDate("2025-06-01"));

    expect(result.current.transferDate).toBe("2025-06-01");
    expect(result.current.selectedGroupIds).toHaveLength(0);
    expect(result.current.totalAmountMillis).toBe(0);
  });

  it("handleFundGroupSelectionChange updates selectedGroupIds and totalAmountMillis", () => {
    const { result } = renderHook(() => useAddBankTransferForm("fund"));

    act(() => result.current.handleFundGroupSelectionChange(["g-1", "g-2"], 75000));

    expect(result.current.selectedGroupIds).toEqual(["g-1", "g-2"]);
    expect(result.current.totalAmountMillis).toBe(75000);
  });

  it("handleProcedureSelectionChange updates selectedProcedureIds and totalAmountMillis", () => {
    const { result } = renderHook(() => useAddBankTransferForm("direct"));

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
    const { result } = renderHook(() => useAddBankTransferForm("fund"));

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
    const { result } = renderHook(() => useAddBankTransferForm("direct"));

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
    const { result } = renderHook(() => useAddBankTransferForm("fund"));

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
    const { result } = renderHook(() => useAddBankTransferForm("fund"));

    act(() => result.current.setTransferDate("2025-06-01"));
    act(() => result.current.setBankAccount("acc-1"));
    act(() => result.current.handleFundGroupSelectionChange(["g-1"], 25000));

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(vi.mocked(toastService.show)).toHaveBeenCalledWith("error", expect.any(String));
  });
});

// #351 — the backend judges the form (BSM-020, BSM-023 to BSM-025).
describe("useAddBankTransferForm — refusals at the field (BSM-023 to BSM-025)", () => {
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

  it("BSM-020: sends the form as it holds it; the backend judges it", async () => {
    vi.mocked(gateway.createFundTransfer).mockResolvedValue(refused);
    const { result } = renderHook(() => useAddBankTransferForm("fund"));

    await submit(result);

    expect(gateway.createFundTransfer).toHaveBeenCalledWith("", "", []);
  });

  it("BSM-023, BSM-024: shows each reason at its field and an error snackbar", async () => {
    vi.mocked(gateway.createFundTransfer).mockResolvedValue(refused);
    const { result } = renderHook(() => useAddBankTransferForm("fund"));

    await submit(result);

    expect(result.current.fieldErrors).toEqual({
      transferDate: "transfer.validate.date_required",
      bankAccount: "transfer.validate.bank_account_required",
    });
    expect(vi.mocked(toastService.show)).toHaveBeenCalledWith("error", expect.any(String));
  });

  it("BSM-024: a refused save keeps what the form holds", async () => {
    vi.mocked(gateway.createDirectTransfer).mockResolvedValue(refused);
    const { result } = renderHook(() => useAddBankTransferForm("direct"));
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
    const { result } = renderHook(() => useAddBankTransferForm("fund"));

    await submit(result);

    expect(result.current.fieldErrors).toEqual({ transferDate: "transfer.validate.date_invalid" });
  });

  it("BSM-025: editing a field clears its message; a new type clears the account's too", async () => {
    vi.mocked(gateway.createFundTransfer).mockResolvedValue(refused);
    const { result } = renderHook(() => useAddBankTransferForm("fund"));
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
    const { result } = renderHook(() => useAddBankTransferForm("fund"));
    await submit(result);

    await submit(result);

    expect(result.current.fieldErrors).toEqual({});
  });
});

// #642 — the add window of one page.
describe("useAddBankTransferForm — the add window of a page (#642)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ bankAccounts: [] });
  });

  it("starts a direct payment by check and a fund wire as a wire", () => {
    expect(renderHook(() => useAddBankTransferForm("direct")).result.current.transferType).toBe(
      "PATIENT_CHECK",
    );
    expect(renderHook(() => useAddBankTransferForm("fund")).result.current.transferType).toBe(
      "FUND_WIRE",
    );
  });

  it("is untouched until something is entered", () => {
    const { result } = renderHook(() => useAddBankTransferForm("direct"));
    expect(result.current.isDirty).toBe(false);

    act(() => result.current.handleProcedureSelectionChange(["p-1"], 60000));
    expect(result.current.isDirty).toBe(true);

    act(() => result.current.resetForm());
    expect(result.current.isDirty).toBe(false);

    act(() => result.current.handleTypeChange("PATIENT_CASH"));
    expect(result.current.isDirty).toBe(true);
  });

  it("keeps the ticked procedures when the payment method changes", () => {
    const { result } = renderHook(() => useAddBankTransferForm("direct"));
    act(() => result.current.handleProcedureSelectionChange(["p-1"], 60000));

    act(() => result.current.handleTypeChange("PATIENT_CREDIT_CARD"));

    expect(result.current.selectedProcedureIds).toEqual(["p-1"]);
    expect(result.current.totalAmountMillis).toBe(60000);
  });

  it("a saved entry empties the form, says so for its page and closes the window", async () => {
    vi.mocked(gateway.createDirectTransfer).mockResolvedValue({
      success: true,
      data: { transfer_id: "t-1", linked_count: 1 },
    });
    const onSaved = vi.fn();
    const { result } = renderHook(() => useAddBankTransferForm("direct", onSaved));
    act(() => result.current.setTransferDate("2026-03-10"));
    act(() => result.current.handleProcedureSelectionChange(["p-1"], 60000));

    await act(async () => {
      await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(onSaved).toHaveBeenCalledOnce();
    expect(toastService.show).toHaveBeenCalledWith("success", "Payment recorded");
    expect(result.current.isDirty).toBe(false);
  });

  it("a refused entry keeps the window open (BSM-024)", async () => {
    vi.mocked(gateway.createFundTransfer).mockResolvedValue({
      success: false,
      error: { code: "DatabaseError" },
    });
    const onSaved = vi.fn();
    const { result } = renderHook(() => useAddBankTransferForm("fund", onSaved));

    await act(async () => {
      await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe("useAddBankTransferForm — #712, a fund wire on open procedures", () => {
  const submit = { preventDefault: vi.fn() } as unknown as React.FormEvent;

  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({ bankAccounts: [], funds: [] });
  });

  it("BSM-051: sends the account, the date, the fund and the ticked procedures", async () => {
    vi.mocked(gateway.createFundWireFromProcedures).mockResolvedValue({
      success: true,
      data: { transfer_id: "t-1", linked_count: 2 },
    });
    const onSaved = vi.fn();
    const { result } = renderHook(() => useAddBankTransferForm("fund", onSaved));
    act(() => result.current.setBankAccount("acc-1"));
    act(() => result.current.setTransferDate("2026-03-20"));
    act(() => result.current.handleScopeChange("procedures"));
    act(() => result.current.setFundId("fund-1"));
    act(() => result.current.handleProcedureSelectionChange(["p-1", "p-2"], 92000));

    await act(async () => {
      await result.current.handleSubmit(submit);
    });

    expect(gateway.createFundWireFromProcedures).toHaveBeenCalledWith(
      "acc-1",
      "2026-03-20",
      "fund-1",
      ["p-1", "p-2"],
    );
    expect(gateway.createFundTransfer).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledOnce();
    expect(result.current.scope).toBe("groups");
    expect(result.current.fundId).toBe("");
  });

  it("BSM-056: switching side empties the selection, never both", () => {
    const { result } = renderHook(() => useAddBankTransferForm("fund"));
    act(() => result.current.handleFundGroupSelectionChange(["g-1"], 5000));

    act(() => result.current.handleScopeChange("procedures"));

    expect(result.current.selectedGroupIds).toHaveLength(0);
    expect(result.current.totalAmountMillis).toBe(0);
    expect(result.current.isDirty).toBe(true);

    act(() => result.current.handleProcedureSelectionChange(["p-1"], 46000));
    act(() => result.current.handleScopeChange("groups"));

    expect(result.current.selectedProcedureIds).toHaveLength(0);
    expect(result.current.totalAmountMillis).toBe(0);
  });

  it("another fund has other open procedures: the selection is emptied", () => {
    const { result } = renderHook(() => useAddBankTransferForm("fund"));
    act(() => result.current.handleScopeChange("procedures"));
    act(() => result.current.setFundId("fund-1"));
    act(() => result.current.handleProcedureSelectionChange(["p-1"], 46000));

    act(() => result.current.setFundId("fund-2"));

    expect(result.current.selectedProcedureIds).toHaveLength(0);
    expect(result.current.totalAmountMillis).toBe(0);
  });

  it("BSM-050: open procedures have no date bound, so a new date keeps them ticked", () => {
    const { result } = renderHook(() => useAddBankTransferForm("fund"));
    act(() => result.current.handleScopeChange("procedures"));
    act(() => result.current.setFundId("fund-1"));
    act(() => result.current.handleProcedureSelectionChange(["p-1"], 46000));

    act(() => result.current.setTransferDate("2026-03-21"));

    expect(result.current.selectedProcedureIds).toEqual(["p-1"]);
    expect(result.current.totalAmountMillis).toBe(46000);
  });

  it("BSM-053: a refused wire keeps the window and what was ticked", async () => {
    vi.mocked(gateway.createFundWireFromProcedures).mockResolvedValue({
      success: false,
      error: { code: "ProcedureNotOpen", procedure_id: "p-1" },
    });
    const onSaved = vi.fn();
    const { result } = renderHook(() => useAddBankTransferForm("fund", onSaved));
    act(() => result.current.handleScopeChange("procedures"));
    act(() => result.current.setFundId("fund-1"));
    act(() => result.current.handleProcedureSelectionChange(["p-1"], 46000));

    await act(async () => {
      await result.current.handleSubmit(submit);
    });

    expect(onSaved).not.toHaveBeenCalled();
    expect(result.current.selectedProcedureIds).toEqual(["p-1"]);
    expect(toastService.show).toHaveBeenCalledWith("error", expect.stringContaining("p-1"));
  });
});

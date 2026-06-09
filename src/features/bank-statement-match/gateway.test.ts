import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BankAccount, BankError } from "@/bindings";
import type { ServiceResult } from "@/types/api";

import {
  createBankAccount,
  createBankTransfersFromStatement,
  matchBankStatementLines,
  parseBankStatement,
  resolveBankAccountFromIban,
  resolveBankFundLabels,
  saveBankFundLabelMappings,
} from "./gateway";

const mockInvoke = vi.mocked(invoke);

describe("bank-statement-match gateway — createBankAccount re-export (BAS-014 / §2.4.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ServiceResult success with the created BankAccount on happy path", async () => {
    const created: BankAccount = {
      id: "acc-new-1",
      name: "Main Practice",
      iban: "FR7612345678901234567890189",
    };

    // bindings.ts wraps invoke result in { status: "ok", data: … }
    mockInvoke.mockResolvedValue(created);

    const result: ServiceResult<BankAccount, BankError> = await createBankAccount(
      "Main Practice",
      "FR7612345678901234567890189",
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(created);
    }
    expect(mockInvoke).toHaveBeenCalledWith("create_bank_account", {
      name: "Main Practice",
      iban: "FR7612345678901234567890189",
    });
  });

  it("returns ServiceResult failure with IbanAlreadyUsed when backend rejects (BAS-013)", async () => {
    // bindings.ts catch block: non-Error rejections become { status: "error", error: value }
    // Post typed-error migration the wire shape is `{ code: "IbanAlreadyUsed" }`
    // (no IBAN payload — PII would never have a place on the wire).
    mockInvoke.mockRejectedValue({ code: "IbanAlreadyUsed" });

    const result: ServiceResult<BankAccount, BankError> = await createBankAccount(
      "Duplicate",
      "FR7612345678901234567890189",
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toEqual({ code: "IbanAlreadyUsed" });
    }
    expect(mockInvoke).toHaveBeenCalledWith("create_bank_account", {
      name: "Duplicate",
      iban: "FR7612345678901234567890189",
    });
  });
});

describe("bank-statement-match gateway — typed-error ServiceResult wrappers", () => {
  // Each phase sets a fresh persistent invoke behavior after a reset — avoids the
  // `*Once` queue interacting with the persistent base set by the block above.
  function invokeResolves(value: unknown) {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(value);
  }
  // A non-Error rejection: bindings returns `{ status: "error", error }`.
  function invokeTypedError(code: string) {
    mockInvoke.mockReset();
    mockInvoke.mockRejectedValue({ code });
  }
  // A genuine Error rejection: bindings rethrows → the gateway catch maps DatabaseError.
  function invokeThrows() {
    mockInvoke.mockReset();
    mockInvoke.mockRejectedValue(new Error("ipc down"));
  }

  const PARSE_DATA = {
    iban: "FR76",
    period: null,
    credit_lines: [{ date: "2026-04-10", label: "CPAM75", amount: 150000 }],
    total_credits: 150000,
    unparsed_count: 0,
  };

  it("parseBankStatement maps ok and typed-error results, and catches infra throws", async () => {
    invokeResolves(PARSE_DATA);
    expect(await parseBankStatement("/tmp/s.pdf")).toEqual({ success: true, data: PARSE_DATA });

    invokeTypedError("NoSepaCreditLines");
    expect(await parseBankStatement("/tmp/s.pdf")).toEqual({
      success: false,
      error: { code: "NoSepaCreditLines" },
    });

    invokeThrows();
    expect(await parseBankStatement("/tmp/s.pdf")).toEqual({
      success: false,
      error: { code: "DatabaseError" },
    });
  });

  it("resolveBankAccountFromIban passes data through and maps typed errors", async () => {
    invokeResolves(null);
    expect(await resolveBankAccountFromIban("FR76")).toEqual({ success: true, data: null });

    invokeTypedError("DatabaseError");
    expect(await resolveBankAccountFromIban("FR76")).toEqual({
      success: false,
      error: { code: "DatabaseError" },
    });
  });

  it("resolveBankFundLabels passes data through and maps typed errors", async () => {
    invokeResolves([]);
    expect(await resolveBankFundLabels("acc-1", ["CPAM75"])).toEqual({ success: true, data: [] });

    invokeTypedError("DatabaseError");
    expect(await resolveBankFundLabels("acc-1", ["CPAM75"])).toEqual({
      success: false,
      error: { code: "DatabaseError" },
    });
  });

  it("saveBankFundLabelMappings returns void success and maps typed errors", async () => {
    invokeResolves(null);
    expect(await saveBankFundLabelMappings("acc-1", [])).toEqual({
      success: true,
      data: undefined,
    });

    invokeTypedError("DatabaseError");
    expect(await saveBankFundLabelMappings("acc-1", [])).toEqual({
      success: false,
      error: { code: "DatabaseError" },
    });
  });

  it("matchBankStatementLines passes data through and maps typed errors", async () => {
    const data = { matched: [], unmatched_lines: [] };
    invokeResolves(data);
    expect(await matchBankStatementLines([])).toEqual({ success: true, data });

    invokeTypedError("DatabaseError");
    expect(await matchBankStatementLines([])).toEqual({
      success: false,
      error: { code: "DatabaseError" },
    });
  });

  it("createBankTransfersFromStatement passes the count through and maps typed errors", async () => {
    invokeResolves(2);
    expect(await createBankTransfersFromStatement("acc-1", [])).toEqual({ success: true, data: 2 });

    invokeTypedError("InvalidConfirmedMatchDate");
    expect(await createBankTransfersFromStatement("acc-1", [])).toEqual({
      success: false,
      error: { code: "InvalidConfirmedMatchDate" },
    });
  });
});

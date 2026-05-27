import { describe, expect, it } from "vitest";
import type { BankError } from "@/bindings";
import { makeBankAccount } from "@/tests/bank.factory";
import { BankAccountPresenter, formatBankError } from "./presenter";

describe("BankAccountPresenter.toRow", () => {
  it("maps id, name, and iban from domain object and generates a rowId", () => {
    const account = makeBankAccount({ id: "acc-1", name: "Main", iban: "FR76123" });

    const row = BankAccountPresenter.toRow(account);

    expect(row.id).toBe("acc-1");
    expect(row.name).toBe("Main");
    expect(row.iban).toBe("FR76123");
    expect(row.rowId).toHaveLength(36);
  });

  it("generates a unique rowId on each call so React keys remain stable across renders", () => {
    const account = makeBankAccount({ id: "acc-1", name: "Main", iban: "FR76123" });

    const row1 = BankAccountPresenter.toRow(account);
    const row2 = BankAccountPresenter.toRow(account);

    expect(row1.rowId).not.toBe(row2.rowId);
  });

  it("passes null iban through without coercing to empty string", () => {
    const account = makeBankAccount({ name: "Main", iban: null });

    const row = BankAccountPresenter.toRow(account);

    expect(row.iban).toBeNull();
  });
});

describe("BankAccountPresenter.toFormData", () => {
  it("maps name and iban to form fields", () => {
    const account = makeBankAccount({ name: "BNP", iban: "FR76123" });

    expect(BankAccountPresenter.toFormData(account)).toEqual({ name: "BNP", iban: "FR76123" });
  });

  it("converts null iban to empty string", () => {
    const account = makeBankAccount({ name: "BNP", iban: null });

    expect(BankAccountPresenter.toFormData(account)).toEqual({ name: "BNP", iban: "" });
  });
});

describe("formatBankError - F27 Layer 3 (pure code → key mapping)", () => {
  it("maps BankAccountNameEmpty to its key, no params", () => {
    const err: BankError = { code: "BankAccountNameEmpty" };
    expect(formatBankError(err)).toEqual({ key: "bank:errors.bank_account_name_empty" });
  });

  it("maps RefundOnlyVariantRejected to its key", () => {
    const err: BankError = { code: "RefundOnlyVariantRejected" };
    expect(formatBankError(err)).toEqual({ key: "bank:errors.refund_only_variant_rejected" });
  });

  it("maps AmountNotPositive to its key", () => {
    const err: BankError = { code: "AmountNotPositive" };
    expect(formatBankError(err)).toEqual({ key: "bank:errors.amount_not_positive" });
  });

  it("maps InvalidTransferDateFormat to its key", () => {
    const err: BankError = { code: "InvalidTransferDateFormat" };
    expect(formatBankError(err)).toEqual({ key: "bank:errors.invalid_transfer_date_format" });
  });

  it("maps IbanAlreadyUsed to its key WITHOUT a payload (IBAN is PII)", () => {
    const err: BankError = { code: "IbanAlreadyUsed" };
    const result = formatBankError(err);
    expect(result).toEqual({ key: "bank:errors.iban_already_used" });
    expect(result.params).toBeUndefined();
  });

  it("maps BankAccountNotFound to its key WITH the account id as a param", () => {
    const err: BankError = { code: "BankAccountNotFound", bank_account_id: "acc-7" };
    expect(formatBankError(err)).toEqual({
      key: "bank:errors.bank_account_not_found",
      params: { id: "acc-7" },
    });
  });

  it("maps ProtectedCashAccount to its key", () => {
    const err: BankError = { code: "ProtectedCashAccount" };
    expect(formatBankError(err)).toEqual({ key: "bank:errors.protected_cash_account" });
  });

  it("maps TransferNotFound to its key WITH the transfer id as a param", () => {
    const err: BankError = { code: "TransferNotFound", bank_transfer_id: "txn-9" };
    expect(formatBankError(err)).toEqual({
      key: "bank:errors.transfer_not_found",
      params: { id: "txn-9" },
    });
  });

  it("maps DatabaseError to its key", () => {
    const err: BankError = { code: "DatabaseError" };
    expect(formatBankError(err)).toEqual({ key: "bank:errors.database_error" });
  });
});

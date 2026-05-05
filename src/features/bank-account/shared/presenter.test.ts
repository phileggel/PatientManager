import { describe, expect, it } from "vitest";
import { makeBankAccount } from "@/tests/bank.factory";
import { BankAccountPresenter } from "./presenter";

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

import { describe, expect, it } from "vitest";
import type { BankEntry, BankEntryType } from "@/bindings";
import { entryAccountName } from "./presenter";

function entry(transfer_type: BankEntryType, amount = 100000): BankEntry {
  return {
    id: "t-1",
    transfer_date: "2026-03-10",
    amount,
    transfer_type,
    bank_account: { id: "acc-1", name: "Compte principal", iban: null },
  };
}

describe("entryAccountName (BAC-056)", () => {
  it("ticket #518: a fund wire shows its account", () => {
    expect(entryAccountName(entry("FUND_WIRE"))).toBe("Compte principal");
    expect(entryAccountName(entry("FUND_OUTGOING_WIRE"))).toBe("Compte principal");
  });

  it("ticket #518: a direct payment shows none", () => {
    for (const type of ["PATIENT_CASH", "PATIENT_CHECK", "PATIENT_CREDIT_CARD"] as const) {
      expect(entryAccountName(entry(type))).toBeNull();
    }
  });

  it("ticket #518: a refund by check or card shows its account", () => {
    expect(entryAccountName(entry("PATIENT_CHECK", -5000))).toBe("Compte principal");
    expect(entryAccountName(entry("PATIENT_CREDIT_CARD", -5000))).toBe("Compte principal");
  });
});

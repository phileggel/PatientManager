import { describe, expect, it } from "vitest";
import type { BankEntry, BankEntryType } from "@/bindings";
import { entryKind, paymentMethodKey } from "./presenter";

function entry(transfer_type: BankEntryType, amount = 100000): BankEntry {
  return {
    id: "t-1",
    transfer_date: "2026-03-10",
    amount,
    transfer_type,
    bank_account: { id: "acc-1", name: "Compte principal", iban: null },
  };
}

describe("entryKind (#642)", () => {
  it("lists a payment received by check, card or cash on the direct payments page", () => {
    for (const type of ["PATIENT_CHECK", "PATIENT_CREDIT_CARD", "PATIENT_CASH"] as const) {
      expect(entryKind(entry(type))).toBe("direct");
    }
  });

  it("lists a fund's wire on the fund wires page", () => {
    expect(entryKind(entry("FUND_WIRE"))).toBe("fund");
  });

  it("lists an overpayment refund on neither page (REF-110)", () => {
    expect(entryKind(entry("FUND_OUTGOING_WIRE", -60000))).toBeNull();
    expect(entryKind(entry("PATIENT_CHECK", -60000))).toBeNull();
    expect(entryKind(entry("PATIENT_CREDIT_CARD", -60000))).toBeNull();
  });
});

describe("paymentMethodKey (#642)", () => {
  it("names each direct payment method, and no wire", () => {
    expect(paymentMethodKey("PATIENT_CHECK")).toBe("transfer.type_check");
    expect(paymentMethodKey("PATIENT_CREDIT_CARD")).toBe("transfer.type_credit_card");
    expect(paymentMethodKey("PATIENT_CASH")).toBe("transfer.type_cash");
    expect(paymentMethodKey("FUND_WIRE")).toBeNull();
  });
});

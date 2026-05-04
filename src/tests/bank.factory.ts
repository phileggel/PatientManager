import type { BankAccount, BankEntry } from "@/bindings";

export function makeBankAccount(overrides?: Partial<BankAccount>): BankAccount {
  return {
    id: "account-1",
    name: "Main account",
    iban: null,
    ...overrides,
  };
}

export function makeBankEntry(overrides?: Partial<BankEntry>): BankEntry {
  return {
    id: "entry-1",
    transfer_date: "2026-01-15",
    amount: 150000,
    transfer_type: "FUND_WIRE",
    bank_account: makeBankAccount(),
    ...overrides,
  };
}

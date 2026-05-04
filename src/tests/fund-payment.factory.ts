import type { FundPaymentGroup, FundPaymentLine } from "@/bindings";

export function makeFundPaymentLine(overrides?: Partial<FundPaymentLine>): FundPaymentLine {
  return {
    id: "line-1",
    fund_payment_group_id: "group-1",
    procedure_id: "procedure-1",
    ...overrides,
  };
}

export function makeFundPaymentGroup(overrides?: Partial<FundPaymentGroup>): FundPaymentGroup {
  return {
    id: "group-1",
    fund_id: "fund-1",
    payment_date: "2026-01-15",
    total_amount: 150000,
    lines: [makeFundPaymentLine()],
    status: "ACTIVE",
    is_locked: false,
    ...overrides,
  };
}

import { describe, expect, it } from "vitest";
import { makeFund } from "@/tests/fund.factory";
import { makeFundPaymentGroup } from "@/tests/fund-payment.factory";
import { makeProcedure } from "@/tests/procedure.factory";
import { FundPaymentPresenter, formatAmountEUR } from "./presenter";

describe("formatAmountEUR", () => {
  it("converts thousandths to a formatted EUR string", () => {
    const result = formatAmountEUR(12500);
    expect(result).toMatch(/12,50/);
    expect(result).toContain("€");
  });

  it("formats zero thousandths as €0", () => {
    const result = formatAmountEUR(0);
    expect(result).toMatch(/0,00/);
    expect(result).toContain("€");
  });
});

describe("FundPaymentPresenter.toRow", () => {
  it("builds fundName from fund_identifier and name when fund is found", () => {
    const fund = makeFund({ id: "fund-1", fund_identifier: "440", name: "CPAM Loire" });
    const group = makeFundPaymentGroup({ fund_id: "fund-1", total_amount: 150000, lines: [] });

    const row = FundPaymentPresenter.toRow(group, [fund]);

    expect(row.fundName).toBe("440 - CPAM Loire");
    expect(row.totalAmount).toBe(150);
    expect(row.procedureCount).toBe(0);
    expect(row.isLocked).toBe(false);
  });

  it("falls back to group.fund_id when no matching fund is found", () => {
    const group = makeFundPaymentGroup({ fund_id: "unknown-fund" });

    const row = FundPaymentPresenter.toRow(group, []);

    expect(row.fundName).toBe("unknown-fund");
  });
});

describe("FundPaymentPresenter.toDisplayData", () => {
  it("returns null when fund is undefined", () => {
    expect(FundPaymentPresenter.toDisplayData(undefined)).toBeNull();
  });

  it("extracts fundIdentifier and fundName from fund", () => {
    const fund = makeFund({ fund_identifier: "440", name: "CPAM Loire" });

    const data = FundPaymentPresenter.toDisplayData(fund);

    expect(data).toEqual({ fundIdentifier: "440", fundName: "CPAM Loire" });
  });
});

describe("FundPaymentPresenter.toSelectorOptions", () => {
  it("prepends placeholder and sorts remaining options by fund_identifier", () => {
    // "B" < "a" by codepoint (66 < 97), but "A" < "B" < "a" under locale collation.
    // Using "a" / "B" / "Z" forces a sort that would differ from codepoint order.
    const funds = [
      makeFund({ id: "c", fund_identifier: "a", name: "Alpha lower" }),
      makeFund({ id: "a", fund_identifier: "Z", name: "Zulu" }),
      makeFund({ id: "b", fund_identifier: "B", name: "Bravo" }),
    ];

    const options = FundPaymentPresenter.toSelectorOptions(funds, "-- Sélectionner --");

    expect(options).toHaveLength(4);
    expect(options[0]).toEqual({ label: "-- Sélectionner --", value: "" });
    // localeCompare order: "a" < "B" < "Z" (case-folded); codepoint order would be "B" < "Z" < "a"
    expect(options[1]).toEqual({ label: "a (Alpha lower)", value: "c" });
    expect(options[2]).toMatchObject({ value: "b" }); // "B"
    expect(options[3]).toMatchObject({ value: "a" }); // "Z"
  });
});

describe("FundPaymentPresenter.toSelectionSummary", () => {
  it("computes count, isEmpty=false, and totalFormatted for non-empty selection", () => {
    const procedures = [
      makeProcedure({ billed_amount: 25000 }),
      makeProcedure({ billed_amount: 50000 }),
    ];

    const summary = FundPaymentPresenter.toSelectionSummary(procedures);

    expect(summary.count).toBe(2);
    expect(summary.isEmpty).toBe(false);
    expect(summary.totalFormatted).toMatch(/75,00/);
    expect(summary.totalFormatted).toContain("€");
  });

  it("returns isEmpty=true and formats zero total for an empty selection", () => {
    const summary = FundPaymentPresenter.toSelectionSummary([]);

    expect(summary.count).toBe(0);
    expect(summary.isEmpty).toBe(true);
    expect(summary.totalFormatted).toMatch(/0,00/);
    expect(summary.totalFormatted).toContain("€");
  });
});

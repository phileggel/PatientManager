import { describe, expect, it } from "vitest";
import { makeFund } from "@/tests/fund.factory";
import { makeFundPaymentGroup } from "@/tests/fund-payment.factory";
import { makeProcedure } from "@/tests/procedure.factory";
import { FundPaymentPresenter } from "./presenter";

describe("FundPaymentPresenter.toRow", () => {
  it("builds fundName from fund_identifier and name when fund is found", () => {
    const fund = makeFund({ id: "fund-1", fund_identifier: "440", name: "CPAM Loire" });
    const group = makeFundPaymentGroup({ fund_id: "fund-1", total_amount: 150000, lines: [] });

    const row = FundPaymentPresenter.toRow(group, [fund]);

    expect(row.fundName).toBe("440 - CPAM Loire");
    expect(row.totalAmount).toBe(150000);
    expect(row.procedureCount).toBe(0);
    expect(row.isLocked).toBe(false);
  });

  it("falls back to group.fund_id when no matching fund is found", () => {
    const group = makeFundPaymentGroup({ fund_id: "unknown-fund" });

    const row = FundPaymentPresenter.toRow(group, []);

    expect(row.fundName).toBe("unknown-fund");
  });

  describe("FPM-360 — care-period range computation", () => {
    it("computes min/max procedure_date across lines", () => {
      const p1 = makeProcedure({ id: "p1", procedure_date: "2026-01-15" });
      const p2 = makeProcedure({ id: "p2", procedure_date: "2026-02-28" });
      const p3 = makeProcedure({ id: "p3", procedure_date: "2026-01-20" });
      const group = makeFundPaymentGroup({
        fund_id: "fund-1",
        lines: [
          { id: "l1", fund_payment_group_id: "g1", procedure_id: "p1" },
          { id: "l2", fund_payment_group_id: "g1", procedure_id: "p2" },
          { id: "l3", fund_payment_group_id: "g1", procedure_id: "p3" },
        ],
      });
      const proceduresById = new Map([
        ["p1", p1],
        ["p2", p2],
        ["p3", p3],
      ]);

      const row = FundPaymentPresenter.toRow(group, [], proceduresById);

      expect(row.procedureStartDate).toBe("2026-01-15");
      expect(row.procedureEndDate).toBe("2026-02-28");
    });

    it("collapses start === end when single procedure", () => {
      const p1 = makeProcedure({ id: "p1", procedure_date: "2026-01-15" });
      const group = makeFundPaymentGroup({
        lines: [{ id: "l1", fund_payment_group_id: "g1", procedure_id: "p1" }],
      });

      const row = FundPaymentPresenter.toRow(group, [], new Map([["p1", p1]]));

      expect(row.procedureStartDate).toBe("2026-01-15");
      expect(row.procedureEndDate).toBe("2026-01-15");
    });

    it("skips lines whose procedure is missing from the map (still computes range over the rest)", () => {
      const p1 = makeProcedure({ id: "p1", procedure_date: "2026-01-15" });
      const group = makeFundPaymentGroup({
        lines: [
          { id: "l1", fund_payment_group_id: "g1", procedure_id: "p1" },
          { id: "l2", fund_payment_group_id: "g1", procedure_id: "missing" },
        ],
      });

      const row = FundPaymentPresenter.toRow(group, [], new Map([["p1", p1]]));

      expect(row.procedureStartDate).toBe("2026-01-15");
      expect(row.procedureEndDate).toBe("2026-01-15");
    });

    it("returns undefined range when no procedures resolve", () => {
      const group = makeFundPaymentGroup({
        lines: [{ id: "l1", fund_payment_group_id: "g1", procedure_id: "p1" }],
      });

      const row = FundPaymentPresenter.toRow(group, [], new Map());

      expect(row.procedureStartDate).toBeUndefined();
      expect(row.procedureEndDate).toBeUndefined();
    });

    it("returns undefined range when group has no lines", () => {
      const group = makeFundPaymentGroup({ lines: [] });

      const row = FundPaymentPresenter.toRow(group, []);

      expect(row.procedureStartDate).toBeUndefined();
      expect(row.procedureEndDate).toBeUndefined();
    });
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
  it("computes count, isEmpty=false, and totalAmount in thousandths for non-empty selection", () => {
    const procedures = [
      makeProcedure({ billed_amount: 25000 }),
      makeProcedure({ billed_amount: 50000 }),
    ];

    const summary = FundPaymentPresenter.toSelectionSummary(procedures);

    expect(summary.count).toBe(2);
    expect(summary.isEmpty).toBe(false);
    expect(summary.totalAmount).toBe(75000);
  });

  it("returns isEmpty=true and zero totalAmount for an empty selection", () => {
    const summary = FundPaymentPresenter.toSelectionSummary([]);

    expect(summary.count).toBe(0);
    expect(summary.isEmpty).toBe(true);
    expect(summary.totalAmount).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import type { BankFundLabelMapping } from "@/bindings";
import { makeBankAccount } from "@/tests/bank.factory";
import { makeFund } from "@/tests/fund.factory";
import { filterAndSortRows, formatLabelError, toRows } from "./presenter";

const accounts = [
  makeBankAccount({ id: "acc-1", name: "Compte courant" }),
  makeBankAccount({ id: "acc-2", name: "Compte pro" }),
];
const funds = [
  makeFund({ id: "fund-1", name: "CPAM 75" }),
  makeFund({ id: "fund-2", name: "Élan Santé" }),
];
const label = (
  id: string,
  account: string,
  text: string,
  fund: string | null,
): BankFundLabelMapping => ({
  id,
  bank_account_id: account,
  bank_label: text,
  fund_id: fund,
});
const TEXTS = { ignored: "Ignoré", deletedFund: "Caisse supprimée" };

describe("toRows", () => {
  it("test_bas_041_shows_account_label_and_fund_or_ignored", () => {
    const rows = toRows(
      [label("m1", "acc-1", "VIR CPAM", "fund-1"), label("m2", "acc-2", "CHQ", null)],
      accounts,
      funds,
    );
    expect(rows.map((r) => [r.accountName, r.label, r.assignment])).toEqual([
      ["Compte courant", "VIR CPAM", { kind: "fund", fundName: "CPAM 75" }],
      ["Compte pro", "CHQ", { kind: "ignored" }],
    ]);
  });

  it("test_bas_041d_marks_a_label_whose_fund_was_deleted", () => {
    const [row] = toRows([label("m1", "acc-1", "VIR OLD", "fund-gone")], accounts, funds);
    expect(row?.assignment).toEqual({ kind: "deletedFund" });
  });
});

describe("filterAndSortRows", () => {
  const rows = toRows(
    [
      label("m1", "acc-2", "VIR ELAN", "fund-2"),
      label("m2", "acc-1", "VIR CPAM", "fund-1"),
      label("m3", "acc-1", "CHQ REMISE", null),
    ],
    accounts,
    funds,
  );

  it("test_bas_041a_default_order_is_account_then_label", () => {
    expect(filterAndSortRows(rows, "", null, TEXTS).map((r) => r.id)).toEqual(["m3", "m2", "m1"]);
  });

  it("test_bas_041a_a_column_sorts_both_ways", () => {
    const asc = filterAndSortRows(rows, "", { key: "fund", direction: "asc" }, TEXTS);
    expect(asc.map((r) => r.id)).toEqual(["m2", "m1", "m3"]);
    const desc = filterAndSortRows(rows, "", { key: "fund", direction: "desc" }, TEXTS);
    expect(desc.map((r) => r.id)).toEqual(["m3", "m1", "m2"]);
  });

  it("test_bas_041b_search_matches_account_label_or_fund_ignoring_case_and_accents", () => {
    expect(filterAndSortRows(rows, "elan sante", null, TEXTS).map((r) => r.id)).toEqual(["m1"]);
    expect(filterAndSortRows(rows, "PRO", null, TEXTS).map((r) => r.id)).toEqual(["m1"]);
    expect(filterAndSortRows(rows, "ignore", null, TEXTS).map((r) => r.id)).toEqual(["m3"]);
    expect(filterAndSortRows(rows, "remise", null, TEXTS).map((r) => r.id)).toEqual(["m3"]);
  });
});

describe("formatLabelError", () => {
  it("test_bas_044_a_gone_label_has_its_own_message", () => {
    expect(formatLabelError({ code: "LabelMappingNotFound" })).toEqual({
      key: "bank:statement_label.error.gone",
    });
  });

  it("test_bas_042_a_deleted_fund_has_its_own_message", () => {
    expect(formatLabelError({ code: "FundNotFound" })).toEqual({
      key: "bank:statement_label.error.fund_gone",
    });
  });

  it("maps any other code to the generic message", () => {
    expect(formatLabelError({ code: "DatabaseError" })).toEqual({
      key: "bank:statement_label.error.unknown",
    });
  });
});

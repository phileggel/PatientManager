import { describe, expect, it } from "vitest";
import type { Fund, FundError } from "@/bindings";
import { FundPresenter, formatFundError } from "./presenter";

/**
 * FundPresenter - Gold Test Suite
 *
 * CRITICAL: This test suite validates edge cases that can cause silent failures:
 * - Null/undefined field handling in toFormData()
 * - Safe string conversions with fallback values
 *
 * This ensures the presenter pattern handles all data variations robustly,
 * preventing rendering issues and type errors across the CRUD feature.
 */

describe("FundPresenter", () => {
  describe("toFormData - Happy Path", () => {
    it("transforms complete Fund with all fields populated", () => {
      const fund: Fund = {
        id: "fund-1",
        fund_identifier: "CPAM-75",
        name: "CPAM Essonne",
      };

      const result = FundPresenter.toFormData(fund);

      expect(result).toEqual({
        fund_identifier: "CPAM-75",
        name: "CPAM Essonne",
      });
    });
  });

  describe("toFormData - Edge Cases (CRITICAL)", () => {
    it("handles undefined fund_identifier", () => {
      const fund = {
        id: "fund-1",
        fund_identifier: undefined,
        name: "CPAM Essonne",
      } as unknown as Fund;

      const result = FundPresenter.toFormData(fund);

      expect(result.fund_identifier).toBeUndefined();
    });

    it("handles null fund_identifier", () => {
      const fund = {
        id: "fund-1",
        fund_identifier: null,
        name: "CPAM Essonne",
      } as unknown as Fund;

      const result = FundPresenter.toFormData(fund);

      expect(result.fund_identifier).toBeNull();
    });

    it("handles undefined name", () => {
      const fund = {
        id: "fund-1",
        fund_identifier: "CPAM-75",
        name: undefined,
      } as unknown as Fund;

      const result = FundPresenter.toFormData(fund);

      expect(result.name).toBeUndefined();
    });

    it("handles null name", () => {
      const fund = {
        id: "fund-1",
        fund_identifier: "CPAM-75",
        name: null,
      } as unknown as Fund;

      const result = FundPresenter.toFormData(fund);

      expect(result.name).toBeNull();
    });

    it("handles empty string fund_identifier", () => {
      const fund: Fund = {
        id: "fund-1",
        fund_identifier: "",
        name: "CPAM Essonne",
      };

      const result = FundPresenter.toFormData(fund);

      expect(result.fund_identifier).toBe("");
    });

    it("handles empty string name", () => {
      const fund: Fund = {
        id: "fund-1",
        fund_identifier: "CPAM-75",
        name: "",
      };

      const result = FundPresenter.toFormData(fund);

      expect(result.name).toBe("");
    });

    it("handles all fields undefined/null simultaneously", () => {
      const fund = {
        id: "fund-1",
        fund_identifier: undefined,
        name: undefined,
      } as unknown as Fund;

      const result = FundPresenter.toFormData(fund);

      expect(result).toEqual({
        fund_identifier: undefined,
        name: undefined,
      });
    });
  });

  describe("toRow - Happy Path", () => {
    it("transforms complete Fund to row data", () => {
      const fund: Fund = {
        id: "fund-1",
        fund_identifier: "CPAM-75",
        name: "CPAM Essonne",
      };

      const result = FundPresenter.toRow(fund);

      expect(result).toEqual({
        rowId: expect.any(String),
        fundIdentifier: "CPAM-75",
        fundName: "CPAM Essonne",
        id: "fund-1",
      });
      expect(result.rowId).toHaveLength(36); // UUID format
    });
  });

  describe("toRow - Edge Cases", () => {
    it("handles undefined fund_identifier", () => {
      const fund = {
        id: "fund-1",
        fund_identifier: undefined,
        name: "CPAM Essonne",
      } as unknown as Fund;

      const result = FundPresenter.toRow(fund);

      expect(result.fundIdentifier).toBeUndefined();
    });

    it("handles null fund_identifier", () => {
      const fund = {
        id: "fund-1",
        fund_identifier: null,
        name: "CPAM Essonne",
      } as unknown as Fund;

      const result = FundPresenter.toRow(fund);

      expect(result.fundIdentifier).toBeNull();
    });

    it("handles undefined name", () => {
      const fund = {
        id: "fund-1",
        fund_identifier: "CPAM-75",
        name: undefined,
      } as unknown as Fund;

      const result = FundPresenter.toRow(fund);

      expect(result.fundName).toBeUndefined();
    });

    it("handles null name", () => {
      const fund = {
        id: "fund-1",
        fund_identifier: "CPAM-75",
        name: null,
      } as unknown as Fund;

      const result = FundPresenter.toRow(fund);

      expect(result.fundName).toBeNull();
    });
  });
});

describe("formatFundError - F27 Layer 3 (pure code → key mapping)", () => {
  it("maps FundIdentifierEmpty to its key, no params", () => {
    const err: FundError = { code: "FundIdentifierEmpty" };
    expect(formatFundError(err)).toEqual({ key: "fund:errors.fund_identifier_empty" });
  });

  it("maps FundNameEmpty to its key", () => {
    const err: FundError = { code: "FundNameEmpty" };
    expect(formatFundError(err)).toEqual({ key: "fund:errors.fund_name_empty" });
  });

  it("maps FundIdEmpty to its key", () => {
    const err: FundError = { code: "FundIdEmpty" };
    expect(formatFundError(err)).toEqual({ key: "fund:errors.fund_id_empty" });
  });

  it("maps TotalAmountNotPositive to its key", () => {
    const err: FundError = { code: "TotalAmountNotPositive" };
    expect(formatFundError(err)).toEqual({ key: "fund:errors.total_amount_not_positive" });
  });

  it("maps InvalidPaymentDateFormat to its key", () => {
    const err: FundError = { code: "InvalidPaymentDateFormat" };
    expect(formatFundError(err)).toEqual({ key: "fund:errors.invalid_payment_date_format" });
  });

  it("maps FundPaymentGroupIdEmpty to its key", () => {
    const err: FundError = { code: "FundPaymentGroupIdEmpty" };
    expect(formatFundError(err)).toEqual({ key: "fund:errors.fund_payment_group_id_empty" });
  });

  it("maps LineProcedureIdEmpty to its key", () => {
    const err: FundError = { code: "LineProcedureIdEmpty" };
    expect(formatFundError(err)).toEqual({ key: "fund:errors.line_procedure_id_empty" });
  });

  it("maps PaymentGroupNotFound to its key WITH the group id as a param", () => {
    const err: FundError = {
      code: "PaymentGroupNotFound",
      fund_payment_group_id: "grp-42",
    };
    expect(formatFundError(err)).toEqual({
      key: "fund:errors.payment_group_not_found",
      params: { id: "grp-42" },
    });
  });

  it("maps DatabaseError to its key", () => {
    const err: FundError = { code: "DatabaseError" };
    expect(formatFundError(err)).toEqual({ key: "fund:errors.database_error" });
  });
});

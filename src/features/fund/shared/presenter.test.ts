import { describe, expect, it } from "vitest";
import type { AffiliatedFund } from "@/bindings";
import { FundPresenter } from "./presenter";

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
      const fund: AffiliatedFund = {
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
      } as unknown as AffiliatedFund;

      const result = FundPresenter.toFormData(fund);

      expect(result.fund_identifier).toBeUndefined();
    });

    it("handles null fund_identifier", () => {
      const fund = {
        id: "fund-1",
        fund_identifier: null,
        name: "CPAM Essonne",
      } as unknown as AffiliatedFund;

      const result = FundPresenter.toFormData(fund);

      expect(result.fund_identifier).toBeNull();
    });

    it("handles undefined name", () => {
      const fund = {
        id: "fund-1",
        fund_identifier: "CPAM-75",
        name: undefined,
      } as unknown as AffiliatedFund;

      const result = FundPresenter.toFormData(fund);

      expect(result.name).toBeUndefined();
    });

    it("handles null name", () => {
      const fund = {
        id: "fund-1",
        fund_identifier: "CPAM-75",
        name: null,
      } as unknown as AffiliatedFund;

      const result = FundPresenter.toFormData(fund);

      expect(result.name).toBeNull();
    });

    it("handles empty string fund_identifier", () => {
      const fund: AffiliatedFund = {
        id: "fund-1",
        fund_identifier: "",
        name: "CPAM Essonne",
      };

      const result = FundPresenter.toFormData(fund);

      expect(result.fund_identifier).toBe("");
    });

    it("handles empty string name", () => {
      const fund: AffiliatedFund = {
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
      } as unknown as AffiliatedFund;

      const result = FundPresenter.toFormData(fund);

      expect(result).toEqual({
        fund_identifier: undefined,
        name: undefined,
      });
    });
  });

  describe("toRow - Happy Path", () => {
    it("transforms complete Fund to row data", () => {
      const fund: AffiliatedFund = {
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
      } as unknown as AffiliatedFund;

      const result = FundPresenter.toRow(fund);

      expect(result.fundIdentifier).toBeUndefined();
    });

    it("handles null fund_identifier", () => {
      const fund = {
        id: "fund-1",
        fund_identifier: null,
        name: "CPAM Essonne",
      } as unknown as AffiliatedFund;

      const result = FundPresenter.toRow(fund);

      expect(result.fundIdentifier).toBeNull();
    });

    it("handles undefined name", () => {
      const fund = {
        id: "fund-1",
        fund_identifier: "CPAM-75",
        name: undefined,
      } as unknown as AffiliatedFund;

      const result = FundPresenter.toRow(fund);

      expect(result.fundName).toBeUndefined();
    });

    it("handles null name", () => {
      const fund = {
        id: "fund-1",
        fund_identifier: "CPAM-75",
        name: null,
      } as unknown as AffiliatedFund;

      const result = FundPresenter.toRow(fund);

      expect(result.fundName).toBeNull();
    });
  });
});

import { describe, expect, it } from "vitest";
import type { ProcedureType } from "@/bindings";
import { ProcedureTypePresenter } from "./presenter";

/**
 * ProcedureTypePresenter - Gold Test Suite
 *
 * CRITICAL: This test suite validates edge cases that previously caused crashes:
 * - Null/undefined field handling in toFormData()
 * - Safe numeric conversions (preventing .toString() on undefined)
 *
 * Issue: default_amount field from backend can be undefined/null, and calling
 * .toString() directly would crash. Solution: Use nullish coalescing (??).
 *
 * This test ensures the presenter pattern is robust across all data variations.
 */

describe("ProcedureTypePresenter", () => {
  describe("toFormData - Happy Path", () => {
    it("transforms complete ProcedureType with all fields populated", () => {
      const procedureType: ProcedureType = {
        id: "proc-1",
        name: "X-Ray",
        default_amount: 150500,
        category: "Radiology",
      };

      const result = ProcedureTypePresenter.toFormData(procedureType);

      expect(result).toEqual({
        name: "X-Ray",
        defaultAmount: "150.5",
        category: "Radiology",
      });
    });

    it("converts numeric defaultAmount to string correctly", () => {
      const procedureType: ProcedureType = {
        id: "proc-1",
        name: "Test",
        default_amount: 99990,
        category: "Test",
      };

      const result = ProcedureTypePresenter.toFormData(procedureType);

      expect(result.defaultAmount).toBe("99.99");
      expect(typeof result.defaultAmount).toBe("string");
    });
  });

  describe("toFormData - Edge Cases (CRITICAL)", () => {
    it("handles undefined defaultAmount without crashing", () => {
      const procedureType = {
        id: "proc-1",
        name: "Test",
        default_amount: undefined,
        category: "Test",
      } as unknown as ProcedureType;

      // This used to crash with: "TypeError: undefined is not an object"
      const result = ProcedureTypePresenter.toFormData(procedureType);

      expect(result.defaultAmount).toBe("0");
      expect(typeof result.defaultAmount).toBe("string");
    });

    it("handles null defaultAmount without crashing", () => {
      const procedureType = {
        id: "proc-1",
        name: "Test",
        default_amount: null,
        category: "Test",
      } as unknown as ProcedureType;

      const result = ProcedureTypePresenter.toFormData(procedureType);

      expect(result.defaultAmount).toBe("0");
      expect(typeof result.defaultAmount).toBe("string");
    });

    it("handles zero as valid defaultAmount", () => {
      const procedureType: ProcedureType = {
        id: "proc-1",
        name: "Test",
        default_amount: 0,
        category: "Test",
      };

      const result = ProcedureTypePresenter.toFormData(procedureType);

      expect(result.defaultAmount).toBe("0");
    });

    it("handles empty string name by using fallback", () => {
      const procedureType: ProcedureType = {
        id: "proc-1",
        name: "",
        default_amount: 50000,
        category: "Test",
      };

      const result = ProcedureTypePresenter.toFormData(procedureType);

      expect(result.name).toBe("");
    });

    it("handles undefined name by using fallback", () => {
      const procedureType = {
        id: "proc-1",
        name: undefined,
        default_amount: 50000,
        category: "Test",
      } as unknown as ProcedureType;

      const result = ProcedureTypePresenter.toFormData(procedureType);

      expect(result.name).toBe("");
    });

    it("handles undefined category by using fallback", () => {
      const procedureType = {
        id: "proc-1",
        name: "Test",
        default_amount: 50000,
        category: undefined,
      } as unknown as ProcedureType;

      const result = ProcedureTypePresenter.toFormData(procedureType);

      expect(result.category).toBe("");
    });

    it("handles all fields undefined/null simultaneously", () => {
      const procedureType = {
        id: "proc-1",
        name: undefined,
        default_amount: undefined,
        category: undefined,
      } as unknown as ProcedureType;

      // Should not crash despite all fields being undefined
      const result = ProcedureTypePresenter.toFormData(procedureType);

      expect(result).toEqual({
        name: "",
        defaultAmount: "0",
        category: "",
      });
    });
  });

  describe("toRow - Happy Path", () => {
    it("transforms complete ProcedureType to row data", () => {
      const procedureType: ProcedureType = {
        id: "proc-1",
        name: "X-Ray",
        default_amount: 150500,
        category: "Radiology",
      };

      const result = ProcedureTypePresenter.toRow(procedureType);

      expect(result).toEqual({
        rowId: expect.any(String),
        id: "proc-1",
        name: "X-Ray",
        defaultAmount: 150.5, // 150500 thousandths → 150.50€
        category: "Radiology",
      });
      expect(result.rowId).toHaveLength(36); // UUID format
    });
  });

  describe("toRow - Edge Cases", () => {
    it("handles undefined defaultAmount with fallback to 0", () => {
      const procedureType = {
        id: "proc-1",
        name: "Test",
        default_amount: undefined,
        category: "Test",
      } as unknown as ProcedureType;

      const result = ProcedureTypePresenter.toRow(procedureType);

      expect(result.defaultAmount).toBe(0);
    });

    it("handles null defaultAmount with fallback to 0", () => {
      const procedureType = {
        id: "proc-1",
        name: "Test",
        default_amount: null,
        category: "Test",
      } as unknown as ProcedureType;

      const result = ProcedureTypePresenter.toRow(procedureType);

      expect(result.defaultAmount).toBe(0);
    });

    it("handles undefined category with fallback to null", () => {
      const procedureType = {
        id: "proc-1",
        name: "Test",
        default_amount: 50000,
        category: undefined,
      } as unknown as ProcedureType;

      const result = ProcedureTypePresenter.toRow(procedureType);

      expect(result.category).toBeNull();
    });
  });
});

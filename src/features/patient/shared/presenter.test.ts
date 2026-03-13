import { describe, expect, it } from "vitest";
import type { AffiliatedFund, Patient } from "@/bindings";
import { PatientPresenter } from "./presenter";

/**
 * PatientPresenter - Gold Test Suite
 *
 * CRITICAL: This test suite validates edge cases that can cause silent failures:
 * - Null/undefined field handling in toFormData()
 * - Safe string conversions with fallback values
 *
 * This ensures the presenter pattern handles all data variations robustly,
 * preventing rendering issues and type errors.
 */

describe("PatientPresenter", () => {
  describe("toFormData - Happy Path", () => {
    it("transforms complete Patient with all fields populated", () => {
      const patient: Patient = {
        id: "patient-1",
        name: "John Doe",
        ssn: "1234567890123",
        is_anonymous: false,
        latest_procedure_type: null,
        latest_fund: null,
        latest_date: "",
        latest_procedure_amount: null,
        temp_id: null,
      };

      const result = PatientPresenter.toFormData(patient);

      expect(result).toEqual({
        name: "John Doe",
        ssn: "1234567890123",
      });
    });
  });

  describe("toFormData - Edge Cases (CRITICAL)", () => {
    it("handles undefined name by using fallback", () => {
      const patient = {
        id: "patient-1",
        name: undefined,
        ssn: "1234567890123",
        is_anonymous: false,
        latest_procedure_type: null,
        latest_fund: null,
        latest_date: null,
        latest_procedure_amount: null,
      } as unknown as Patient;

      const result = PatientPresenter.toFormData(patient);

      expect(result.name).toBe("");
    });

    it("handles null name by using fallback", () => {
      const patient = {
        id: "patient-1",
        name: null,
        ssn: "1234567890123",
        is_anonymous: false,
        latest_procedure_type: null,
        latest_fund: null,
        latest_date: null,
        latest_procedure_amount: null,
      } as unknown as Patient;

      const result = PatientPresenter.toFormData(patient);

      expect(result.name).toBe("");
    });

    it("handles undefined SSN by using fallback", () => {
      const patient = {
        id: "patient-1",
        name: "John Doe",
        ssn: undefined,
        is_anonymous: false,
        latest_procedure_type: null,
        latest_fund: null,
        latest_date: null,
        latest_procedure_amount: null,
      } as unknown as Patient;

      const result = PatientPresenter.toFormData(patient);

      expect(result.ssn).toBe("");
    });

    it("handles null SSN by using fallback", () => {
      const patient = {
        id: "patient-1",
        name: "John Doe",
        ssn: null,
        is_anonymous: false,
        latest_procedure_type: null,
        latest_fund: null,
        latest_date: null,
        latest_procedure_amount: null,
      } as unknown as Patient;

      const result = PatientPresenter.toFormData(patient);

      expect(result.ssn).toBe("");
    });

    it("handles all editable fields undefined/null simultaneously", () => {
      const patient = {
        id: "patient-1",
        name: undefined,
        ssn: undefined,
        is_anonymous: false,
        latest_procedure_type: null,
        latest_fund: null,
        latest_date: null,
        latest_procedure_amount: null,
      } as unknown as Patient;

      const result = PatientPresenter.toFormData(patient);

      expect(result).toEqual({
        name: "",
        ssn: "",
      });
    });
  });

  describe("toRow - Happy Path", () => {
    it("transforms complete Patient to row data without funds", () => {
      const patient: Patient = {
        id: "patient-1",
        name: "John Doe",
        ssn: "1234567890123",
        is_anonymous: false,
        temp_id: null,
        latest_procedure_type: "X-Ray",
        latest_fund: "fund-uuid-1",
        latest_date: "2025-01-15",
        latest_procedure_amount: 150.5,
      };

      const result = PatientPresenter.toRow(patient);

      expect(result).toEqual({
        rowId: expect.any(String),
        id: "patient-1",
        name: "John Doe",
        ssn: "1234567890123",
        latestFund: "fund-uuid-1",
        latestDate: "2025-01-15",
        isAnonymous: false,
      });
      expect(result.rowId).toHaveLength(36); // UUID format
    });

    it("resolves latestFund to 'identifier (name)' when funds are provided", () => {
      const patient: Patient = {
        id: "patient-1",
        name: "John Doe",
        ssn: "1234567890123",
        is_anonymous: false,
        temp_id: null,
        latest_procedure_type: null,
        latest_fund: "fund-uuid-1",
        latest_date: "2025-01-15",
        latest_procedure_amount: null,
      };
      const funds: AffiliatedFund[] = [
        { id: "fund-uuid-1", fund_identifier: "440", name: "CPAM Loire-Atlantique", temp_id: null },
        { id: "fund-uuid-2", fund_identifier: "750", name: "MGEN Paris", temp_id: null },
      ];

      const result = PatientPresenter.toRow(patient, funds);

      expect(result.latestFund).toBe("440 (CPAM Loire-Atlantique)");
    });

    it("keeps raw value when fund id not found in funds list", () => {
      const patient: Patient = {
        id: "patient-1",
        name: "John Doe",
        ssn: null,
        is_anonymous: false,
        temp_id: null,
        latest_procedure_type: null,
        latest_fund: "fund-unknown",
        latest_date: "",
        latest_procedure_amount: null,
      };
      const funds: AffiliatedFund[] = [
        { id: "fund-uuid-1", fund_identifier: "440", name: "CPAM Loire-Atlantique", temp_id: null },
      ];

      const result = PatientPresenter.toRow(patient, funds);

      expect(result.latestFund).toBe("fund-unknown");
    });

    it("keeps null when latest_fund is null even with funds provided", () => {
      const patient: Patient = {
        id: "patient-1",
        name: "John Doe",
        ssn: null,
        is_anonymous: false,
        temp_id: null,
        latest_procedure_type: null,
        latest_fund: null,
        latest_date: "",
        latest_procedure_amount: null,
      };
      const funds: AffiliatedFund[] = [
        { id: "fund-uuid-1", fund_identifier: "440", name: "CPAM Loire-Atlantique", temp_id: null },
      ];

      const result = PatientPresenter.toRow(patient, funds);

      expect(result.latestFund).toBeNull();
    });
  });

  describe("toRow - Edge Cases", () => {
    it("handles undefined name with fallback to null", () => {
      const patient = {
        id: "patient-1",
        name: undefined,
        ssn: "1234567890123",
        is_anonymous: false,
        latest_procedure_type: null,
        latest_fund: null,
        latest_date: null,
        latest_procedure_amount: null,
      } as unknown as Patient;

      const result = PatientPresenter.toRow(patient);

      expect(result.name).toBeNull();
    });

    it("handles undefined SSN with fallback to null", () => {
      const patient = {
        id: "patient-1",
        name: "John Doe",
        ssn: undefined,
        is_anonymous: false,
        latest_procedure_type: null,
        latest_fund: null,
        latest_date: null,
        latest_procedure_amount: null,
      } as unknown as Patient;

      const result = PatientPresenter.toRow(patient);

      expect(result.ssn).toBeNull();
    });

    it("handles undefined latest_fund with fallback to null", () => {
      const patient = {
        id: "patient-1",
        name: "John Doe",
        ssn: "1234567890123",
        is_anonymous: false,
        latest_procedure_type: null,
        latest_fund: undefined,
        latest_date: null,
        latest_procedure_amount: null,
      } as unknown as Patient;

      const result = PatientPresenter.toRow(patient);

      expect(result.latestFund).toBeNull();
    });

    it("handles undefined latest_date with fallback to null", () => {
      const patient = {
        id: "patient-1",
        name: "John Doe",
        ssn: "1234567890123",
        is_anonymous: false,
        latest_procedure_type: null,
        latest_fund: null,
        latest_date: undefined,
        latest_procedure_amount: null,
      } as unknown as Patient;

      const result = PatientPresenter.toRow(patient);

      expect(result.latestDate).toBeNull();
    });
  });
});

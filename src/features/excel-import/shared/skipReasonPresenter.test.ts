import { describe, expect, it } from "vitest";
import type { SkipReason } from "@/bindings";
import { formatSkipReason } from "./skipReasonPresenter";

describe("formatSkipReason", () => {
  it("maps param-carrying variants with their payloads", () => {
    expect(formatSkipReason({ code: "InsufficientColumns", needed: 4 })).toEqual({
      key: "excel-import:parsing_report.reasons.insufficient_columns",
      params: { needed: 4 },
    });
    expect(formatSkipReason({ code: "UnrecognizedDateFormat", value: "not-a-date" })).toEqual({
      key: "excel-import:parsing_report.reasons.unrecognized_date_format",
      params: { value: "not-a-date" },
    });
    expect(formatSkipReason({ code: "PatientNotFound", name: "Alice" })).toEqual({
      key: "excel-import:parsing_report.reasons.patient_not_found",
      params: { name: "Alice" },
    });
    expect(formatSkipReason({ code: "FundNotFound", identifier: "440" })).toEqual({
      key: "excel-import:parsing_report.reasons.fund_not_found",
      params: { identifier: "440" },
    });
    expect(formatSkipReason({ code: "InvalidAmount", value: "abc" })).toEqual({
      key: "excel-import:parsing_report.reasons.invalid_amount",
      params: { value: "abc" },
    });
    expect(formatSkipReason({ code: "InvalidProcedureDate", value: "31/12/2026" })).toEqual({
      key: "excel-import:parsing_report.reasons.invalid_procedure_date",
      params: { value: "31/12/2026" },
    });
    expect(formatSkipReason({ code: "InvalidConfirmedPaymentDate", value: "garbage" })).toEqual({
      key: "excel-import:parsing_report.reasons.invalid_confirmed_payment_date",
      params: { value: "garbage" },
    });
    expect(formatSkipReason({ code: "DateOutsideSheetMonth", date: "2026-02-15" })).toEqual({
      key: "excel-import:parsing_report.reasons.date_outside_sheet_month",
      params: { date: "2026-02-15" },
    });
  });

  it("maps unit variants to their bare keys", () => {
    const cases: Array<[SkipReason, string]> = [
      [{ code: "MissingPatientName" }, "excel-import:parsing_report.reasons.missing_patient_name"],
      [
        { code: "MissingFundIdentifier" },
        "excel-import:parsing_report.reasons.missing_fund_identifier",
      ],
      [{ code: "MissingFundName" }, "excel-import:parsing_report.reasons.missing_fund_name"],
      [{ code: "UnknownSheetName" }, "excel-import:parsing_report.reasons.unknown_sheet_name"],
    ];
    for (const [reason, key] of cases) {
      expect(formatSkipReason(reason)).toEqual({ key });
    }
  });
});

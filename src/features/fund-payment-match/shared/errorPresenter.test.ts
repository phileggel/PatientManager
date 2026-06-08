import { describe, expect, it } from "vitest";
import type { FundPaymentReconciliationError } from "@/bindings";
import { formatReconciliationError } from "./errorPresenter";

describe("formatReconciliationError", () => {
  it("maps AllDuplicates to the already_imported key with the count param", () => {
    expect(formatReconciliationError({ code: "AllDuplicates", count: 3 })).toEqual({
      key: "fund-payment-match:errors.already_imported",
      params: { count: 3 },
    });
  });

  it("maps the remaining task guards to their specific keys", () => {
    const cases: Array<[FundPaymentReconciliationError["code"], string]> = [
      ["NoValidCandidates", "fund-payment-match:errors.no_valid_candidates"],
      [
        "NoValidCandidatesAfterCorrections",
        "fund-payment-match:errors.no_valid_candidates_after_corrections",
      ],
      ["InvalidDateRange", "fund-payment-match:errors.invalid_date_range"],
      ["PdfPathRejected", "fund-payment-match:errors.pdf_path_rejected"],
      ["PdfExtractionFailed", "fund-payment-match:errors.pdf_extraction_failed"],
    ];
    for (const [code, key] of cases) {
      expect(formatReconciliationError({ code } as FundPaymentReconciliationError).key).toBe(key);
    }
  });

  it("maps the shared infra catch-all to database_error", () => {
    expect(formatReconciliationError({ code: "DatabaseError" }).key).toBe(
      "fund-payment-match:errors.database_error",
    );
  });

  it("maps unreachable BC domain invariants to the generic unexpected key", () => {
    expect(
      formatReconciliationError({ code: "InvalidSsn" } as FundPaymentReconciliationError).key,
    ).toBe("fund-payment-match:errors.unexpected");
    expect(
      formatReconciliationError({
        code: "ProcedureNotFound",
        procedure_id: "p-1",
      } as FundPaymentReconciliationError).key,
    ).toBe("fund-payment-match:errors.unexpected");
    expect(
      formatReconciliationError({
        code: "TotalAmountNotPositive",
      } as FundPaymentReconciliationError).key,
    ).toBe("fund-payment-match:errors.unexpected");
  });
});

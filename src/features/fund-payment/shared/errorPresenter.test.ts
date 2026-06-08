import { describe, expect, it } from "vitest";
import type { FundPaymentManualManagementError } from "@/bindings";
import { formatManualManagementError } from "./errorPresenter";

describe("formatManualManagementError", () => {
  it("maps the use-case guards + reachable lookups to specific keys", () => {
    const cases: Array<[FundPaymentManualManagementError["code"], string]> = [
      ["GroupLocked", "fund-payment:errors.group_locked"],
      ["RefundGroupProtected", "fund-payment:errors.refund_group_protected"],
      ["PaymentGroupNotFound", "fund-payment:errors.group_not_found"],
      ["InvalidPaymentDateFormat", "fund-payment:errors.invalid_payment_date"],
      ["DatabaseError", "fund-payment:errors.database_error"],
    ];
    for (const [code, key] of cases) {
      expect(formatManualManagementError({ code } as FundPaymentManualManagementError).key).toBe(
        key,
      );
    }
  });

  it("maps unreachable BC domain invariants to the generic unexpected key", () => {
    for (const code of ["FundIdEmpty", "TotalAmountNotPositive", "ProcedureNotFound"] as const) {
      expect(formatManualManagementError({ code } as FundPaymentManualManagementError).key).toBe(
        "fund-payment:errors.unexpected",
      );
    }
  });
});

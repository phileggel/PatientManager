import { describe, expect, it } from "vitest";
import type { BankStatementReconciliationError } from "@/bindings";
import { formatBankStatementError } from "./errorPresenter";

describe("formatBankStatementError", () => {
  it("maps the R26 sentinel to the dedicated no-SEPA-lines guidance", () => {
    expect(formatBankStatementError({ code: "NoSepaCreditLines" }).key).toBe(
      "bank:statement.modal.noVirSepaLines",
    );
  });

  it("maps every other code (task guards, bank/fund BC) to the generic error", () => {
    const cases: Array<BankStatementReconciliationError> = [
      { code: "HomeDirUnresolved" },
      { code: "PathRejected" },
      { code: "PdfExtractionFailed" },
      { code: "InvalidConfirmedMatchDate" },
      { code: "DatabaseError" },
      { code: "AmountNotPositive" },
      { code: "BankAccountNotFound", bank_account_id: "acc-1" },
      { code: "InvalidTransferDateFormat" },
      { code: "PaymentGroupNotFound", fund_payment_group_id: "fpg-1" },
      { code: "TotalAmountNotPositive" },
    ];
    for (const err of cases) {
      expect(formatBankStatementError(err).key).toBe("bank:statement.modal.unknownError");
    }
  });
});

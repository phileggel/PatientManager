import { describe, expect, it } from "vitest";
import type { BankManualMatchError } from "@/bindings";
import { bankEntryFieldErrorKeys, formatBankManualMatchError } from "./errorPresenter";

describe("formatBankManualMatchError", () => {
  it("maps the use-case guard to its specific key", () => {
    expect(formatBankManualMatchError({ code: "WrongTransferType" }).key).toBe(
      "bank:errors.wrong_transfer_type",
    );
  });

  it("maps reachable bank-BC errors, carrying struct params through", () => {
    expect(
      formatBankManualMatchError({ code: "TransferNotFound", bank_transfer_id: "bt-1" }),
    ).toEqual({
      key: "bank:errors.transfer_not_found",
      params: { id: "bt-1" },
    });

    const simple: Array<[BankManualMatchError["code"], string]> = [
      ["AmountNotPositive", "bank:errors.amount_not_positive"],
      ["InvalidTransferDateFormat", "bank:errors.invalid_transfer_date_format"],
      ["RefundOnlyVariantRejected", "bank:errors.refund_only_variant_rejected"],
      ["BankEntryInvalid", "bank:errors.bank_entry_invalid"],
    ];
    for (const [code, key] of simple) {
      expect(formatBankManualMatchError({ code } as BankManualMatchError).key).toBe(key);
    }
  });

  it("maps the reachable fund-BC lookup with its id param", () => {
    expect(
      formatBankManualMatchError({ code: "PaymentGroupNotFound", fund_payment_group_id: "fpg-1" }),
    ).toEqual({
      key: "bank:errors.payment_group_not_found",
      params: { id: "fpg-1" },
    });
  });

  it("maps the shared infra catch-all to database_error", () => {
    expect(formatBankManualMatchError({ code: "DatabaseError" }).key).toBe(
      "bank:errors.database_error",
    );
  });

  it("maps unreachable BC domain invariants to the generic unexpected key", () => {
    const cases: Array<BankManualMatchError> = [
      { code: "IbanAlreadyUsed" },
      { code: "TotalAmountNotPositive" },
      { code: "ProcedureNotFound", procedure_id: "p-1" },
      { code: "ProcedureTypeNameDuplicate" },
    ];
    for (const err of cases) {
      expect(formatBankManualMatchError(err).key).toBe("bank:errors.unexpected");
    }
  });
});

describe("bankEntryFieldErrorKeys (BSM-023)", () => {
  it("gives one key per refused field, the date's missing and invalid apart", () => {
    expect(
      bankEntryFieldErrorKeys({
        code: "BankEntryInvalid",
        reasons: ["AccountMissing", "DateInvalid", "NothingSelected"],
      }),
    ).toEqual({
      bankAccount: "transfer.validate.bank_account_required",
      transferDate: "transfer.validate.date_invalid",
      selection: "transfer.validate.no_items_selected",
    });
  });

  it("is null for a refusal that is not about the form's fields", () => {
    expect(
      bankEntryFieldErrorKeys({ code: "TransferNotFound", bank_transfer_id: "bt-1" }),
    ).toBeNull();
  });
});

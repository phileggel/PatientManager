import { describe, expect, it } from "vitest";
import type { OverpaymentError } from "@/bindings";
import { formatOverpaymentError } from "./presenter";

/**
 * Layer 3 (F27 typed-error pipeline): pure code → i18n key mapping for the
 * overpayment use case. No runtime dependency on i18next.
 */
describe("formatOverpaymentError", () => {
  // --- OverpaymentTask variants ---

  it("maps SourceProcedureNotFound to its key, no params (id not user-meaningful in toast)", () => {
    const err: OverpaymentError = { code: "SourceProcedureNotFound", id: "proc-1" };
    expect(formatOverpaymentError(err)).toEqual({
      key: "overpayment:errors.source_procedure_not_found",
    });
  });

  it("maps SourceNotRefundable (REF-010) to its key, no params", () => {
    const err: OverpaymentError = { code: "SourceNotRefundable" };
    expect(formatOverpaymentError(err)).toEqual({
      key: "overpayment:errors.source_not_refundable",
    });
  });

  it("maps InvalidRefundDate (REF-030) to its key", () => {
    const err: OverpaymentError = { code: "InvalidRefundDate" };
    expect(formatOverpaymentError(err)).toEqual({
      key: "overpayment:errors.invalid_refund_date",
    });
  });

  it("maps ReasonTooLong (REF-040) to its key", () => {
    const err: OverpaymentError = { code: "ReasonTooLong" };
    expect(formatOverpaymentError(err)).toEqual({
      key: "overpayment:errors.reason_too_long",
    });
  });

  it("maps TransferTypeRejected (REF-060) to its key", () => {
    const err: OverpaymentError = { code: "TransferTypeRejected" };
    expect(formatOverpaymentError(err)).toEqual({
      key: "overpayment:errors.transfer_type_rejected",
    });
  });

  it("maps BankAccountRequired (REF-070) to its key", () => {
    const err: OverpaymentError = { code: "BankAccountRequired" };
    expect(formatOverpaymentError(err)).toEqual({
      key: "overpayment:errors.bank_account_required",
    });
  });

  it("maps BankAccountNotFound (REF-070) to its key, no params", () => {
    const err: OverpaymentError = { code: "BankAccountNotFound", id: "acc-1" };
    expect(formatOverpaymentError(err)).toEqual({
      key: "overpayment:errors.bank_account_not_found",
    });
  });

  it("maps SourceHasNoFund to its key, no params", () => {
    const err: OverpaymentError = { code: "SourceHasNoFund", id: "proc-1" };
    expect(formatOverpaymentError(err)).toEqual({
      key: "overpayment:errors.source_has_no_fund",
    });
  });

  it("maps RefundGroupProtected (REF-240) to its key", () => {
    const err: OverpaymentError = { code: "RefundGroupProtected" };
    expect(formatOverpaymentError(err)).toEqual({
      key: "overpayment:errors.refund_group_protected",
    });
  });

  it("maps RefundRecordNotFound (REF-210) to its key", () => {
    const err: OverpaymentError = { code: "RefundRecordNotFound" };
    expect(formatOverpaymentError(err)).toEqual({
      key: "overpayment:errors.refund_record_not_found",
    });
  });

  it("maps OverpaymentTask::DatabaseError to its key", () => {
    const err: OverpaymentError = { code: "DatabaseError" };
    expect(formatOverpaymentError(err)).toEqual({
      key: "overpayment:errors.database_error",
    });
  });

  // --- ProcedureError (BC) variants reachable via the composite ---

  it("maps ProcedureNotFound (mid-flight source disappears) to source_procedure_not_found, no params", () => {
    const err: OverpaymentError = { code: "ProcedureNotFound", procedure_id: "p-1" };
    expect(formatOverpaymentError(err)).toEqual({
      key: "overpayment:errors.source_procedure_not_found",
    });
  });

  it("maps ProcedureError::DatabaseError to the generic database_error key", () => {
    // Intentional collision: both arms emit { code: "DatabaseError" } on the wire.
    const err: OverpaymentError = { code: "DatabaseError" };
    expect(formatOverpaymentError(err)).toEqual({
      key: "overpayment:errors.database_error",
    });
  });
});

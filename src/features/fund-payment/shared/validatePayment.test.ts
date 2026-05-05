import { describe, expect, it } from "vitest";
import { validatePaymentForm } from "./validatePayment";

const messages = {
  fundRequired: "Fund is required",
  paymentDateRequired: "Payment date is required",
  proceduresRequired: "At least one procedure is required",
};

describe("validatePaymentForm", () => {
  it("returns no errors when all inputs are valid", () => {
    const errors = validatePaymentForm("fund-1", "2025-01-15", true, true, messages);
    expect(errors).toEqual({});
  });

  it("rejects missing fund", () => {
    const errors = validatePaymentForm("", "2025-01-15", true, true, messages);
    expect(errors.fund).toBe(messages.fundRequired);
    expect(errors.paymentDate).toBeUndefined();
  });

  it("rejects missing payment date", () => {
    const errors = validatePaymentForm("fund-1", "", true, true, messages);
    expect(errors.paymentDate).toBe(messages.paymentDateRequired);
    expect(errors.fund).toBeUndefined();
  });

  it("rejects no procedures when validateProcedures is true and hasSelection is false", () => {
    const errors = validatePaymentForm("fund-1", "2025-01-15", false, true, messages);
    expect(errors.procedures).toBe(messages.proceduresRequired);
  });

  it("skips procedure check when validateProcedures is false", () => {
    const errors = validatePaymentForm("fund-1", "2025-01-15", false, false, messages);
    expect(errors.procedures).toBeUndefined();
  });

  it("returns all three errors when all fields are missing and validateProcedures is true", () => {
    const errors = validatePaymentForm("", "", false, true, messages);
    expect(errors).toEqual({
      fund: messages.fundRequired,
      paymentDate: messages.paymentDateRequired,
      procedures: messages.proceduresRequired,
    });
  });
});

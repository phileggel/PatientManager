import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("PRO-090: a partially reconciled procedure has an outlined badge of the reconciled family", () => {
    render(<StatusBadge status="PARTIALLY_RECONCILED" />);
    const badge = screen.getByText("Partially Reconciled");
    expect(badge).toHaveClass("border-m3-tertiary", "text-m3-tertiary");
    expect(badge).not.toHaveClass("bg-m3-surface-container-high");
  });

  it("PRO-090: a partially fund-paid procedure has an outlined badge of the paid family", () => {
    render(<StatusBadge status="PARTIALLY_FUND_PAID" />);
    const badge = screen.getByText("Partially Fund Paid");
    expect(badge).toHaveClass("border-m3-primary", "text-m3-primary");
    expect(badge).not.toHaveClass("bg-m3-surface-container-high");
  });

  it.each([
    ["NONE", "bg-m3-surface-container-high"],
    ["CREATED", "bg-m3-secondary-container"],
    ["RECONCILED", "bg-m3-tertiary-container"],
    ["DIRECTLY_PAID", "bg-m3-primary-container"],
    ["FUND_PAID", "bg-m3-primary-container"],
    ["IMPORT_DIRECTLY_PAID", "bg-m3-primary-container"],
    ["IMPORT_FUND_PAID", "bg-m3-primary-container"],
    ["OVERPAID", "bg-m3-error-container"],
    ["OVERPAYMENT_REFUND", "bg-m3-error-container"],
  ])("PRO-090: status %s is a filled badge (%s)", (status, token) => {
    const { container } = render(<StatusBadge status={status} />);
    expect(container.firstElementChild).toHaveClass(token);
  });
});

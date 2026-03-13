import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import type { AffiliatedFund } from "@/bindings";
import { useAppStore } from "@/lib/appStore";
import { AddFundPaymentPanel } from "./AddFundPaymentPanel";

const mockFunds: AffiliatedFund[] = [
  {
    id: "f1",
    fund_identifier: "CPAM",
    name: "CPAM France",
    temp_id: null,
  },
  {
    id: "f2",
    fund_identifier: "MGEN",
    name: "MGEN Santé",
    temp_id: null,
  },
];

describe("AddFundPaymentPanel", () => {
  beforeEach(() => {
    // Setup store with mock funds
    useAppStore.setState({ funds: mockFunds });
  });

  it("renders form with fund selector and date picker", () => {
    render(<AddFundPaymentPanel />);

    expect(screen.getByLabelText("Fund *")).toBeInTheDocument();
    expect(screen.getByLabelText("Payment Date *")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Select procedures/i })).toBeInTheDocument();
  });

  it("renders all funds in selector dropdown", () => {
    render(<AddFundPaymentPanel />);

    const fundSelect = screen.getByLabelText("Fund *") as HTMLSelectElement;
    expect(fundSelect.children).toHaveLength(3); // "Select a fund" + 2 funds
  });

  it("displays selected fund information when fund is chosen", async () => {
    const user = userEvent.setup();
    render(<AddFundPaymentPanel />);

    const fundSelect = screen.getByLabelText("Fund *");
    await user.selectOptions(fundSelect, "f2");

    await waitFor(() => {
      expect(screen.getByText("MGEN Santé")).toBeInTheDocument();
    });
  });

  it("hides fund display when no fund is selected", () => {
    render(<AddFundPaymentPanel />);

    expect(screen.queryByText("CPAM France")).not.toBeInTheDocument();
    expect(screen.queryByText("MGEN Santé")).not.toBeInTheDocument();
  });

  it("allows selecting fund and entering payment date", async () => {
    const user = userEvent.setup();
    render(<AddFundPaymentPanel />);

    const fundSelect = screen.getByLabelText("Fund *") as HTMLSelectElement;
    const dateInput = screen.getByLabelText("Payment Date *") as HTMLInputElement;

    await user.selectOptions(fundSelect, "f1");
    await user.type(dateInput, "2025-02-15");

    expect(fundSelect.value).toBe("f1");
    expect(dateInput.value).toBe("2025-02-15");
  });

  it("preserves fund selection when date is updated", async () => {
    const user = userEvent.setup();
    render(<AddFundPaymentPanel />);

    const fundSelect = screen.getByLabelText("Fund *");
    const dateInput = screen.getByLabelText("Payment Date *");

    await user.selectOptions(fundSelect, "f1");

    await waitFor(() => {
      expect(screen.getByText("CPAM France")).toBeInTheDocument();
    });

    await user.type(dateInput, "2025-02-15");

    // Fund info should still be displayed
    expect(screen.getByText("CPAM France")).toBeInTheDocument();
  });

  it("renders with empty fund list", () => {
    useAppStore.setState({ funds: [] });
    render(<AddFundPaymentPanel />);

    const fundSelect = screen.getByLabelText("Fund *") as HTMLSelectElement;
    // Only "Select a fund" option
    expect(fundSelect.children).toHaveLength(1);
  });
});

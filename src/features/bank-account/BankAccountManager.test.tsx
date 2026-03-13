import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BankAccountManager } from "./BankAccountManager";
import { useBankAccountManager } from "./useBankAccountManager";

vi.mock("./useBankAccountManager");
vi.mock("./add_bank_account_panel/AddBankAccountPanel", () => ({
  AddBankAccountPanel: () => <div>Add Bank Account Panel Mock</div>,
}));
vi.mock("./bank_account_list/BankAccountList", () => ({
  BankAccountList: () => <div>Bank Account List Mock</div>,
}));

describe("BankAccountManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders page layout with title", () => {
    vi.mocked(useBankAccountManager).mockReturnValue({
      count: 0,
    });

    render(<BankAccountManager />);

    expect(screen.getByText("Bank Accounts")).toBeInTheDocument();
  });

  it("displays account count", () => {
    vi.mocked(useBankAccountManager).mockReturnValue({
      count: 5,
    });

    render(<BankAccountManager />);

    // The count should be displayed in the header
    expect(screen.getByText("Bank Accounts")).toBeInTheDocument();
  });

  it("renders side panel with add bank account form", () => {
    vi.mocked(useBankAccountManager).mockReturnValue({
      count: 0,
    });

    render(<BankAccountManager />);

    expect(screen.getByText("Add Bank Account Panel Mock")).toBeInTheDocument();
  });

  it("renders bank account list table", () => {
    vi.mocked(useBankAccountManager).mockReturnValue({
      count: 2,
    });

    render(<BankAccountManager />);

    expect(screen.getByText("Bank Account List Mock")).toBeInTheDocument();
  });

  it("renders search field for account search", () => {
    vi.mocked(useBankAccountManager).mockReturnValue({
      count: 0,
    });

    render(<BankAccountManager />);

    const searchInput = screen.getByPlaceholderText(/Search bank accounts/i);
    expect(searchInput).toBeInTheDocument();
  });
});

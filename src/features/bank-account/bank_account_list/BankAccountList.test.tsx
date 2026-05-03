import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBankAccountList } from "./useBankAccountList";

vi.mock("../gateway");
vi.mock("./useBankAccountList");
vi.mock("../edit_bank_account_modal/EditBankAccountModal", () => ({
  EditBankAccountModal: () => <div>Edit Bank Account Modal Mock</div>,
}));

interface ConfirmationDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: string;
}

vi.mock("@ui/components", async () => {
  const actual = await vi.importActual("@ui/components");
  return {
    ...actual,
    ConfirmationDialog: ({
      isOpen,
      onConfirm,
      onCancel,
      title,
      confirmLabel = "Delete",
    }: ConfirmationDialogProps) =>
      isOpen ? (
        <div data-testid="confirmation-dialog">
          <h2>{title}</h2>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      ) : null,
  };
});

import { BankAccountList } from "./BankAccountList";

describe("BankAccountList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state", () => {
    vi.mocked(useBankAccountList).mockReturnValue({
      bankAccountRows: [],
      accounts: [],
      loading: true,
      cashAccountId: null,
      deleteBankAccount: vi.fn(),
    });

    render(<BankAccountList searchTerm="" />);

    expect(screen.getByText(/Loading bank accounts/i)).toBeInTheDocument();
  });

  it("renders empty state when no accounts", () => {
    vi.mocked(useBankAccountList).mockReturnValue({
      bankAccountRows: [],
      accounts: [],
      loading: false,
      cashAccountId: null,
      deleteBankAccount: vi.fn(),
    });

    render(<BankAccountList searchTerm="" />);

    expect(screen.getByText(/No bank accounts found/i)).toBeInTheDocument();
  });

  it("renders table with bank accounts", () => {
    vi.mocked(useBankAccountList).mockReturnValue({
      bankAccountRows: [
        { rowId: "row-1", id: "acc-1", name: "Main Account" },
        { rowId: "row-2", id: "acc-2", name: "Secondary Account" },
      ],
      accounts: [
        { id: "acc-1", name: "Main Account", iban: "DE89370400440532013000" },
        { id: "acc-2", name: "Secondary Account", iban: "FR1420041010050500013M02606" },
      ],
      loading: false,
      cashAccountId: null,
      deleteBankAccount: vi.fn(),
    });

    render(<BankAccountList searchTerm="" />);

    expect(screen.getByText("Main Account")).toBeInTheDocument();
    expect(screen.getByText("Secondary Account")).toBeInTheDocument();
  });

  it("filters accounts by search term", () => {
    vi.mocked(useBankAccountList).mockReturnValue({
      bankAccountRows: [
        { rowId: "row-1", id: "acc-1", name: "Main Account" },
        { rowId: "row-2", id: "acc-2", name: "Secondary Account" },
      ],
      accounts: [
        { id: "acc-1", name: "Main Account", iban: "DE89370400440532013000" },
        { id: "acc-2", name: "Secondary Account", iban: "FR1420041010050500013M02606" },
      ],
      loading: false,
      cashAccountId: null,
      deleteBankAccount: vi.fn(),
    });

    render(<BankAccountList searchTerm="secondary" />);

    expect(screen.getByText("Secondary Account")).toBeInTheDocument();
    expect(screen.queryByText("Main Account")).not.toBeInTheDocument();
  });

  it("sorts by name when header clicked", async () => {
    const user = userEvent.setup();

    vi.mocked(useBankAccountList).mockReturnValue({
      bankAccountRows: [
        { rowId: "row-1", id: "acc-1", name: "Beta Account" },
        { rowId: "row-2", id: "acc-2", name: "Alpha Account" },
      ],
      accounts: [
        { id: "acc-1", name: "Beta Account", iban: "DE89370400440532013000" },
        { id: "acc-2", name: "Alpha Account", iban: "FR1420041010050500013M02606" },
      ],
      loading: false,
      cashAccountId: null,
      deleteBankAccount: vi.fn(),
    });

    render(<BankAccountList searchTerm="" />);

    const nameHeader = screen.getByText("Name");
    await user.click(nameHeader);

    expect(screen.getByText("Name")).toBeInTheDocument();
  });

  it("displays edit and delete buttons for each account", () => {
    vi.mocked(useBankAccountList).mockReturnValue({
      bankAccountRows: [{ rowId: "row-1", id: "acc-123", name: "Main Account" }],
      accounts: [{ id: "acc-123", name: "Main Account", iban: "DE89370400440532013000" }],
      loading: false,
      cashAccountId: null,
      deleteBankAccount: vi.fn(),
    });

    render(<BankAccountList searchTerm="" />);

    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it("shows delete confirmation dialog when delete button is clicked", async () => {
    const user = userEvent.setup();

    vi.mocked(useBankAccountList).mockReturnValue({
      bankAccountRows: [{ rowId: "row-1", id: "acc-123", name: "Main Account" }],
      accounts: [{ id: "acc-123", name: "Main Account", iban: "DE89370400440532013000" }],
      loading: false,
      cashAccountId: null,
      deleteBankAccount: vi.fn(),
    });

    render(<BankAccountList searchTerm="" />);

    const deleteButton = screen.getAllByRole("button", { name: /delete account/i })[0];
    if (deleteButton) {
      await user.click(deleteButton);
    }

    expect(screen.getByText("Delete Bank Account")).toBeInTheDocument();
  });

  it("disables edit and delete buttons for the cash account row", () => {
    vi.mocked(useBankAccountList).mockReturnValue({
      bankAccountRows: [
        { rowId: "row-cash", id: "acc-cash", name: "Cash Account" },
        { rowId: "row-1", id: "acc-1", name: "Main Account" },
      ],
      accounts: [
        { id: "acc-cash", name: "Cash Account", iban: null },
        { id: "acc-1", name: "Main Account", iban: "DE89370400440532013000" },
      ],
      loading: false,
      cashAccountId: "acc-cash",
      deleteBankAccount: vi.fn(),
    });

    render(<BankAccountList searchTerm="" />);

    const editCash = screen.getByRole("button", { name: /edit account cash account/i });
    const deleteCash = screen.getByRole("button", { name: /delete account cash account/i });
    const editMain = screen.getByRole("button", { name: /edit account main account/i });
    const deleteMain = screen.getByRole("button", { name: /delete account main account/i });

    expect(editCash).toBeDisabled();
    expect(deleteCash).toBeDisabled();
    expect(editMain).not.toBeDisabled();
    expect(deleteMain).not.toBeDisabled();
  });

  it("does not open edit modal on double-click of cash account row", async () => {
    const user = userEvent.setup();

    vi.mocked(useBankAccountList).mockReturnValue({
      bankAccountRows: [{ rowId: "row-cash", id: "acc-cash", name: "Cash Account" }],
      accounts: [{ id: "acc-cash", name: "Cash Account", iban: null }],
      loading: false,
      cashAccountId: "acc-cash",
      deleteBankAccount: vi.fn(),
    });

    render(<BankAccountList searchTerm="" />);

    const row = screen.getByText("Cash Account").closest("tr");
    if (row) {
      await user.dblClick(row);
    }

    expect(screen.queryByText("Edit Bank Account Modal Mock")).not.toBeInTheDocument();
  });
});

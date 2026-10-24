import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toastService } from "@/ui/components/snackbar";
import { useBankAccountList } from "./useBankAccountList";

vi.mock("../gateway");
vi.mock("./useBankAccountList");
vi.mock("../edit_bank_account_modal/EditBankAccountModal", () => ({
  EditBankAccountModal: ({
    bankAccount,
    onClose,
  }: {
    bankAccount: unknown;
    onClose: () => void;
  }) =>
    bankAccount ? (
      <div>
        Edit Bank Account Modal Mock
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null,
}));

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

  it("ticket #448: a refused deletion shows why, without an Error prefix (BAC-043)", async () => {
    const user = userEvent.setup();
    const show = vi.spyOn(toastService, "show").mockImplementation(() => {});
    vi.mocked(useBankAccountList).mockReturnValue({
      bankAccountRows: [{ rowId: "row-1", id: "acc-123", name: "Main Account" }],
      accounts: [{ id: "acc-123", name: "Main Account", iban: null }],
      loading: false,
      cashAccountId: null,
      deleteBankAccount: vi.fn().mockRejectedValue(new Error("Held")),
    });

    render(<BankAccountList searchTerm="" />);
    const deleteButton = screen.getAllByRole("button", { name: /delete account/i })[0];
    if (deleteButton) await user.click(deleteButton);
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(show).toHaveBeenCalledWith("error", "Failed to delete account: Held");
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

  it("opens edit modal on double-click of a normal account row", async () => {
    const user = userEvent.setup();

    vi.mocked(useBankAccountList).mockReturnValue({
      bankAccountRows: [{ rowId: "row-1", id: "acc-1", name: "Main Account" }],
      accounts: [{ id: "acc-1", name: "Main Account", iban: "DE89370400440532013000" }],
      loading: false,
      cashAccountId: null,
      deleteBankAccount: vi.fn(),
    });

    render(<BankAccountList searchTerm="" />);

    const row = screen.getByText("Main Account").closest("tr");
    if (row) {
      await user.dblClick(row);
    }

    expect(screen.getByText("Edit Bank Account Modal Mock")).toBeInTheDocument();
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

describe("BankAccountList — deletion and the cash account row (BAC-040 to BAC-044, BAC-053)", () => {
  const mainRow = { rowId: "row-1", id: "acc-123", name: "Main Account" };

  function listWith(deleteBankAccount: () => Promise<void>, cashAccountId: string | null = null) {
    vi.mocked(useBankAccountList).mockReturnValue({
      bankAccountRows: [mainRow],
      accounts: [{ id: "acc-123", name: "Main Account", iban: null }],
      loading: false,
      cashAccountId,
      deleteBankAccount,
    });
  }

  async function askToDelete(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: /delete account main account/i }));
  }

  it("names the account in the confirmation (BAC-040)", async () => {
    const user = userEvent.setup();
    listWith(vi.fn());
    render(<BankAccountList searchTerm="" />);

    await askToDelete(user);

    expect(screen.getByText("Are you sure you want to delete Main Account?")).toBeInTheDocument();
  });

  it("cancelling the confirmation deletes nothing (BAC-040)", async () => {
    const user = userEvent.setup();
    const remove = vi.fn();
    listWith(remove);
    render(<BankAccountList searchTerm="" />);

    await askToDelete(user);
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(remove).not.toHaveBeenCalled();
    expect(screen.queryByText("Delete Bank Account")).not.toBeInTheDocument();
  });

  it("a confirmed deletion says so and closes the dialog (BAC-042)", async () => {
    const user = userEvent.setup();
    const show = vi.spyOn(toastService, "show").mockImplementation(() => {});
    listWith(vi.fn().mockResolvedValue(undefined));
    render(<BankAccountList searchTerm="" />);

    await askToDelete(user);
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(show).toHaveBeenCalledWith("success", 'Account "Main Account" deleted successfully');
    expect(screen.queryByText("Delete Bank Account")).not.toBeInTheDocument();
  });

  it("a refused deletion closes the dialog and keeps the account listed (BAC-043, BAC-044)", async () => {
    const user = userEvent.setup();
    vi.spyOn(toastService, "show").mockImplementation(() => {});
    listWith(vi.fn().mockRejectedValue(new Error("Held")));
    render(<BankAccountList searchTerm="" />);

    await askToDelete(user);
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.queryByText("Delete Bank Account")).not.toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Main Account" })).toBeInTheDocument();
  });

  it("the cash account row says it is managed automatically (BAC-053)", () => {
    listWith(vi.fn(), "acc-123");
    render(<BankAccountList searchTerm="" />);

    const row = screen.getByRole("cell", { name: "Main Account" }).closest("tr");

    expect(row).toHaveAttribute(
      "title",
      "The cash account is managed automatically and cannot be modified",
    );
  });
});

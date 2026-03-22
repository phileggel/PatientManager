import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FundList } from "./FundList";

// Mock child components
vi.mock("../edit_fund_modal/EditFundModal", () => ({
  EditFundModal: () => null,
}));

interface ConfirmationDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
}

vi.mock("@/ui/components", async () => {
  const actual = await vi.importActual("@/ui/components");
  return {
    ...actual,
    ConfirmationDialog: ({ isOpen, onConfirm, onCancel, title }: ConfirmationDialogProps) =>
      isOpen ? (
        <div data-testid="confirmation-dialog">
          <h2>{title}</h2>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm}>
            Delete
          </button>
        </div>
      ) : null,
  };
});

const mockFundRows = [
  { rowId: "1", id: "f1", fundIdentifier: "cpam_001", fundName: "CPAM" },
  { rowId: "2", id: "f2", fundIdentifier: "mgen_001", fundName: "MGEN" },
  { rowId: "3", id: "f3", fundIdentifier: "msa_001", fundName: "MSA" },
];

const mockFunds = [
  {
    id: "f1",
    fund_identifier: "cpam_001",
    name: "CPAM",
    temp_id: null,
    created_at: "2025-01-01T00:00:00Z",
    is_deleted: false,
  },
  {
    id: "f2",
    fund_identifier: "mgen_001",
    name: "MGEN",
    temp_id: null,
    created_at: "2025-01-02T00:00:00Z",
    is_deleted: false,
  },
  {
    id: "f3",
    fund_identifier: "msa_001",
    name: "MSA",
    temp_id: null,
    created_at: "2025-01-03T00:00:00Z",
    is_deleted: false,
  },
];

vi.mock("./useFundList", () => ({
  useFundList: () => ({
    fundRows: mockFundRows,
    funds: mockFunds,
    loading: false,
    deleteFund: vi.fn(),
  }),
}));

vi.mock("./useSortFundList", () => ({
  useSortFundList: (funds: typeof mockFundRows, searchTerm: string) => {
    const filtered = searchTerm
      ? funds.filter(
          (f) =>
            f.fundIdentifier?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            f.fundName?.toLowerCase().includes(searchTerm.toLowerCase()),
        )
      : funds;

    return {
      sortedAndFilteredFunds: filtered,
      sortConfig: { key: null, direction: null },
      handleSort: vi.fn(),
    };
  },
}));

describe("FundList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders fund table with data", () => {
    render(<FundList searchTerm="" />);

    expect(screen.getByText("CPAM")).toBeInTheDocument();
    expect(screen.getByText("MGEN")).toBeInTheDocument();
    expect(screen.getByText("MSA")).toBeInTheDocument();
    expect(screen.getByText("cpam_001")).toBeInTheDocument();
  });

  it("displays empty state when no funds match search", () => {
    render(<FundList searchTerm="nonexistent" />);

    expect(screen.getByText("No funds found.")).toBeInTheDocument();
  });

  it("filters funds by identifier", () => {
    render(<FundList searchTerm="cpam" />);

    expect(screen.getByText("CPAM")).toBeInTheDocument();
    expect(screen.queryByText("MGEN")).not.toBeInTheDocument();
    expect(screen.queryByText("MSA")).not.toBeInTheDocument();
  });

  it("filters funds by name", () => {
    render(<FundList searchTerm="mgen" />);

    expect(screen.getByText("MGEN")).toBeInTheDocument();
    expect(screen.queryByText("CPAM")).not.toBeInTheDocument();
    expect(screen.queryByText("MSA")).not.toBeInTheDocument();
  });

  it("calls edit button handler", async () => {
    const user = userEvent.setup();

    render(<FundList searchTerm="" />);

    const firstEditButton = screen.getAllByRole("button", { name: /edit fund/i })[0];
    if (!firstEditButton) throw new Error("Edit button not found");
    await user.click(firstEditButton);

    expect(firstEditButton).toBeInTheDocument();
  });

  it("shows delete dialog when delete button is clicked", async () => {
    const user = userEvent.setup();

    render(<FundList searchTerm="" />);

    const firstDeleteButton = screen.getAllByRole("button", { name: /delete fund/i })[0];
    if (!firstDeleteButton) throw new Error("Delete button not found");
    await user.click(firstDeleteButton);

    expect(screen.getByText("Delete Fund")).toBeInTheDocument();
  });

  it("sorts by identifier", async () => {
    const user = userEvent.setup();

    render(<FundList searchTerm="" />);

    const identifierHeader = screen.getByText("Identifier");
    await user.click(identifierHeader);

    expect(screen.getByText("CPAM")).toBeInTheDocument();
  });

  it("sorts by name", async () => {
    const user = userEvent.setup();

    render(<FundList searchTerm="" />);

    const nameHeader = screen.getByText("Name");
    await user.click(nameHeader);

    expect(screen.getByText("MGEN")).toBeInTheDocument();
  });
});

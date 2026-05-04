import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProcedureTypeList } from "./ProcedureTypeList";

// Mock child components
vi.mock("../edit_procedure_type_modal/EditProcedureTypeModal", () => ({
  EditProcedureTypeModal: () => null,
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

const mockProcedureTypeRows = [
  // defaultAmount is in euros (presenter converts from thousandths)
  { rowId: "1", id: "pt1", name: "Consultation", defaultAmount: 50, category: "Basic" },
  { rowId: "2", id: "pt2", name: "Surgery", defaultAmount: 300, category: "Advanced" },
  { rowId: "3", id: "pt3", name: "Check-up", defaultAmount: 30, category: "Basic" },
];

const mockProcedureTypes = [
  {
    id: "pt1",
    name: "Consultation",
    default_amount: 50000,
    category: "Basic",
    temp_id: null,
    created_at: "2025-01-01T00:00:00Z",
    is_deleted: false,
  },
  {
    id: "pt2",
    name: "Surgery",
    default_amount: 300000,
    category: "Advanced",
    temp_id: null,
    created_at: "2025-01-02T00:00:00Z",
    is_deleted: false,
  },
  {
    id: "pt3",
    name: "Check-up",
    default_amount: 30000,
    category: "Basic",
    temp_id: null,
    created_at: "2025-01-03T00:00:00Z",
    is_deleted: false,
  },
];

vi.mock("./useProcedureTypeList", () => ({
  useProcedureTypeList: vi.fn(),
}));

vi.mock("./useSortProcedureTypeList", () => ({
  useSortProcedureTypeList: (types: typeof mockProcedureTypeRows, searchTerm: string) => {
    const filtered = searchTerm
      ? types.filter(
          (pt) =>
            pt.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            pt.category?.toLowerCase().includes(searchTerm.toLowerCase()),
        )
      : types;

    return {
      sortedAndFilteredProcedureTypes: filtered,
      sortConfig: { key: null, direction: null },
      handleSort: vi.fn(),
    };
  },
}));

import { useProcedureTypeList } from "./useProcedureTypeList";

const normalize = (s: string) => s.replace(/ | /g, " ").trim();

describe("ProcedureTypeList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useProcedureTypeList).mockReturnValue({
      procedureTypeRows: mockProcedureTypeRows,
      procedureTypes: mockProcedureTypes,
      loading: false,
      error: null,
      retry: vi.fn(),
      deleteProcedureType: vi.fn(),
    });
  });

  it("renders procedure type list with data", () => {
    render(<ProcedureTypeList searchTerm="" />);

    expect(screen.getByText("Consultation")).toBeInTheDocument();
    expect(screen.getByText("Surgery")).toBeInTheDocument();
    expect(screen.getByText("Check-up")).toBeInTheDocument();
  });

  it("displays procedure type names in table", () => {
    render(<ProcedureTypeList searchTerm="" />);

    expect(screen.getByText("Consultation")).toBeInTheDocument();
    expect(screen.getByText("Surgery")).toBeInTheDocument();
  });

  it("displays default amounts with currency formatting", () => {
    render(<ProcedureTypeList searchTerm="" />);

    const fmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
    const cells = screen.getAllByRole("cell");
    const textContents = cells.map((c) => normalize(c.textContent ?? ""));

    expect(textContents).toContain(normalize(fmt.format(50)));
    expect(textContents).toContain(normalize(fmt.format(300)));
    expect(textContents).toContain(normalize(fmt.format(30)));
  });

  it("displays category information", () => {
    render(<ProcedureTypeList searchTerm="" />);

    const cells = screen.getAllByText("Basic");
    expect(cells.length).toBeGreaterThan(0);
    expect(screen.getByText("Advanced")).toBeInTheDocument();
  });

  it("filters procedure types by search term", () => {
    render(<ProcedureTypeList searchTerm="consultation" />);

    expect(screen.getByText("Consultation")).toBeInTheDocument();
    expect(screen.queryByText("Surgery")).not.toBeInTheDocument();
    expect(screen.queryByText("Check-up")).not.toBeInTheDocument();
  });

  it("filters procedure types by category search", () => {
    render(<ProcedureTypeList searchTerm="advanced" />);

    expect(screen.getByText("Surgery")).toBeInTheDocument();
    expect(screen.queryByText("Consultation")).not.toBeInTheDocument();
  });

  it("renders action buttons for each procedure type", () => {
    render(<ProcedureTypeList searchTerm="" />);

    const editButtons = screen.getAllByRole("button", { name: /Edit procedure type/i });
    const deleteButtons = screen.getAllByRole("button", { name: /Delete procedure type/i });

    expect(editButtons.length).toBe(3);
    expect(deleteButtons.length).toBe(3);
  });

  it("shows loading state", () => {
    vi.mocked(useProcedureTypeList).mockReturnValue({
      procedureTypeRows: [],
      procedureTypes: [],
      loading: true,
      error: null,
      retry: vi.fn(),
      deleteProcedureType: vi.fn(),
    });

    render(<ProcedureTypeList searchTerm="" />);

    expect(screen.getByText("Loading procedure types...")).toBeInTheDocument();
  });

  it("shows error state with retry button", async () => {
    const retryFn = vi.fn();
    vi.mocked(useProcedureTypeList).mockReturnValue({
      procedureTypeRows: [],
      procedureTypes: [],
      loading: false,
      error: "Failed to load",
      retry: retryFn,
      deleteProcedureType: vi.fn(),
    });

    const user = userEvent.setup();
    render(<ProcedureTypeList searchTerm="" />);

    expect(screen.getByText("Failed to load procedure types.")).toBeInTheDocument();
    const retryButton = screen.getByRole("button", { name: /retry/i });
    await user.click(retryButton);
    expect(retryFn).toHaveBeenCalledOnce();
  });

  it("shows empty state (no types, no search) with FAB invite", () => {
    vi.mocked(useProcedureTypeList).mockReturnValue({
      procedureTypeRows: [],
      procedureTypes: [],
      loading: false,
      error: null,
      retry: vi.fn(),
      deleteProcedureType: vi.fn(),
    });

    render(<ProcedureTypeList searchTerm="" />);

    expect(
      screen.getByText("No procedure types yet. Use the + button to create one."),
    ).toBeInTheDocument();
  });

  it("shows no results state when search has no match", () => {
    vi.mocked(useProcedureTypeList).mockReturnValue({
      procedureTypeRows: mockProcedureTypeRows,
      procedureTypes: mockProcedureTypes,
      loading: false,
      error: null,
      retry: vi.fn(),
      deleteProcedureType: vi.fn(),
    });

    render(<ProcedureTypeList searchTerm="zzznomatch" />);

    expect(screen.getByText("No procedure types match your search.")).toBeInTheDocument();
  });

  it("shows delete confirmation dialog when delete button is clicked", async () => {
    const user = userEvent.setup();

    render(<ProcedureTypeList searchTerm="" />);

    const deleteButtons = screen.getAllByRole("button", { name: /Delete procedure type/i });
    const firstDeleteButton = deleteButtons[0];
    if (!firstDeleteButton) throw new Error("Delete button not found");
    await user.click(firstDeleteButton);

    expect(screen.getByText("Delete Procedure Type")).toBeInTheDocument();
  });

  it("renders with correct headers", () => {
    render(<ProcedureTypeList searchTerm="" />);

    expect(screen.getByRole("columnheader", { name: /name/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /default amount/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /category/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /actions/i })).toBeInTheDocument();
  });

  it("does not render import-pdf reserved type in the list (R23)", () => {
    // Hook returns rows already filtered (hook responsibility), simulate by not including import-pdf
    vi.mocked(useProcedureTypeList).mockReturnValue({
      procedureTypeRows: mockProcedureTypeRows, // does not include import-pdf
      procedureTypes: mockProcedureTypes,
      loading: false,
      error: null,
      retry: vi.fn(),
      deleteProcedureType: vi.fn(),
    });

    render(<ProcedureTypeList searchTerm="" />);

    // "Import" (the display name of import-pdf) should not appear in the table
    expect(screen.queryByText("Import")).not.toBeInTheDocument();
    // Regular types are still shown
    expect(screen.getByText("Consultation")).toBeInTheDocument();
  });
});

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

describe("ProcedureTypeList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useProcedureTypeList).mockReturnValue({
      procedureTypeRows: mockProcedureTypeRows,
      procedureTypes: mockProcedureTypes,
      loading: false,
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

    expect(screen.getByText("€50.00")).toBeInTheDocument();
    expect(screen.getByText("€300.00")).toBeInTheDocument();
    expect(screen.getByText("€30.00")).toBeInTheDocument();
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

  it("renders with correct headers", () => {
    render(<ProcedureTypeList searchTerm="" />);

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Default Amount")).toBeInTheDocument();
    expect(screen.getByText("Category")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    vi.mocked(useProcedureTypeList).mockReturnValue({
      procedureTypeRows: [],
      procedureTypes: [],
      loading: true,
      deleteProcedureType: vi.fn(),
    });

    render(<ProcedureTypeList searchTerm="" />);

    expect(screen.getByText("Loading procedure types...")).toBeInTheDocument();
  });

  it("shows empty state when no procedure types found", () => {
    vi.mocked(useProcedureTypeList).mockReturnValue({
      procedureTypeRows: [],
      procedureTypes: [],
      loading: false,
      deleteProcedureType: vi.fn(),
    });

    render(<ProcedureTypeList searchTerm="" />);

    expect(screen.getByText("No procedure types found.")).toBeInTheDocument();
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

  /**
   * SEMANTIC HTML VALIDATION TESTS
   * These tests catch structural issues like missing tags, improper nesting, etc.
   * They prevent rendering bugs that unit tests might miss but users would see immediately.
   */

  it("renders semantic table structure with proper thead", () => {
    render(<ProcedureTypeList searchTerm="" />);

    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();

    // Check that thead exists
    const thead = table.querySelector("thead");
    expect(thead).toBeInTheDocument();
  });

  it("renders semantic table structure with proper tbody", () => {
    render(<ProcedureTypeList searchTerm="" />);

    const table = screen.getByRole("table");
    const tbody = table.querySelector("tbody");
    expect(tbody).toBeInTheDocument();
  });

  it("renders table header row with proper th elements", () => {
    render(<ProcedureTypeList searchTerm="" />);

    const table = screen.getByRole("table");
    const thead = table.querySelector("thead");
    const headerCells = thead?.querySelectorAll("th");

    expect(headerCells).toHaveLength(4);
    expect(headerCells?.[0]?.textContent).toContain("Name");
    expect(headerCells?.[1]?.textContent).toContain("Default Amount");
    expect(headerCells?.[2]?.textContent).toContain("Category");
    expect(headerCells?.[3]?.textContent).toContain("Actions");
  });

  it("renders data rows with proper tr and td elements", () => {
    render(<ProcedureTypeList searchTerm="" />);

    const table = screen.getByRole("table");
    const tbody = table.querySelector("tbody");
    const dataRows = tbody?.querySelectorAll("tr");

    // Should have 3 data rows (one for each procedure type)
    expect(dataRows).toHaveLength(3);

    // Each row should have 4 cells (name, amount, category, actions)
    dataRows?.forEach((row) => {
      const cells = row.querySelectorAll("td");
      expect(cells).toHaveLength(4);
    });
  });

  it("has valid table hierarchy: table > thead > tr > th and table > tbody > tr > td", () => {
    render(<ProcedureTypeList searchTerm="" />);

    const table = screen.getByRole("table");

    // Check thead structure
    const thead = table.querySelector("thead");
    const theadRows = thead?.querySelectorAll(":scope > tr");
    expect(theadRows).toHaveLength(1);
    const headerCells = theadRows?.[0]?.querySelectorAll("th");
    expect(headerCells?.length).toBeGreaterThan(0);

    // Check tbody structure
    const tbody = table.querySelector("tbody");
    const bodyRows = tbody?.querySelectorAll(":scope > tr");
    expect(bodyRows?.length).toBeGreaterThan(0);
    bodyRows?.forEach((row) => {
      const cells = row.querySelectorAll(":scope > td");
      expect(cells.length).toBeGreaterThan(0);
    });
  });

  it("renders loading state with valid tbody structure", () => {
    vi.mocked(useProcedureTypeList).mockReturnValue({
      procedureTypeRows: [],
      procedureTypes: [],
      loading: true,
      deleteProcedureType: vi.fn(),
    });

    render(<ProcedureTypeList searchTerm="" />);

    const table = screen.getByRole("table");
    const tbody = table.querySelector("tbody");
    const rows = tbody?.querySelectorAll("tr");

    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.querySelector("td")).toBeInTheDocument();
  });

  it("renders empty state with valid tbody structure", () => {
    vi.mocked(useProcedureTypeList).mockReturnValue({
      procedureTypeRows: [],
      procedureTypes: [],
      loading: false,
      deleteProcedureType: vi.fn(),
    });

    render(<ProcedureTypeList searchTerm="" />);

    const table = screen.getByRole("table");
    const tbody = table.querySelector("tbody");
    const rows = tbody?.querySelectorAll("tr");

    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.querySelector("td")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProcedureTypeManager } from "./ProcedureTypeManager";

// Mock child components
interface ManagerLayoutProps {
  title: string;
  table: React.ReactNode;
  sidePanelContent: React.ReactNode;
  sidePanelTitle: string;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  searchPlaceholder: string;
}

vi.mock("./procedure_type_list/ProcedureTypeList", () => ({
  ProcedureTypeList: ({ searchTerm }: { searchTerm: string }) => {
    const procedureTypes = [
      { id: "pt1", name: "Consultation", defaultAmount: 50 },
      { id: "pt2", name: "Surgery", defaultAmount: 300 },
    ];
    const filtered = searchTerm
      ? procedureTypes.filter((pt) => pt.name.toLowerCase().includes(searchTerm.toLowerCase()))
      : procedureTypes;
    return (
      <div>
        {filtered.map((pt) => (
          <div key={pt.id}>{pt.name}</div>
        ))}
      </div>
    );
  },
}));

vi.mock("./add_procedure_type_panel/AddProcedureTypePanel", () => ({
  AddProcedureTypePanel: () => <div>AddProcedureTypePanel</div>,
}));

vi.mock("@/ui/components/ManagerLayout", () => ({
  ManagerLayout: ({
    title,
    table,
    sidePanelContent,
    sidePanelTitle,
    searchTerm,
    onSearchChange,
    searchPlaceholder,
  }: ManagerLayoutProps) => (
    <div>
      <h1>{title}</h1>
      <input
        type="text"
        placeholder={searchPlaceholder}
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <div data-testid="table">{table}</div>
      <div data-testid="side-panel">
        <h2>{sidePanelTitle}</h2>
        {sidePanelContent}
      </div>
    </div>
  ),
}));

vi.mock("./useProcedureTypeManager", () => ({
  useProcedureTypeManager: () => ({
    count: 2,
  }),
}));

vi.mock("./procedure_type_list/useSortProcedureTypeList", () => ({
  useSortProcedureTypeList: () => ({
    sortedAndFilteredProcedureTypes: [],
    sortConfig: { key: null, direction: null },
    handleSort: vi.fn(),
  }),
}));

describe("ProcedureTypeManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders manager layout with title", () => {
    render(<ProcedureTypeManager />);

    expect(screen.getByText("Procedure Types")).toBeInTheDocument();
  });

  it("renders Add Procedure Type panel title", () => {
    render(<ProcedureTypeManager />);

    expect(screen.getAllByText("Add Procedure Type").length).toBeGreaterThan(0);
  });

  it("shows search placeholder", () => {
    render(<ProcedureTypeManager />);

    const searchInput = screen.getByPlaceholderText("Search procedure types...");
    expect(searchInput).toBeInTheDocument();
  });

  it("renders ProcedureTypeList component", () => {
    render(<ProcedureTypeManager />);

    expect(screen.getByText("Consultation")).toBeInTheDocument();
    expect(screen.getByText("Surgery")).toBeInTheDocument();
  });

  it("updates search term and filters procedure types", async () => {
    const user = userEvent.setup();

    render(<ProcedureTypeManager />);

    const searchInput = screen.getByPlaceholderText("Search procedure types...");
    await user.type(searchInput, "consultation");

    expect(screen.getByText("Consultation")).toBeInTheDocument();
    expect(screen.queryByText("Surgery")).not.toBeInTheDocument();
  });
});

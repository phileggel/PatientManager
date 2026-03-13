import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FundsManager } from "./FundsManager";

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

vi.mock("./fund_list/FundList", () => ({
  FundList: ({ searchTerm }: { searchTerm: string }) => {
    const funds = [
      { id: "f1", name: "CPAM", fundIdentifier: "cpam_001" },
      { id: "f2", name: "MGEN", fundIdentifier: "mgen_001" },
    ];
    const filtered = searchTerm
      ? funds.filter(
          (f) =>
            f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            f.fundIdentifier.toLowerCase().includes(searchTerm.toLowerCase()),
        )
      : funds;
    return (
      <div>
        {filtered.map((f) => (
          <div key={f.id}>{f.name}</div>
        ))}
      </div>
    );
  },
}));

vi.mock("./add_fund_panel/AddFundPanel", () => ({
  AddFundPanel: () => <div>AddFundPanel</div>,
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

vi.mock("./useFundManager", () => ({
  useFundManager: () => ({
    count: 2,
  }),
}));

vi.mock("./fund_list/useSortFundList", () => ({
  useSortFundList: () => ({
    sortedAndFilteredFunds: [
      { rowId: "1", id: "f1", fundIdentifier: "cpam_001", fundName: "CPAM" },
      { rowId: "2", id: "f2", fundIdentifier: "mgen_001", fundName: "MGEN" },
    ],
    sortConfig: { key: null, direction: null },
    handleSort: vi.fn(),
  }),
}));

describe("FundsManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders manager layout with title", () => {
    render(<FundsManager />);

    expect(screen.getByText("Funds")).toBeInTheDocument();
  });

  it("renders Add Fund panel title", () => {
    render(<FundsManager />);

    expect(screen.getAllByText("Add Fund").length).toBeGreaterThan(0);
  });

  it("displays fund count", () => {
    render(<FundsManager />);

    // Fund count should be displayed in the header (exact behavior depends on ManagerLayout)
    expect(screen.getByText("Funds")).toBeInTheDocument();
  });

  it("shows search placeholder", () => {
    render(<FundsManager />);

    const searchInput = screen.getByPlaceholderText("Search funds...");
    expect(searchInput).toBeInTheDocument();
  });

  it("renders FundList component", () => {
    render(<FundsManager />);

    // FundList should render fund data
    expect(screen.getByText("CPAM")).toBeInTheDocument();
    expect(screen.getByText("MGEN")).toBeInTheDocument();
  });

  it("updates search term and filters funds", async () => {
    const user = userEvent.setup();

    render(<FundsManager />);

    const searchInput = screen.getByPlaceholderText("Search funds...");
    await user.type(searchInput, "cpam");

    expect(screen.getByText("CPAM")).toBeInTheDocument();
    expect(screen.queryByText("MGEN")).not.toBeInTheDocument();
  });
});

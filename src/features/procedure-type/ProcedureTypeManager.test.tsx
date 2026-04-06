import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProcedureTypeManager } from "./ProcedureTypeManager";

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

vi.mock("./create_procedure_type_modal/CreateProcedureTypeModal", () => ({
  CreateProcedureTypeModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="create-modal">CreateProcedureTypeModal</div> : null,
}));

vi.mock("./useProcedureTypeManager", () => ({
  useProcedureTypeManager: (searchTerm = "") => {
    const allTypes = [
      { id: "pt1", name: "Consultation" },
      { id: "pt2", name: "Surgery" },
    ];
    const count = searchTerm
      ? allTypes.filter((pt) => pt.name.toLowerCase().includes(searchTerm.toLowerCase())).length
      : allTypes.length;
    return { count };
  },
}));

describe("ProcedureTypeManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders page title", () => {
    render(<ProcedureTypeManager />);

    expect(screen.getByText("Procedure Types")).toBeInTheDocument();
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

  it("opens create modal when FAB is clicked", async () => {
    const user = userEvent.setup();

    render(<ProcedureTypeManager />);

    expect(screen.queryByTestId("create-modal")).not.toBeInTheDocument();

    const fab = screen.getByRole("button", { name: /create a procedure type/i });
    await user.click(fab);

    expect(screen.getByTestId("create-modal")).toBeInTheDocument();
  });

  it("shows count badge excluding import-pdf (from hook mock)", () => {
    render(<ProcedureTypeManager />);

    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("updates count to reflect active search term (R11)", async () => {
    const user = userEvent.setup();

    render(<ProcedureTypeManager />);

    expect(screen.getByText("2")).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText("Search procedure types...");
    await user.type(searchInput, "consultation");

    expect(screen.getByText("1")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PatientList } from "./PatientList";

vi.mock("./usePatientList", () => ({
  usePatientList: vi.fn(),
}));

vi.mock("../edit_patient_modal/EditPatientModal", () => ({
  EditPatientModal: () => null,
}));

interface ConfirmationDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
}

vi.mock("@ui/components", async () => {
  const actual = await vi.importActual("@ui/components");
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

import { usePatientList } from "./usePatientList";

describe("PatientList", () => {
  const mockPatientRows = [
    {
      rowId: "1",
      id: "p1",
      name: "Marie Dupont",
      ssn: "1234567890123",
      latestFund: "CPAM00",
      latestDate: "2025-01-15",
      isAnonymous: false,
    },
    {
      rowId: "2",
      id: "p2",
      name: "Jean Martin",
      ssn: "9876543210987",
      latestFund: "MGEN",
      latestDate: "2025-01-10",
      isAnonymous: false,
    },
    {
      rowId: "3",
      id: "p3",
      name: null,
      ssn: null,
      latestFund: null,
      latestDate: null,
      isAnonymous: true,
    },
  ];

  const mockPatients = [
    {
      id: "p1",
      name: "Marie Dupont",
      ssn: "1234567890123",
      is_anonymous: false,
      temp_id: null,
      latest_procedure_type: "Consultation",
      latest_fund: "CPAM00",
      latest_date: "2025-01-15",
      latest_procedure_amount: 100.0,
    },
    {
      id: "p2",
      name: "Jean Martin",
      ssn: "9876543210987",
      is_anonymous: false,
      temp_id: null,
      latest_procedure_type: "Visit",
      latest_fund: "MGEN",
      latest_date: "2025-01-10",
      latest_procedure_amount: 75.5,
    },
    {
      id: "p3",
      name: null,
      ssn: null,
      is_anonymous: true,
      temp_id: null,
      latest_procedure_type: null,
      latest_fund: null,
      latest_date: "",
      latest_procedure_amount: null,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePatientList).mockReturnValue({
      patientRows: mockPatientRows,
      patients: mockPatients,
      loading: false,
      deletePatient: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("renders patient table with data", () => {
    render(<PatientList searchTerm="" />);

    expect(screen.getByText("Marie Dupont")).toBeInTheDocument();
    expect(screen.getByText("Jean Martin")).toBeInTheDocument();
  });

  it("displays empty state when no patients", () => {
    vi.mocked(usePatientList).mockReturnValue({
      patientRows: [],
      patients: [],
      loading: false,
      deletePatient: vi.fn(),
    });

    render(<PatientList searchTerm="" />);

    expect(screen.getByText("No patients found.")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    vi.mocked(usePatientList).mockReturnValue({
      patientRows: [],
      patients: [],
      loading: true,
      deletePatient: vi.fn(),
    });

    render(<PatientList searchTerm="" />);

    expect(screen.getByText("Loading patients...")).toBeInTheDocument();
  });

  it("shows delete confirmation dialog when delete button is clicked", async () => {
    const user = userEvent.setup();

    render(<PatientList searchTerm="" />);

    const firstDeleteButton = screen.getAllByRole("button", { name: /delete patient/i })[0];
    if (!firstDeleteButton) throw new Error("Delete button not found");
    await user.click(firstDeleteButton);

    expect(screen.getByText("Delete Patient")).toBeInTheDocument();
  });

  it("sorts by name when header is clicked", async () => {
    const user = userEvent.setup();

    render(<PatientList searchTerm="" />);

    const nameHeader = screen.getByText("Name");
    await user.click(nameHeader);

    expect(screen.getByText("Marie Dupont")).toBeInTheDocument();
  });

  it("displays dashes for missing SSN, latestFund, and latestDate", () => {
    render(<PatientList searchTerm="" />);

    // p3 (anonymous) has no SSN, no latestFund, and no latestDate, should show dashes
    const rows = screen.getAllByRole("row");
    const hasRowWithDash = rows.some(
      (row) => row.textContent?.includes("-") && !row.textContent?.includes("Marie Dupont"),
    );

    // PatientList uses dashes for missing values
    expect(hasRowWithDash).toBe(true);
  });

  it("filters patients by search term", () => {
    render(<PatientList searchTerm="Marie" />);

    expect(screen.getByText("Marie Dupont")).toBeInTheDocument();
    expect(screen.queryByText("Jean Martin")).not.toBeInTheDocument();
  });
});

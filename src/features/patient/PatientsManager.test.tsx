import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PatientsManager } from "./PatientsManager";

// Mock the components
interface ManagerLayoutProps {
  title: string;
  table: React.ReactNode;
  sidePanelContent: React.ReactNode;
}

vi.mock("@ui/components/ManagerLayout", () => ({
  ManagerLayout: ({ title, table, sidePanelContent }: ManagerLayoutProps) => (
    <div>
      <h1>{title}</h1>
      <div data-testid="table">{table}</div>
      <div data-testid="side-panel">{sidePanelContent}</div>
    </div>
  ),
}));

interface PatientListProps {
  searchTerm: string;
  onSuccess?: (message?: string) => void;
  onError?: (message: string) => void;
}

interface AddPatientPanelProps {
  onSuccess?: (message?: string) => void;
  onError?: (message: string) => void;
}

vi.mock("./patient_list/PatientList", () => ({
  PatientList: (_: PatientListProps) => <div>PatientList</div>,
}));

vi.mock("./add_patient_panel/AddPatientPanel", () => ({
  AddPatientPanel: (_: AddPatientPanelProps) => <div>AddPatientPanel</div>,
}));

vi.mock("./usePatientOperations", () => ({
  usePatientOperations: () => ({
    patients: [
      {
        id: "p1",
        name: "Marie Dupont",
        ssn: "1234567890123",
        is_anonymous: false,
        temp_id: null,
        latest_procedure_type: null,
        latest_fund: null,
        latest_date: "",
        latest_procedure_amount: null,
      },
      {
        id: "p2",
        name: "Jean Martin",
        ssn: "9876543210987",
        is_anonymous: false,
        temp_id: null,
        latest_procedure_type: null,
        latest_fund: null,
        latest_date: "",
        latest_procedure_amount: null,
      },
    ],
    patientRows: [
      {
        rowId: "1",
        id: "p1",
        name: "Marie Dupont",
        ssn: "1234567890123",
        fund: "CPAM00",
        isAnonymous: false,
      },
      {
        rowId: "2",
        id: "p2",
        name: "Jean Martin",
        ssn: "9876543210987",
        fund: "MGEN",
        isAnonymous: false,
      },
    ],
    loading: false,
    deletePatient: vi.fn(),
  }),
}));

describe("PatientsManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders patients manager with title", () => {
    render(<PatientsManager />);

    expect(screen.getByText("Patients")).toBeInTheDocument();
  });

  it("renders patient list table", () => {
    render(<PatientsManager />);

    expect(screen.getByText("Patients")).toBeInTheDocument();
    expect(screen.getByText("PatientList")).toBeInTheDocument();
  });

  it("renders add patient side panel", () => {
    render(<PatientsManager />);

    expect(screen.getByText("AddPatientPanel")).toBeInTheDocument();
  });
});

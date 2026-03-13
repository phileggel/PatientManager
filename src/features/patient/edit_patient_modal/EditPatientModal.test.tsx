import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makePatient } from "@/tests/patient.factory";
import { EditPatientModal } from "./EditPatientModal";

vi.mock("../gateway");

vi.mock("../shared/PatientForm", () => ({
  PatientForm: ({
    formData,
    handleChange,
  }: {
    formData: { name: string; ssn: string };
    handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  }) => (
    <div>
      <input
        type="text"
        name="name"
        value={formData.name}
        onChange={handleChange}
        data-testid="form-name"
      />
      <input
        type="text"
        name="ssn"
        value={formData.ssn}
        onChange={handleChange}
        data-testid="form-ssn"
      />
    </div>
  ),
}));

vi.mock("./useEditPatientModal", () => ({
  useEditPatientModal: () => {
    const [formData, setFormData] = useState({
      name: "Marie Dupont",
      ssn: "1234567890123",
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setFormData((prev) => ({ ...prev, [name]: value }));
    };

    return {
      formData,
      errors: {},
      loading: false,
      handleChange,
      handleSubmit: vi.fn((e) => {
        e.preventDefault();
      }),
    };
  },
}));

interface DialogProps {
  isOpen: boolean;
  children: React.ReactNode;
  actions: React.ReactNode;
  title?: string;
  onClose?: () => void;
}

interface ButtonProps {
  type?: "button" | "submit" | "reset";
  onClick?: () => void;
  variant?: string;
  disabled?: boolean;
  loading?: boolean;
  children?: React.ReactNode;
}

interface TextFieldProps {
  id?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  disabled?: boolean;
}

vi.mock("@ui/components", () => ({
  Dialog: ({ isOpen, children, actions }: DialogProps) =>
    isOpen ? (
      <div role="dialog">
        <div>{children}</div>
        <div>{actions}</div>
      </div>
    ) : null,
  Button: ({ type, onClick, children, disabled }: ButtonProps) => (
    <button type={type} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  TextField: ({ id, name, value, onChange }: TextFieldProps) => (
    <input id={id} name={name} value={value} onChange={onChange} data-testid={`textfield-${id}`} />
  ),
}));

describe("EditPatientModal", () => {
  const mockPatient = makePatient({
    id: "p1",
    latest_procedure_type: "Consultation",
    latest_fund: "CPAM00",
    latest_date: "2025-01-01",
    latest_procedure_amount: 100500,
  });

  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders modal when isOpen is true", () => {
    render(<EditPatientModal patient={mockPatient} isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByDisplayValue("Marie Dupont")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1234567890123")).toBeInTheDocument();
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <EditPatientModal patient={mockPatient} isOpen={false} onClose={mockOnClose} />,
    );

    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });

  it("does not render when patient is null", () => {
    const { container } = render(
      <EditPatientModal patient={null} isOpen={true} onClose={mockOnClose} />,
    );

    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });

  it("displays latest procedure information", () => {
    render(<EditPatientModal patient={mockPatient} isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByText("Consultation")).toBeInTheDocument();
    expect(screen.getByText("€100.50")).toBeInTheDocument();
  });

  it("updates form data when user changes input", async () => {
    const user = userEvent.setup();

    render(<EditPatientModal patient={mockPatient} isOpen={true} onClose={mockOnClose} />);

    const nameInput = screen.getByDisplayValue("Marie Dupont") as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "Marie Dupont Modifiée");

    expect(nameInput.value).toBe("Marie Dupont Modifiée");
  });

  it("displays cancel and update buttons", () => {
    render(<EditPatientModal patient={mockPatient} isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcedureType } from "@/bindings";
import { EditProcedureTypeModal } from "./EditProcedureTypeModal";

vi.mock("../gateway");

vi.mock("../shared/ProcedureTypeForm", () => ({
  ProcedureTypeForm: ({
    formData,
    handleChange,
  }: {
    formData: { name: string; defaultAmount: string; category: string };
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
        name="defaultAmount"
        value={formData.defaultAmount}
        onChange={handleChange}
        data-testid="form-amount"
      />
      <input
        type="text"
        name="category"
        value={formData.category}
        onChange={handleChange}
        data-testid="form-category"
      />
    </div>
  ),
}));

vi.mock("./useEditProcedureTypeModal", () => ({
  useEditProcedureTypeModal: (procedureType: ProcedureType | null) => {
    const [formData, setFormData] = useState({
      name: procedureType?.name || "",
      defaultAmount: ((procedureType?.default_amount ?? 0) / 1000).toString(),
      category: procedureType?.category || "",
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
  TextField: ({ id, name, value, onChange, disabled }: TextFieldProps) => (
    <input
      id={id}
      name={name}
      value={value}
      onChange={onChange}
      disabled={disabled}
      data-testid={`textfield-${id}`}
    />
  ),
}));

describe("EditProcedureTypeModal", () => {
  const mockProcedureType: ProcedureType = {
    id: "pt1",
    name: "Consultation",
    default_amount: 50000,
    category: "Basic",
  };

  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders modal when isOpen is true", () => {
    render(
      <EditProcedureTypeModal
        procedureType={mockProcedureType}
        isOpen={true}
        onClose={mockOnClose}
      />,
    );

    expect(screen.getByDisplayValue("Consultation")).toBeInTheDocument();
    expect(screen.getByDisplayValue("50")).toBeInTheDocument();
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <EditProcedureTypeModal
        procedureType={mockProcedureType}
        isOpen={false}
        onClose={mockOnClose}
      />,
    );

    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });

  it("does not render when procedureType is null", () => {
    const { container } = render(
      <EditProcedureTypeModal procedureType={null} isOpen={true} onClose={mockOnClose} />,
    );

    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });

  it("updates form data when user changes input", async () => {
    const user = userEvent.setup();

    render(
      <EditProcedureTypeModal
        procedureType={mockProcedureType}
        isOpen={true}
        onClose={mockOnClose}
      />,
    );

    const nameInput = screen.getByDisplayValue("Consultation") as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "Advanced Consultation");

    expect(nameInput.value).toBe("Advanced Consultation");
  });

  it("displays cancel and update buttons", () => {
    render(
      <EditProcedureTypeModal
        procedureType={mockProcedureType}
        isOpen={true}
        onClose={mockOnClose}
      />,
    );

    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
  });

  it("populates form with procedure type data", () => {
    render(
      <EditProcedureTypeModal
        procedureType={mockProcedureType}
        isOpen={true}
        onClose={mockOnClose}
      />,
    );

    expect(screen.getByDisplayValue("Consultation")).toBeInTheDocument();
    expect(screen.getByDisplayValue("50")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Basic")).toBeInTheDocument();
  });

  it("handles procedure type without category", () => {
    const procedureTypeNoCategory: ProcedureType = {
      id: "pt2",
      name: "Surgery",
      default_amount: 300000,
      category: null,
    };

    render(
      <EditProcedureTypeModal
        procedureType={procedureTypeNoCategory}
        isOpen={true}
        onClose={mockOnClose}
      />,
    );

    expect(screen.getByDisplayValue("Surgery")).toBeInTheDocument();
    expect(screen.getByDisplayValue("300")).toBeInTheDocument();
  });
});

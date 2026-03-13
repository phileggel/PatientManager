import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AffiliatedFund } from "@/bindings";
import { EditFundModal } from "./EditFundModal";

vi.mock("../shared/FundForm", () => ({
  FundForm: ({
    formData,
    handleChange,
  }: {
    formData: { fund_identifier: string; name: string };
    handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  }) => (
    <div>
      <input
        type="text"
        name="fund_identifier"
        value={formData.fund_identifier}
        onChange={handleChange}
        data-testid="form-identifier"
      />
      <input
        type="text"
        name="name"
        value={formData.name}
        onChange={handleChange}
        data-testid="form-name"
      />
    </div>
  ),
}));

vi.mock("./useEditFundModal", () => ({
  useEditFundModal: (fund: AffiliatedFund | null) => {
    const [formData, setFormData] = useState({
      fund_identifier: fund?.fund_identifier || "",
      name: fund?.name || "",
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

vi.mock("@/ui/components", () => ({
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
}));

describe("EditFundModal", () => {
  const mockFund: AffiliatedFund = {
    id: "f1",
    fund_identifier: "CPAM-001",
    name: "CPAM",
    temp_id: null,
  };

  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders dialog when isOpen is true and fund is present", () => {
    const { container } = render(
      <EditFundModal fund={mockFund} isOpen={true} onClose={mockOnClose} />,
    );

    expect(container.querySelector('[role="dialog"]')).toBeInTheDocument();
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <EditFundModal fund={mockFund} isOpen={false} onClose={mockOnClose} />,
    );

    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });

  it("does not render when fund is null", () => {
    const { container } = render(<EditFundModal fund={null} isOpen={true} onClose={mockOnClose} />);

    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });

  it("populates form with fund data", () => {
    render(<EditFundModal fund={mockFund} isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByDisplayValue("CPAM-001")).toBeInTheDocument();
    expect(screen.getByDisplayValue("CPAM")).toBeInTheDocument();
  });

  it("displays Cancel and Update buttons", () => {
    render(<EditFundModal fund={mockFund} isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
  });

  it("updates form data when user changes input", async () => {
    const user = userEvent.setup();

    render(<EditFundModal fund={mockFund} isOpen={true} onClose={mockOnClose} />);

    const identifierInput = screen.getByDisplayValue("CPAM-001") as HTMLInputElement;
    await user.clear(identifierInput);
    await user.type(identifierInput, "NEW-001");

    expect(identifierInput.value).toBe("NEW-001");
  });
});

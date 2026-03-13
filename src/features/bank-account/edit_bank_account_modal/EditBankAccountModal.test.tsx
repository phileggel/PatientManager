import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BankAccount } from "@/bindings";
import { EditBankAccountModal } from "./EditBankAccountModal";

vi.mock("@/core/snackbar", () => ({
  useSnackbar: () => ({
    showSnackbar: vi.fn(),
  }),
}));

vi.mock("../gateway");

vi.mock("../shared/BankAccountForm", () => ({
  BankAccountForm: ({
    formData,
    handleChange,
  }: {
    formData: { name: string; iban: string };
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
        name="iban"
        value={formData.iban}
        onChange={handleChange}
        data-testid="form-iban"
      />
    </div>
  ),
}));

vi.mock("./useEditBankAccountModal", () => ({
  useEditBankAccountModal: () => {
    const [formData, setFormData] = useState({ name: "Main Account", iban: "FR7612345" });

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
}));

describe("EditBankAccountModal", () => {
  const mockBankAccount: BankAccount = {
    id: "acc-123",
    name: "Main Account",
    iban: "FR7612345",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders modal when bankAccount is provided", () => {
    render(<EditBankAccountModal bankAccount={mockBankAccount} onClose={vi.fn()} />);

    expect(screen.getByText("Update Bank Account")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Main Account")).toBeInTheDocument();
    expect(screen.getByDisplayValue("FR7612345")).toBeInTheDocument();
  });

  it("does not render when bankAccount is null", () => {
    const { container } = render(<EditBankAccountModal bankAccount={null} onClose={vi.fn()} />);

    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });

  it("updates form data when user changes input", async () => {
    const user = userEvent.setup();

    render(<EditBankAccountModal bankAccount={mockBankAccount} onClose={vi.fn()} />);

    const nameInput = screen.getByDisplayValue("Main Account") as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "Secondary Account");

    const ibanInput = screen.getByDisplayValue("FR7612345") as HTMLInputElement;
    await user.clear(ibanInput);
    await user.type(ibanInput, "FR9999999");

    expect(nameInput.value).toBe("Secondary Account");
    expect(ibanInput.value).toBe("FR9999999");
  });

  it("displays cancel and update buttons", () => {
    render(<EditBankAccountModal bankAccount={mockBankAccount} onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
  });

  it("calls onClose when cancel button clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<EditBankAccountModal bankAccount={mockBankAccount} onClose={onClose} />);

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    await user.click(cancelButton);

    expect(onClose).toHaveBeenCalled();
  });
});

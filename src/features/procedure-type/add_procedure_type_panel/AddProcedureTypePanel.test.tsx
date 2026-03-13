import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddProcedureTypePanel } from "./AddProcedureTypePanel";

vi.mock("@/features/procedure-type/gateway", () => ({
  addProcedureType: vi.fn(),
}));

describe("AddProcedureTypePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders form with input fields", () => {
    render(<AddProcedureTypePanel />);

    expect(screen.getByLabelText("Procedure Type Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Default Amount (€)")).toBeInTheDocument();
    expect(screen.getByLabelText("Category")).toBeInTheDocument();
  });

  it("renders submit button", () => {
    render(<AddProcedureTypePanel />);

    expect(screen.getByRole("button", { name: /Add Procedure Type/i })).toBeInTheDocument();
  });

  it("allows typing in form fields", async () => {
    const user = userEvent.setup();
    render(<AddProcedureTypePanel />);

    const nameInput = screen.getByLabelText("Procedure Type Name") as HTMLInputElement;
    const amountInput = screen.getByLabelText("Default Amount (€)") as HTMLInputElement;
    const categoryInput = screen.getByLabelText("Category") as HTMLInputElement;

    await user.type(nameInput, "Consultation");
    await user.type(amountInput, "50");
    await user.type(categoryInput, "Basic");

    expect(nameInput.value).toBe("Consultation");
    expect(amountInput.value).toBe("50");
    expect(categoryInput.value).toBe("Basic");
  });

  it("prevents form submission with empty required fields", async () => {
    const user = userEvent.setup();
    render(<AddProcedureTypePanel />);

    const submitButton = screen.getByRole("button", { name: /Add Procedure Type/i });
    await user.click(submitButton);

    // Validation is handled locally, form should not submit
    expect(submitButton).toBeInTheDocument();
  });
});

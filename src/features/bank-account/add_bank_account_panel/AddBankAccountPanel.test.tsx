import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as gateway from "../gateway";
import { AddBankAccountPanel } from "./AddBankAccountPanel";

vi.mock("@/core/snackbar", () => ({
  useSnackbar: () => ({
    showSnackbar: vi.fn(),
  }),
}));

vi.mock("../gateway");

describe("AddBankAccountPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders form with account name and IBAN fields", () => {
    render(<AddBankAccountPanel />);

    expect(screen.getByLabelText("Account Name")).toBeInTheDocument();
    expect(screen.getByLabelText("IBAN")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create Bank Account/i })).toBeInTheDocument();
  });

  it("displays validation error when name is empty on submit", async () => {
    const user = userEvent.setup();

    render(<AddBankAccountPanel />);

    const submitButton = screen.getByRole("button", { name: /Create Bank Account/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Bank account name is required")).toBeInTheDocument();
    });
  });

  it("submits form with account name and IBAN", async () => {
    const user = userEvent.setup();

    vi.mocked(gateway.createBankAccount).mockResolvedValue({
      success: true,
      data: {
        id: "acc-123",
        name: "Main Bank Account",
        iban: "FR7612345",
      },
    });

    render(<AddBankAccountPanel />);

    const nameInput = screen.getByLabelText("Account Name");
    await user.type(nameInput, "Main Bank Account");

    const ibanInput = screen.getByLabelText("IBAN");
    await user.type(ibanInput, "FR7612345");

    const submitButton = screen.getByRole("button", { name: /Create Bank Account/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(gateway.createBankAccount).toHaveBeenCalledWith("Main Bank Account", "FR7612345");
    });
  });

  it("clears form after successful submission", async () => {
    const user = userEvent.setup();

    vi.mocked(gateway.createBankAccount).mockResolvedValue({
      success: true,
      data: {
        id: "acc-123",
        name: "Main Bank Account",
        iban: "DE89370400440532013000",
      },
    });

    render(<AddBankAccountPanel />);

    const nameInput = screen.getByLabelText("Account Name") as HTMLInputElement;
    await user.type(nameInput, "Main Bank Account");

    const submitButton = screen.getByRole("button", { name: /Create Bank Account/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(nameInput.value).toBe("");
    });
  });

  it("displays error message on submission failure", async () => {
    const user = userEvent.setup();

    vi.mocked(gateway.createBankAccount).mockResolvedValue({
      success: false,
      error: "Account name already exists",
    });

    render(<AddBankAccountPanel />);

    const nameInput = screen.getByLabelText("Account Name");
    await user.type(nameInput, "Duplicate Account");

    const submitButton = screen.getByRole("button", { name: /Create Bank Account/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Account name already exists")).toBeInTheDocument();
    });
  });

  it("submits on Enter key", async () => {
    const user = userEvent.setup();

    vi.mocked(gateway.createBankAccount).mockResolvedValue({
      success: true,
      data: {
        id: "acc-123",
        name: "Quick Account",
        iban: "DE89370400440532013000",
      },
    });

    render(<AddBankAccountPanel />);

    const nameInput = screen.getByLabelText("Account Name");
    await user.type(nameInput, "Quick Account");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(gateway.createBankAccount).toHaveBeenCalledWith("Quick Account", null);
    });
  });

  it("disables submit button when loading", async () => {
    const user = userEvent.setup();

    vi.mocked(gateway.createBankAccount).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                success: true,
                data: { id: "acc-123", name: "Test", iban: "DE89370400440532013000" },
              }),
            1000,
          ),
        ),
    );

    render(<AddBankAccountPanel />);

    const nameInput = screen.getByLabelText("Account Name");
    await user.type(nameInput, "Test Account");

    const submitButton = screen.getByRole("button", { name: /Create Bank Account/i });
    await user.click(submitButton);

    expect(submitButton).toBeDisabled();
  });
});

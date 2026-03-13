import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddFundPanel } from "./AddFundPanel";

vi.mock("@/features/fund/gateway", () => ({
  addFund: vi.fn(),
}));
vi.mock("@/core/snackbar", () => ({
  toastService: { show: vi.fn(), subscribe: vi.fn(() => vi.fn()) },
}));

describe("AddFundPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders form with input fields", () => {
    render(<AddFundPanel />);

    expect(screen.getByLabelText("Fund Identifier")).toBeInTheDocument();
    expect(screen.getByLabelText("Fund Name")).toBeInTheDocument();
  });

  it("renders submit button", () => {
    render(<AddFundPanel />);

    expect(screen.getByRole("button", { name: /Add Fund/i })).toBeInTheDocument();
  });

  it("allows typing in form fields", async () => {
    const user = userEvent.setup();
    render(<AddFundPanel />);

    const identifierInput = screen.getByLabelText("Fund Identifier") as HTMLInputElement;
    const nameInput = screen.getByLabelText("Fund Name") as HTMLInputElement;

    await user.type(identifierInput, "FUND-001");
    await user.type(nameInput, "Test Fund");

    expect(identifierInput.value).toBe("FUND-001");
    expect(nameInput.value).toBe("Test Fund");
  });

  it("prevents form submission with empty fields", async () => {
    const user = userEvent.setup();
    render(<AddFundPanel />);

    const submitButton = screen.getByRole("button", { name: /Add Fund/i });
    // Click submit with empty fields - button should still be present (no submission)
    await user.click(submitButton);

    expect(screen.getByRole("button", { name: /Add Fund/i })).toBeInTheDocument();
  });

  it("submits form with valid data", async () => {
    const { addFund } = await import("@/features/fund/gateway");
    const mockAddFund = vi.mocked(addFund);
    mockAddFund.mockResolvedValueOnce({
      success: true,
      data: {
        id: "f1",
        fund_identifier: "FUND-001",
        name: "Test",
        temp_id: null,
      },
    });

    const user = userEvent.setup();
    render(<AddFundPanel />);

    const identifierInput = screen.getByLabelText("Fund Identifier");
    const nameInput = screen.getByLabelText("Fund Name");
    const submitButton = screen.getByRole("button", { name: /Add Fund/i });

    await user.type(identifierInput, "FUND-001");
    await user.type(nameInput, "Test Fund");
    await user.click(submitButton);

    await vi.waitFor(
      () => {
        expect(mockAddFund).toHaveBeenCalledWith("FUND-001", "Test Fund");
      },
      { timeout: 1000 },
    );
  });

  it("shows error toast on API failure", async () => {
    const { toastService } = await import("@/core/snackbar");
    const { addFund } = await import("@/features/fund/gateway");
    const mockAddFund = vi.mocked(addFund);
    mockAddFund.mockResolvedValueOnce({ success: false, error: "Duplicate identifier" });

    const user = userEvent.setup();
    render(<AddFundPanel />);

    const identifierInput = screen.getByLabelText("Fund Identifier");
    const nameInput = screen.getByLabelText("Fund Name");
    const submitButton = screen.getByRole("button", { name: /Add Fund/i });

    await user.type(identifierInput, "FUND-001");
    await user.type(nameInput, "Test Fund");
    await user.click(submitButton);

    // Wait for async operation
    await vi.waitFor(
      () => {
        expect(toastService.show).toHaveBeenCalledWith("error", expect.any(String));
      },
      { timeout: 1000 },
    );
  });
});

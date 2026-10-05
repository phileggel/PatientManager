import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as gateway from "../gateway";
import { AddPatientPanel } from "./AddPatientPanel";

vi.mock("../gateway");

describe("AddPatientPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders form with required fields", () => {
    render(<AddPatientPanel />);

    expect(screen.getByLabelText("Patient Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Social Security Number")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add Patient/i })).toBeInTheDocument();
  });

  it("shows the backend's refusal of an empty name under the name field", async () => {
    const user = userEvent.setup();
    vi.mocked(gateway.addPatient).mockResolvedValue({
      success: false,
      error: { code: "NonAnonymousRequiresName" },
    });

    render(<AddPatientPanel />);

    await user.click(screen.getByRole("button", { name: /Add Patient/i }));

    expect(await screen.findByText("Patient name is required")).toBeInTheDocument();
  });

  it("submits form with name only", async () => {
    const { toastService } = await import("@/ui/components/snackbar");
    const user = userEvent.setup();

    vi.mocked(gateway.addPatient).mockResolvedValue({
      success: true,
      data: {
        id: "p1",
        name: "Marie Dupont",
        ssn: null,
        is_anonymous: false,
        temp_id: null,
        latest_procedure_type: null,
        latest_fund: null,
        latest_date: "",
        latest_procedure_amount: null,
      },
    });

    render(<AddPatientPanel />);

    const nameInput = screen.getByLabelText("Patient Name");
    await user.type(nameInput, "Marie Dupont");

    const submitButton = screen.getByRole("button", { name: /Add Patient/i });
    await user.click(submitButton);

    await waitFor(
      () => {
        expect(gateway.addPatient).toHaveBeenCalledWith("Marie Dupont", "");
        expect(toastService.show).toHaveBeenCalledWith("success", expect.any(String));
      },
      { timeout: 1000 },
    );
  });

  it("clears form after successful submission", async () => {
    const user = userEvent.setup();

    vi.mocked(gateway.addPatient).mockResolvedValue({
      success: true,
      data: {
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
    });

    render(<AddPatientPanel />);

    const nameInput = screen.getByLabelText("Patient Name") as HTMLInputElement;
    const ssnInput = screen.getByLabelText("Social Security Number") as HTMLInputElement;

    await user.type(nameInput, "Marie Dupont");
    await user.type(ssnInput, "1234567890123");

    const submitButton = screen.getByRole("button", { name: /Add Patient/i });
    await user.click(submitButton);

    await waitFor(
      () => {
        expect(nameInput.value).toBe("");
        expect(ssnInput.value).toBe("");
      },
      { timeout: 1000 },
    );
  });
});

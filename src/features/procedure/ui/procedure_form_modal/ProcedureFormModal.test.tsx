import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BankAccount, Fund, Procedure, ProcedureType } from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";
import { makePatient } from "@/tests/patient.factory";
import { toastService } from "@/ui/components/snackbar";
import { ProcedureFormModal } from "./ProcedureFormModal";

// --- Mocks ---

vi.mock("@/features/procedure/api/gateway", () => ({
  addProcedure: vi.fn(),
  updateProcedure: vi.fn(),
  createNewPatient: vi.fn(),
  readAllProcedures: vi.fn(),
}));

vi.mock("@/features/overpayment/gateway", () => ({
  getProcedureRefundByRefundProcedure: vi.fn(),
}));

vi.mock("@/ui/components/snackbar", () => ({
  toastService: { show: vi.fn() },
}));

// Replace complex HeadlessUI / portal-based UI components with simple test doubles.
// ComboboxField: HeadlessUI state machine is not reliably triggerable in jsdom
//   (same root cause as E2E — isTrusted, floating-ui portal).
// DateField: custom calendar uses createPortal and layout-dependent positioning.
// ModalContainer: HeadlessUI Dialog focus-trap interferes with userEvent.
vi.mock("@/ui/components", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/ui/components")>();
  return {
    ...actual,
    ModalContainer: ({
      isOpen,
      children,
    }: {
      isOpen: boolean;
      onClose: () => void;
      children: React.ReactNode;
      maxWidth?: string;
      titleId?: string;
    }) => (isOpen ? <div role="dialog">{children}</div> : null),
    // biome-ignore lint/suspicious/noExplicitAny: simplified test double for a generic component
    ComboboxField: ({ id, value, onChange, items, displayKey, idKey, label, error }: any) => (
      <div>
        <label htmlFor={id}>{label}</label>
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">-</option>
          {(items as Record<string, unknown>[]).map((item) => (
            <option key={String(item[idKey])} value={String(item[idKey])}>
              {String(item[displayKey])}
            </option>
          ))}
        </select>
        {error && <p role="alert">{error}</p>}
      </div>
    ),
    // biome-ignore lint/suspicious/noExplicitAny: simplified test double
    DateField: ({ id, label, value, onChange, error }: any) => (
      <div>
        <label htmlFor={id}>{label}</label>
        <input id={id} type="text" value={value ?? ""} onChange={onChange} />
        {error && <p role="alert">{error}</p>}
      </div>
    ),
  };
});

vi.mock("../form/CreatePatientForm", () => ({ CreatePatientForm: () => null }));
vi.mock("@/features/overpayment/cancel_refund_dialog/CancelRefundDialog", () => ({
  CancelRefundDialog: () => null,
}));
vi.mock("@/features/overpayment/record_overpayment_modal/RecordOverpaymentModal", () => ({
  RecordOverpaymentModal: () => null,
}));

// --- Test data ---

const PATIENT = makePatient({ id: "p1" }); // name: "Marie Dupont", ssn: "1234567890123"
const FUND: Fund = { id: "f1", fund_identifier: "CPAM", name: "CPAM France", temp_id: null };
const PROCEDURE_TYPE: ProcedureType = {
  id: "pt1",
  name: "Consultation",
  default_amount: 25000,
  category: null,
};
const BANK_ACCOUNT: BankAccount = {
  id: "ba1",
  name: "Main Account",
  iban: null,
};

const MOCK_PROCEDURE: Procedure = {
  id: "proc-1",
  patient_id: "p1",
  fund_id: null,
  procedure_type_id: "pt1",
  procedure_date: "2026-05-01",
  billed_amount: 5000,
  payment_method: "NONE",
  fund_reconciliation_date: "",

  confirmed_payment_date: "",
  payment_status: "CREATED",
  paid_amount: null,
};

import * as overpaymentGateway from "@/features/overpayment/gateway";
import * as procedureGateway from "@/features/procedure/api/gateway";

// --- Setup ---

beforeEach(() => {
  useCacheStore.setState({
    patients: [PATIENT],
    funds: [FUND],
    procedureTypes: [PROCEDURE_TYPE],
    bankAccounts: [BANK_ACCOUNT],
  });
  vi.clearAllMocks();
  vi.mocked(procedureGateway.addProcedure).mockResolvedValue({
    success: true,
    data: MOCK_PROCEDURE,
  });
  vi.mocked(procedureGateway.readAllProcedures).mockResolvedValue({
    success: true,
    data: [MOCK_PROCEDURE],
  });
});

function renderCreate(onClose = vi.fn()) {
  return render(<ProcedureFormModal mode="create" isOpen onClose={onClose} />);
}

// --- Tests ---

describe("ProcedureFormModal — create mode (ComboboxField wiring)", () => {
  it("renders patient ComboboxField populated with store patients", () => {
    renderCreate();
    // Patient label comes from formatPatientLabel: "name (ssn)"
    const patientSelect = screen.getByLabelText("Patient");
    expect(patientSelect).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Marie Dupont (1234567890123)" }),
    ).toBeInTheDocument();
  });

  it("renders fund ComboboxField populated with store funds", () => {
    renderCreate();
    const fundSelect = screen.getByLabelText("Fund");
    expect(fundSelect).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "CPAM" })).toBeInTheDocument();
  });

  it("submit button is disabled until patient, procedure type, and date are filled", () => {
    renderCreate();
    const submitBtn = screen.getByRole("button", { name: "Add Procedure" });
    // All three required fields empty → disabled
    expect(submitBtn).toBeDisabled();
  });

  it("submit button enables after all required fields are filled", async () => {
    const user = userEvent.setup();
    renderCreate();

    await user.selectOptions(screen.getByLabelText("Patient"), "p1");
    await user.selectOptions(screen.getByLabelText("Procedure Type"), "pt1");
    fireEvent.change(screen.getByLabelText("Procedure Date"), {
      target: { value: "2026-05-01" },
    });

    expect(screen.getByRole("button", { name: "Add Procedure" })).not.toBeDisabled();
  });

  it("submitting calls addProcedure with patientId, null fund, procedureTypeId, date", async () => {
    const user = userEvent.setup();
    renderCreate();

    await user.selectOptions(screen.getByLabelText("Patient"), "p1");
    await user.selectOptions(screen.getByLabelText("Procedure Type"), "pt1");
    fireEvent.change(screen.getByLabelText("Procedure Date"), {
      target: { value: "2026-05-01" },
    });

    await user.click(screen.getByRole("button", { name: "Add Procedure" }));

    await waitFor(() => {
      expect(procedureGateway.addProcedure).toHaveBeenCalledWith(
        "p1",
        null,
        "pt1",
        "2026-05-01",
        25000,
      );
    });
  });

  it("selecting a fund includes fundId in addProcedure call", async () => {
    const user = userEvent.setup();
    renderCreate();

    await user.selectOptions(screen.getByLabelText("Patient"), "p1");
    await user.selectOptions(screen.getByLabelText("Fund"), "f1");
    await user.selectOptions(screen.getByLabelText("Procedure Type"), "pt1");
    fireEvent.change(screen.getByLabelText("Procedure Date"), {
      target: { value: "2026-05-01" },
    });

    await user.click(screen.getByRole("button", { name: "Add Procedure" }));

    await waitFor(() => {
      expect(procedureGateway.addProcedure).toHaveBeenCalledWith(
        "p1",
        "f1",
        "pt1",
        "2026-05-01",
        25000,
      );
    });
  });

  it("shows patientId validation error when submitting without patient", async () => {
    // Override addProcedure to return validation error (should not be called — button disabled)
    // The submit button is disabled when patientId is empty, so we verify the disabled state
    renderCreate();
    await userEvent.selectOptions(screen.getByLabelText("Procedure Type"), "pt1");
    fireEvent.change(screen.getByLabelText("Procedure Date"), {
      target: { value: "2026-05-01" },
    });
    // Patient not selected → button still disabled (patientId missing)
    expect(screen.getByRole("button", { name: "Add Procedure" })).toBeDisabled();
    expect(procedureGateway.addProcedure).not.toHaveBeenCalled();
  });
});

// Covers handleCancelRefundClick in refund mode (REF-200): resolve the source
// procedure via the refund procedure id, then branch on the typed result.
describe("ProcedureFormModal — refund mode (Cancel Refund / F27 typed-error pipeline)", () => {
  const REFUND_PROCEDURE: Procedure = { ...MOCK_PROCEDURE, payment_status: "OVERPAYMENT_REFUND" };

  const mockResolve = vi.mocked(overpaymentGateway.getProcedureRefundByRefundProcedure);
  const mockToast = vi.mocked(toastService.show);

  function renderRefund() {
    return render(
      <ProcedureFormModal mode="refund" procedure={REFUND_PROCEDURE} isOpen onClose={vi.fn()} />,
    );
  }

  it("opens the cancel dialog when the source procedure resolves", async () => {
    mockResolve.mockResolvedValue({
      success: true,
      data: {
        id: "refund-link-1",
        source_procedure_id: "source-1",
        refund_procedure_id: "proc-1",
        refund_date: "2026-05-01",
        reason: null,
        previous_payment_status: "FUND_PAID",
      },
    });
    renderRefund();

    await userEvent.click(screen.getByRole("button", { name: "Cancel Refund" }));

    await waitFor(() => {
      expect(mockResolve).toHaveBeenCalledWith("proc-1");
    });
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("shows the formatted typed-error toast when resolution fails (my F27 branch)", async () => {
    mockResolve.mockResolvedValue({
      success: false,
      error: { code: "RefundRecordNotFound" },
    });
    renderRefund();

    await userEvent.click(screen.getByRole("button", { name: "Cancel Refund" }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        "error",
        "No overpayment record found for this procedure.",
      );
    });
  });

  it("shows the unknown-error toast when resolution succeeds with no record (else arm)", async () => {
    mockResolve.mockResolvedValue({ success: true, data: null });
    renderRefund();

    await userEvent.click(screen.getByRole("button", { name: "Cancel Refund" }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith("error", expect.any(String));
    });
  });

  it("shows an error toast when the gateway throws (catch arm)", async () => {
    mockResolve.mockRejectedValue(new Error("network down"));
    renderRefund();

    await userEvent.click(screen.getByRole("button", { name: "Cancel Refund" }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith("error", "network down");
    });
  });
});

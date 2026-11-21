import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { BankEntryFormModal } from "./BankEntryFormModal";

// The selection lists read the backend; their own tests cover them.
vi.mock("../select_items_panel/SelectProceduresPanel", () => ({
  SelectProceduresPanel: () => <div data-testid="procedures-panel" />,
}));
vi.mock("../select_items_panel/SelectFundGroupsPanel", () => ({
  SelectFundGroupsPanel: () => <div data-testid="groups-panel" />,
}));

type Props = ComponentProps<typeof BankEntryFormModal>;

function renderWindow(overrides: Partial<Props> = {}) {
  const props: Props = {
    id: "direct-payment-add",
    kind: "direct",
    mode: "add",
    isOpen: true,
    onClose: vi.fn(),
    isDirty: false,
    transferDate: "2026-11-17",
    onDateChange: vi.fn(),
    transferType: "PATIENT_CHECK",
    onTypeChange: vi.fn(),
    bankAccount: "",
    bankAccountOptions: [{ value: "acc-1", label: "Compte courant" }],
    onBankAccountChange: vi.fn(),
    selectedGroupIds: [],
    selectedProcedureIds: [],
    onGroupsChange: vi.fn(),
    onProceduresChange: vi.fn(),
    totalAmountMillis: 0,
    fieldErrors: {},
    submitting: false,
    onSubmit: vi.fn((e) => e.preventDefault()),
    ...overrides,
  };
  render(<BankEntryFormModal {...props} />);
  return props;
}

describe("BankEntryFormModal (#642)", () => {
  it("keeps its button off and bare while nothing is ticked", () => {
    renderWindow();

    const submit = document.getElementById("direct-payment-add-submit");
    expect(submit).toBeDisabled();
    expect(submit).toHaveTextContent(/^Record payment$/);
  });

  it("names the amount in its button once something is ticked", () => {
    renderWindow({ selectedProcedureIds: ["p-1"], totalAmountMillis: 60000 });

    const submit = document.getElementById("direct-payment-add-submit");
    expect(submit).toBeEnabled();
    expect(submit).toHaveTextContent(/^Record payment of .*60/);
  });

  it("edits with the same window: its title, its button, a fixed method (R4)", () => {
    renderWindow({
      id: "direct-payment-edit",
      mode: "edit",
      onTypeChange: undefined,
      selectedProcedureIds: ["p-1", "p-2"],
      totalAmountMillis: 90000,
    });

    expect(screen.getByRole("heading", { name: "Edit payment" })).toBeInTheDocument();
    expect(document.getElementById("direct-payment-edit-submit")).toHaveTextContent(
      /^Update payment of .*90/,
    );
    expect(document.getElementById("direct-payment-edit-method")).toBeDisabled();
  });

  it("asks a fund wire's account at creation and only shows it when editing (BSM-033)", () => {
    renderWindow({ id: "fund-wire-add", kind: "fund", transferType: "FUND_WIRE" });
    expect(document.getElementById("fund-wire-add-account")).toBeEnabled();
    expect(screen.getByTestId("groups-panel")).toBeInTheDocument();
  });

  it("shows a fund wire's account, never changed, when editing", () => {
    renderWindow({
      id: "fund-wire-edit",
      kind: "fund",
      mode: "edit",
      transferType: "FUND_WIRE",
      bankAccount: "acc-1",
      onBankAccountChange: undefined,
    });
    expect(document.getElementById("fund-wire-edit-account")).toBeDisabled();
  });

  it("closes at once when nothing was entered", async () => {
    const props = renderWindow();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(props.onClose).toHaveBeenCalledOnce();
    expect(document.getElementById("direct-payment-add-abandon-confirmation")).toBeNull();
  });

  it("asks before losing an entry; « Keep editing » keeps it, « Discard » closes", async () => {
    const props = renderWindow({ isDirty: true });

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Discard this payment?")).toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(props.onClose).not.toHaveBeenCalled();

    await userEvent.click(document.getElementById("direct-payment-add-close") as HTMLElement);
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("shows a refused date under its field (BSM-023)", () => {
    renderWindow({ fieldErrors: { transferDate: "transfer.validate.date_required" } });

    expect(screen.getByText("Transfer date is required")).toBeInTheDocument();
  });

  it("asks no account for a direct payment (R13)", () => {
    renderWindow();

    expect(document.getElementById("direct-payment-add-account")).toBeNull();
  });
});

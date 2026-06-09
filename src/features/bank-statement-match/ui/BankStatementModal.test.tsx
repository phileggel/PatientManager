/**
 * Component RTL test for BankStatementModal — happy path only (BAS-011..014).
 *
 * Renders the real modal, mocks the local `./gateway` boundary, and exercises
 * the actual DOM: typing into the name field, submitting via the form button,
 * and verifying the create-account step gives way to the label-mapping step.
 *
 * Hook-level state-machine tests live in useBankStatementModal.test.ts; this
 * file complements them with rendering + DOM-event coverage and replaces the
 * E2E test that would need a native file-picker workaround.
 */

import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeBankAccount } from "@/tests/bank.factory";

vi.mock("../gateway", () => ({
  parseBankStatement: vi.fn(),
  resolveBankAccountFromIban: vi.fn(),
  resolveBankFundLabels: vi.fn(),
  saveBankFundLabelMappings: vi.fn(),
  matchBankStatementLines: vi.fn(),
  createBankTransfersFromStatement: vi.fn(),
  getBankStatementReconciliationConfig: vi.fn(),
  createBankAccount: vi.fn(),
}));

import * as gateway from "../gateway";
import { BankStatementModal } from "./BankStatementModal";

const mockParse = vi.mocked(gateway.parseBankStatement);
const mockResolveAccount = vi.mocked(gateway.resolveBankAccountFromIban);
const mockResolveLabels = vi.mocked(gateway.resolveBankFundLabels);
const mockGetConfig = vi.mocked(gateway.getBankStatementReconciliationConfig);
const mockCreateBankAccount = vi.mocked(gateway.createBankAccount);

const FILE_PATH = "/tmp/statement.pdf";
const PARSE_RESULT = {
  iban: "FR7612345678901234567890189",
  period: "du 01/04/2026 au 30/04/2026",
  credit_lines: [{ date: "2026-04-10", label: "CPAM75", amount: 150000 }],
  total_credits: 150000,
  unparsed_count: 0,
};

describe("BankStatementModal — inline create-account happy path (BAS-011..014)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfig.mockResolvedValue({ max_date_offset_days: 6 });
    mockParse.mockResolvedValue({ success: true, data: PARSE_RESULT });
    mockResolveAccount.mockResolvedValue({ success: true, data: null });
    mockResolveLabels.mockResolvedValue({ success: true, data: [] });
  });

  it("creates the missing account inline then advances to label-mapping", async () => {
    const user = userEvent.setup();
    const newAccount = makeBankAccount({
      id: "acc-new-1",
      name: "Cabinet principal",
      iban: PARSE_RESULT.iban,
    });
    mockCreateBankAccount.mockResolvedValue({ success: true, data: newAccount });

    render(<BankStatementModal filePath={FILE_PATH} onClose={() => {}} />);

    // The form must render with the parsed IBAN pre-filled (read-only).
    // Selectors use stable HTML attributes — id, type, form — so the test does
    // not depend on i18n labels and stays stable across locale changes.
    await waitFor(() => {
      expect(document.getElementById("create-account-form")).not.toBeNull();
    });

    const ibanInput = document.getElementById("create-account-iban") as HTMLInputElement | null;
    expect(ibanInput).not.toBeNull();
    expect(ibanInput?.value).toBe(PARSE_RESULT.iban);
    expect(ibanInput?.disabled).toBe(true);

    // Type the account name and submit through the real DOM.
    const nameInput = document.getElementById("create-account-name") as HTMLInputElement | null;
    expect(nameInput).not.toBeNull();
    if (!nameInput) throw new Error("name input missing");
    await user.type(nameInput, "Cabinet principal");

    const submitButton = document.querySelector(
      'button[type="submit"][form="create-account-form"]',
    ) as HTMLButtonElement | null;
    expect(submitButton).not.toBeNull();
    if (!submitButton) throw new Error("submit button missing");
    await user.click(submitButton);

    // Gateway called with the typed name and the pre-filled IBAN.
    expect(mockCreateBankAccount).toHaveBeenCalledWith("Cabinet principal", PARSE_RESULT.iban);

    // After success, label-mapping is requested for the new account and the
    // create-account form is no longer in the DOM.
    await waitFor(() => {
      expect(mockResolveLabels).toHaveBeenCalledWith(newAccount.id, ["CPAM75"]);
    });
    await waitFor(() => {
      expect(document.getElementById("create-account-form")).toBeNull();
    });
  });

  // BAS-017 — Cancel button on the create-account step closes the modal entirely.
  it("calls onClose when Cancel is clicked on the create-account step", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<BankStatementModal filePath={FILE_PATH} onClose={onClose} />);

    await waitFor(() => {
      expect(document.getElementById("create-account-form")).not.toBeNull();
    });

    // Locate the cancel button by stable structural selector (the secondary
    // button inside the footer of the create-account step that is NOT the form
    // submit button).
    const cancelButton = Array.from(document.querySelectorAll("button")).find(
      (b) => b.getAttribute("type") !== "submit" && !b.getAttribute("aria-label"),
    ) as HTMLButtonElement | null;
    expect(cancelButton).not.toBeNull();
    if (!cancelButton) throw new Error("cancel button missing");

    await user.click(cancelButton);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockCreateBankAccount).not.toHaveBeenCalled();
  });
});

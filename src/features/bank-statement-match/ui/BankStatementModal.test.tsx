/**
 * Component RTL test for BankStatementModal — the gate phase (BAS-011..017).
 *
 * Renders the real modal, mocks the local `./gateway` boundary, and exercises
 * the actual DOM: typing into the name field, submitting via the form button,
 * and verifying the create-account step gives way to the reconciliation list
 * (the gate hands over to `useBankStatementReconciliation`, which recomputes the
 * draft for the freshly created account).
 *
 * Gate-level state lives in useBankStatementGate; this file complements the
 * hook tests with rendering + DOM-event coverage and replaces the E2E test that
 * would need a native file-picker workaround.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BankStatementReconciliation } from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";
import { makeBankAccount } from "@/tests/bank.factory";

vi.mock("../gateway", () => ({
  parseBankStatement: vi.fn(),
  resolveBankAccountFromIban: vi.fn(),
  createBankAccount: vi.fn(),
  computeBankStatementReconciliation: vi.fn(),
  validateBankStatementReconciliation: vi.fn(),
}));

import * as gateway from "../gateway";
import { BankStatementModal } from "./BankStatementModal";

const mockParse = vi.mocked(gateway.parseBankStatement);
const mockResolveAccount = vi.mocked(gateway.resolveBankAccountFromIban);
const mockCreateBankAccount = vi.mocked(gateway.createBankAccount);
const mockCompute = vi.mocked(gateway.computeBankStatementReconciliation);

const FILE_PATH = "/tmp/statement.pdf";
const PARSE_RESULT = {
  iban: "FR7612345678901234567890189",
  period: "du 01/04/2026 au 30/04/2026",
  credit_lines: [{ date: "2026-04-10", label: "CPAM75", amount: 150000 }],
  total_credits: 150000,
  unparsed_count: 0,
};

const EMPTY_RECONCILIATION: BankStatementReconciliation = {
  lines: [],
  resolved_count: 0,
  needs_correction_count: 0,
  recap: { lines_taken_count: 0, total_amount: 0, partly_paid_lines: [] },
};

describe("BankStatementModal — inline create-account gate (BAS-011..014)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParse.mockResolvedValue({ success: true, data: PARSE_RESULT });
    mockResolveAccount.mockResolvedValue({ success: true, data: null });
    mockCompute.mockResolvedValue({ success: true, data: EMPTY_RECONCILIATION });
  });

  it("creates the missing account inline then hands over to the reconciliation list", async () => {
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

    // After success, the reconciliation list mounts for the new account: it
    // recomputes the draft (with the new account id) and the create-account form
    // is no longer in the DOM.
    await waitFor(() => {
      expect(mockCompute).toHaveBeenCalledWith(newAccount.id, PARSE_RESULT, []);
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

  // BAS-015 — while the create call is in flight, the form fields and submit
  // button are disabled so the user cannot resubmit.
  it("disables the form while the account creation is in flight (BAS-015)", async () => {
    const user = userEvent.setup();
    // Never-resolving create call → the in-flight state persists.
    mockCreateBankAccount.mockReturnValue(new Promise(() => {}));

    render(<BankStatementModal filePath={FILE_PATH} onClose={() => {}} />);

    await waitFor(() => {
      expect(document.getElementById("create-account-form")).not.toBeNull();
    });

    const nameInput = document.getElementById("create-account-name") as HTMLInputElement | null;
    if (!nameInput) throw new Error("name input missing");
    await user.type(nameInput, "Cabinet principal");

    const submitBtn = document.querySelector(
      'button[type="submit"][form="create-account-form"]',
    ) as HTMLButtonElement | null;
    if (!submitBtn) throw new Error("submit button missing");
    await user.click(submitBtn);

    await waitFor(() => {
      expect(submitBtn.disabled).toBe(true);
    });
    expect(nameInput.disabled).toBe(true);
  });

  // BAS-022 — the unparsed-line count renders as a header warning; absent at 0.
  it("shows the unparsed-lines warning when the parser dropped lines (BAS-022)", async () => {
    mockParse.mockResolvedValue({
      success: true,
      data: { ...PARSE_RESULT, unparsed_count: 2 },
    });

    render(<BankStatementModal filePath={FILE_PATH} onClose={() => {}} />);

    await waitFor(() => {
      expect(document.getElementById("bank-statement-modal-unparsed-warning")).not.toBeNull();
    });
  });

  it("renders no unparsed-lines warning when every line parsed (BAS-022)", async () => {
    render(<BankStatementModal filePath={FILE_PATH} onClose={() => {}} />);

    await waitFor(() => {
      expect(document.getElementById("create-account-form")).not.toBeNull();
    });
    expect(document.getElementById("bank-statement-modal-unparsed-warning")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// #696 — one modal height, and no way out drops the work without asking
// ---------------------------------------------------------------------------

describe("BankStatementModal — the abandon confirmation and the fixed height (#696)", () => {
  const ACCOUNT = makeBankAccount({ id: "acc-1", name: "Compte courant", iban: PARSE_RESULT.iban });
  const RECONCILIATION_TO_LINK: BankStatementReconciliation = {
    ...EMPTY_RECONCILIATION,
    lines: [
      {
        line_id: "line-0",
        credit_line: PARSE_RESULT.credit_lines[0] ?? { date: "", label: "", amount: 0 },
        status: "NeedsLink",
        fund_id: null,
        assigned_group_ids: [],
        assigned_procedure_ids: [],
        covered_amount: 0,
        remainder_acknowledged: false,
        candidate_groups: [],
        candidate_procedures: [],
        suggested_fund_id: null,
        suggested_fund_name: null,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({
      funds: [{ id: "fund-1", fund_identifier: "75", name: "CPAM 75", temp_id: null }],
    });
    mockParse.mockResolvedValue({ success: true, data: PARSE_RESULT });
    mockResolveAccount.mockResolvedValue({ success: true, data: ACCOUNT });
    mockCompute.mockResolvedValue({ success: true, data: RECONCILIATION_TO_LINK });
  });

  async function renderReady(onClose: () => void) {
    render(<BankStatementModal filePath={FILE_PATH} onClose={onClose} />);
    await waitFor(() => {
      expect(document.getElementById("label-assoc-fund-CPAM75")).not.toBeNull();
    });
  }

  async function doSomeWork(user: ReturnType<typeof userEvent.setup>) {
    await user.type(element("label-assoc-fund-CPAM75"), "CPAM");
    await user.click(await screen.findByRole("option", { name: "CPAM 75" }));
    await waitFor(() => {
      expect(mockCompute).toHaveBeenCalledWith("acc-1", PARSE_RESULT, [
        { type: "LinkFund", bank_label: "CPAM75", assignment: { type: "Fund", fund_id: "fund-1" } },
      ]);
    });
  }

  function element(id: string): HTMLElement {
    const found = document.getElementById(id);
    if (!found) throw new Error(`#${id} missing`);
    return found;
  }

  it("closes at once when no work was done", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    await renderReady(onClose);

    await user.click(element("bank-statement-modal-close"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.getElementById("bank-statement-abandon-confirmation")).toBeNull();
  });

  it("asks before the close cross drops the work, and abandons on confirm", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    await renderReady(onClose);
    await doSomeWork(user);

    await user.click(element("bank-statement-modal-close"));
    expect(element("bank-statement-abandon-confirmation")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(element("bank-statement-abandon-confirmation-confirm"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the import when the user continues it", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    await renderReady(onClose);
    await doSomeWork(user);

    await user.click(element("bank-statement-modal-close"));
    await user.click(element("bank-statement-abandon-confirmation-cancel"));

    expect(onClose).not.toHaveBeenCalled();
    expect(document.getElementById("bank-statement-abandon-confirmation")).toBeNull();
    expect(document.getElementById("label-assoc-fund-CPAM75")).not.toBeNull();
  });

  it("asks on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    await renderReady(onClose);
    await doSomeWork(user);

    element("bank-statement-modal").dispatchEvent(new Event("cancel", { cancelable: true }));

    await waitFor(() => {
      expect(document.getElementById("bank-statement-abandon-confirmation")).not.toBeNull();
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("asks on a click outside the modal", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    await renderReady(onClose);
    await doSomeWork(user);

    await user.click(element("bank-statement-modal"));

    expect(element("bank-statement-abandon-confirmation")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("asks on the labels' Annuler", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    await renderReady(onClose);
    await doSomeWork(user);

    await user.click(element("label-assoc-cancel"));

    expect(element("bank-statement-abandon-confirmation")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps one height on every step: 90 % of the window, capped at 800 px", async () => {
    await renderReady(vi.fn());

    expect(element("bank-statement-modal").className).toContain("h-[min(90vh,800px)]");
  });
});

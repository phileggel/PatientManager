/**
 * Tests for the modified `useBankStatementModal` hook — BAS-010..017.
 *
 * All gateway calls are mocked at the local `../gateway` boundary, consistent
 * with every other modal hook test in this feature.
 *
 * NOTE: `createName`, `createError`, `isCreatingAccount`, `handleCreateNameChange`,
 * and `handleCreateAccountSubmit` do NOT exist on the hook yet. These tests
 * establish the red baseline; they will compile and pass only after §2.4.1 is
 * implemented.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeBankAccount } from "@/tests/bank.factory";

// -------------------------------------------------------------------
// 1. Mock the local gateway module (covers both original exports and the
//    new `createBankAccount` re-export added in §2.4.5).
// -------------------------------------------------------------------
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
import { useBankStatementModal } from "./useBankStatementModal";

// -------------------------------------------------------------------
// 2. Typed mock references
// -------------------------------------------------------------------
const mockParse = vi.mocked(gateway.parseBankStatement);
const mockResolveAccount = vi.mocked(gateway.resolveBankAccountFromIban);
const mockResolveLabels = vi.mocked(gateway.resolveBankFundLabels);
const mockGetConfig = vi.mocked(gateway.getBankStatementReconciliationConfig);
const mockCreateBankAccount = vi.mocked(gateway.createBankAccount);

// -------------------------------------------------------------------
// 3. Shared fixtures  (stable references — F19)
// -------------------------------------------------------------------
const FILE_PATH = "/tmp/statement.pdf";

const PARSE_RESULT = {
  iban: "FR7612345678901234567890189",
  period: "du 01/04/2026 au 30/04/2026",
  credit_lines: [{ date: "2026-04-10", label: "CPAM75", amount: 150000 }],
  total_credits: 150000,
  unparsed_count: 0,
};

const NEW_ACCOUNT = makeBankAccount({
  id: "acc-new-1",
  name: "Cabinet principal",
  iban: "FR7612345678901234567890189",
});

const LABEL_RESOLUTIONS = [
  {
    bank_label: "CPAM75",
    fund_id: null,
    suggested_fund_id: null,
    suggested_fund_name: null,
    is_confirmed: false,
    is_rejected: false,
  },
];

// -------------------------------------------------------------------
// 4. Helpers
// -------------------------------------------------------------------
function stubConfigAndParseAndNoAccount() {
  mockGetConfig.mockResolvedValue({ max_date_offset_days: 6 });
  mockParse.mockResolvedValue(PARSE_RESULT);
  mockResolveAccount.mockResolvedValue(null); // BAS-010 trigger
}

// -------------------------------------------------------------------
// 5. Tests
// -------------------------------------------------------------------
describe("useBankStatementModal — BAS-010..017 (inline create-account flow)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------
  // BAS-011 — loadAndParse transitions to "create-account" when
  //           resolveBankAccountFromIban returns null
  // -----------------------------------------------------------------
  it("transitions to create-account step when resolveBankAccountFromIban returns null (BAS-011)", async () => {
    stubConfigAndParseAndNoAccount();

    const { result } = renderHook(() => useBankStatementModal(FILE_PATH));

    // Starts as "loading"
    expect(result.current.step).toBe("loading");

    await waitFor(() => {
      expect(result.current.step).toBe("create-account");
    });

    expect(mockResolveAccount).toHaveBeenCalledWith(PARSE_RESULT.iban);
  });

  // -----------------------------------------------------------------
  // BAS-012 + BAS-014 — happy path: trimmed name, pre-filled IBAN,
  //                     transitions to "label-mapping" on success
  // -----------------------------------------------------------------
  it("calls createBankAccount with trimmed name and IBAN, then transitions to label-mapping (BAS-012 + BAS-014)", async () => {
    stubConfigAndParseAndNoAccount();
    mockCreateBankAccount.mockResolvedValue({ success: true, data: NEW_ACCOUNT });
    mockResolveLabels.mockResolvedValue(LABEL_RESOLUTIONS);

    const { result } = renderHook(() => useBankStatementModal(FILE_PATH));

    // Wait for "create-account" step
    await waitFor(() => {
      expect(result.current.step).toBe("create-account");
    });

    // Simulate user typing a name with surrounding whitespace
    act(() => {
      result.current.handleCreateNameChange("  Cabinet principal  ");
    });

    // Submit
    await act(async () => {
      await result.current.handleCreateAccountSubmit();
    });

    // Gateway must be called with the trimmed name and pre-filled IBAN
    expect(mockCreateBankAccount).toHaveBeenCalledWith("Cabinet principal", PARSE_RESULT.iban);

    // After success: must proceed to label-mapping
    expect(result.current.step).toBe("label-mapping");
    expect(mockResolveLabels).toHaveBeenCalledWith(
      NEW_ACCOUNT.id,
      PARSE_RESULT.credit_lines.map((l) => l.label),
    );
  });

  // -----------------------------------------------------------------
  // BAS-012 — empty-name validation: gateway must NOT be called
  // -----------------------------------------------------------------
  it("does not call createBankAccount and sets createError when name is whitespace-only (BAS-012)", async () => {
    stubConfigAndParseAndNoAccount();

    const { result } = renderHook(() => useBankStatementModal(FILE_PATH));

    await waitFor(() => {
      expect(result.current.step).toBe("create-account");
    });

    act(() => {
      result.current.handleCreateNameChange("   ");
    });

    await act(async () => {
      await result.current.handleCreateAccountSubmit();
    });

    expect(mockCreateBankAccount).not.toHaveBeenCalled();
    expect(result.current.createError).toBeTruthy();
    // Step must remain on the form
    expect(result.current.step).toBe("create-account");
  });

  // -----------------------------------------------------------------
  // BAS-015 — isCreatingAccount is true while submit is in flight
  // -----------------------------------------------------------------
  it("sets isCreatingAccount=true during submit and false after resolution (BAS-015)", async () => {
    stubConfigAndParseAndNoAccount();

    // Deferred promise — does not resolve immediately
    let resolveCreate!: (v: { success: true; data: typeof NEW_ACCOUNT }) => void;
    mockCreateBankAccount.mockReturnValue(
      new Promise<{ success: true; data: typeof NEW_ACCOUNT }>((resolve) => {
        resolveCreate = resolve;
      }),
    );
    mockResolveLabels.mockResolvedValue(LABEL_RESOLUTIONS);

    const { result } = renderHook(() => useBankStatementModal(FILE_PATH));

    await waitFor(() => {
      expect(result.current.step).toBe("create-account");
    });

    act(() => {
      result.current.handleCreateNameChange("Cabinet principal");
    });

    // Start submit but do not await yet
    let submitDone = false;
    act(() => {
      result.current.handleCreateAccountSubmit().then(() => {
        submitDone = true;
      });
    });

    // Mid-flight: isCreatingAccount should be true
    await waitFor(() => {
      expect(result.current.isCreatingAccount).toBe(true);
    });

    // Resolve the deferred promise
    await act(async () => {
      resolveCreate({ success: true, data: NEW_ACCOUNT });
    });

    await waitFor(() => submitDone);

    // After resolution: isCreatingAccount should be false
    expect(result.current.isCreatingAccount).toBe(false);
  });

  // -----------------------------------------------------------------
  // BAS-016 — backend error: createError set, step stays "create-account"
  // -----------------------------------------------------------------
  it("sets createError and stays on create-account step when createBankAccount fails (BAS-016)", async () => {
    stubConfigAndParseAndNoAccount();
    mockCreateBankAccount.mockResolvedValue({
      success: false,
      error: { code: "IbanAlreadyUsed" },
    });

    const { result } = renderHook(() => useBankStatementModal(FILE_PATH));

    await waitFor(() => {
      expect(result.current.step).toBe("create-account");
    });

    act(() => {
      result.current.handleCreateNameChange("Cabinet principal");
    });

    await act(async () => {
      await result.current.handleCreateAccountSubmit();
    });

    // Sentinel must be mapped to a translated user-facing message — the typed
    // BankError variant gets narrowed and translated; never displayed raw.
    expect(result.current.createError).toBeTruthy();
    expect(result.current.createError?.toLowerCase()).toContain("iban");
    expect(result.current.step).toBe("create-account");
    // The typed name must be preserved so the user can correct without re-typing
    expect(result.current.createName).toBe("Cabinet principal");
  });

  // -----------------------------------------------------------------
  // BAS-016 — handleCreateNameChange clears createError after failure
  // -----------------------------------------------------------------
  it("clears createError when handleCreateNameChange fires after an error (BAS-016)", async () => {
    stubConfigAndParseAndNoAccount();
    mockCreateBankAccount.mockResolvedValue({
      success: false,
      error: { code: "IbanAlreadyUsed" },
    });

    const { result } = renderHook(() => useBankStatementModal(FILE_PATH));

    await waitFor(() => {
      expect(result.current.step).toBe("create-account");
    });

    act(() => {
      result.current.handleCreateNameChange("Cabinet principal");
    });

    await act(async () => {
      await result.current.handleCreateAccountSubmit();
    });

    // Confirm error is set
    expect(result.current.createError).toBeTruthy();

    // User starts typing again — error must clear
    act(() => {
      result.current.handleCreateNameChange("Cabinet principal updated");
    });

    expect(result.current.createError).toBeNull();
  });
});

// -------------------------------------------------------------------
// 6. Normal flow (account found) and error paths
// -------------------------------------------------------------------
const mockSaveMappings = vi.mocked(gateway.saveBankFundLabelMappings);
const mockMatch = vi.mocked(gateway.matchBankStatementLines);
const mockCreateTransfers = vi.mocked(gateway.createBankTransfersFromStatement);

const LABEL_RESOLUTIONS_WITH_FUND = [
  {
    bank_label: "CPAM75",
    fund_id: "fund-1",
    suggested_fund_id: null,
    suggested_fund_name: null,
    is_confirmed: true,
    is_rejected: false,
  },
];

const MATCH_RESULT_WITH_MATCH = {
  matched: [
    {
      credit_line: { date: "2026-04-10", label: "CPAM75", amount: 150000, fund_id: "fund-1" },
      group_id: "group-1",
      group_fund_id: "fund-1",
      group_payment_date: "2026-04-08",
      group_total_amount: 150000,
    },
  ],
  unmatched_lines: [],
};

const MATCH_RESULT_EMPTY = { matched: [], unmatched_lines: [] };

function stubNormalFlow() {
  mockGetConfig.mockResolvedValue({ max_date_offset_days: 6 });
  mockParse.mockResolvedValue(PARSE_RESULT);
  mockResolveAccount.mockResolvedValue(NEW_ACCOUNT);
  mockResolveLabels.mockResolvedValue(LABEL_RESOLUTIONS_WITH_FUND);
}

describe("useBankStatementModal — normal flow (account found) and error paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("transitions to label-mapping when account is found in IBAN lookup", async () => {
    stubNormalFlow();

    const { result } = renderHook(() => useBankStatementModal(FILE_PATH));

    await waitFor(() => expect(result.current.step).toBe("label-mapping"));
    expect(mockResolveAccount).toHaveBeenCalledWith(PARSE_RESULT.iban);
    expect(result.current.labelResolutions).toHaveLength(1);
  });

  it("getBankStatementReconciliationConfig updates maxDateOffsetDays", async () => {
    mockGetConfig.mockResolvedValue({ max_date_offset_days: 14 });
    // Short-circuit the parse flow to avoid waiting for full setup
    mockParse.mockRejectedValue(new Error("stop-here"));

    const { result } = renderHook(() => useBankStatementModal(FILE_PATH));

    await waitFor(() => expect(result.current.step).toBe("error"));
    expect(result.current.maxDateOffsetDays).toBe(14);
  });

  it("sets error step with the specific message for NO_VIR_SEPA_LINES", async () => {
    mockGetConfig.mockResolvedValue({ max_date_offset_days: 6 });
    mockParse.mockRejectedValue(new Error("NO_VIR_SEPA_LINES"));

    const { result } = renderHook(() => useBankStatementModal(FILE_PATH));

    await waitFor(() => expect(result.current.step).toBe("error"));
    expect(result.current.error).toBeTruthy();
  });

  it("sets error step for a generic parseBankStatement exception", async () => {
    mockGetConfig.mockResolvedValue({ max_date_offset_days: 6 });
    mockParse.mockRejectedValue(new Error("unexpected parse error"));

    const { result } = renderHook(() => useBankStatementModal(FILE_PATH));

    await waitFor(() => expect(result.current.step).toBe("error"));
    expect(result.current.error).toBeTruthy();
  });

  it("handleLabelMappingConfirm saves mappings and proceeds through matching to results", async () => {
    stubNormalFlow();
    mockSaveMappings.mockResolvedValue(undefined);
    mockMatch.mockResolvedValue(MATCH_RESULT_EMPTY);

    const { result } = renderHook(() => useBankStatementModal(FILE_PATH));
    await waitFor(() => expect(result.current.step).toBe("label-mapping"));

    await act(async () => {
      await result.current.handleLabelMappingConfirm(new Map([["CPAM75", "fund-1"]]));
    });

    await waitFor(() => expect(result.current.step).toBe("results"));
    expect(mockSaveMappings).toHaveBeenCalledWith(NEW_ACCOUNT.id, expect.any(Array));
    expect(mockMatch).toHaveBeenCalled();
  });

  it("handleCreateTransfers transitions to done with confirmed matches", async () => {
    stubNormalFlow();
    mockSaveMappings.mockResolvedValue(undefined);
    mockMatch.mockResolvedValue(MATCH_RESULT_WITH_MATCH);
    mockCreateTransfers.mockResolvedValue(1);

    const { result } = renderHook(() => useBankStatementModal(FILE_PATH));
    await waitFor(() => expect(result.current.step).toBe("label-mapping"));

    await act(async () => {
      await result.current.handleLabelMappingConfirm(new Map([["CPAM75", "fund-1"]]));
    });
    await waitFor(() => expect(result.current.step).toBe("results"));

    await act(async () => {
      await result.current.handleCreateTransfers();
    });

    await waitFor(() => expect(result.current.step).toBe("done"));
    expect(result.current.createdCount).toBe(1);
  });

  it("handleCreateTransfers shows error toast and stays on results when no matches confirmed", async () => {
    stubNormalFlow();
    mockSaveMappings.mockResolvedValue(undefined);
    mockMatch.mockResolvedValue(MATCH_RESULT_EMPTY);

    const { result } = renderHook(() => useBankStatementModal(FILE_PATH));
    await waitFor(() => expect(result.current.step).toBe("label-mapping"));

    await act(async () => {
      await result.current.handleLabelMappingConfirm(new Map([["CPAM75", "fund-1"]]));
    });
    await waitFor(() => expect(result.current.step).toBe("results"));

    await act(async () => {
      await result.current.handleCreateTransfers();
    });

    expect(result.current.step).toBe("results");
    expect(vi.mocked(gateway.createBankTransfersFromStatement)).not.toHaveBeenCalled();
  });
});

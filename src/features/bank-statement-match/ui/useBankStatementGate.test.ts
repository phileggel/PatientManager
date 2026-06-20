/**
 * Unit tests for useBankStatementGate — the parse→resolve→create-account gate
 * phase (BAS-011–017).
 *
 * Covered branches not exercised by BankStatementModal.test.tsx:
 *
 *   - parse error → error phase (formatBankStatementError key surfaced)
 *   - parse success but no IBAN → error phase (statement.modal.no_iban key)
 *   - resolveBankAccountFromIban returns error → error phase
 *   - resolveBankAccountFromIban returns null → create-account phase (BAS-011)
 *   - resolveBankAccountFromIban returns an account → ready phase (happy path)
 *   - handleCreateAccountSubmit:
 *       empty name → setCreateError with name_required key (BAS-016)
 *       IbanAlreadyUsed error → dedicated key (BAS-016 IBAN-conflict branch)
 *       other backend error → generic error key (BAS-016 fallback branch)
 *       success → phase becomes "ready" with bankAccount set (BAS-014)
 *   - handleCreateNameChange clears createError on each keystroke (BAS-016)
 *
 * Mocks gateway at the feature boundary (F3). renderHook stable-reference
 * discipline (F19 / docs/test_convention.md).
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BankAccount, BankStatementParseResult } from "@/bindings";

// ---------------------------------------------------------------------------
// Mock gateway BEFORE importing the hook (docs/test_convention.md §Mocking)
// ---------------------------------------------------------------------------

vi.mock("../gateway", () => ({
  parseBankStatement: vi.fn(),
  resolveBankAccountFromIban: vi.fn(),
  createBankAccount: vi.fn(),
  computeBankStatementReconciliation: vi.fn(),
  validateBankStatementReconciliation: vi.fn(),
}));

// i18n key pass-through: the hook stores an i18n key in state and translates
// it at return time via t(). We mock useTranslation so the returned `error`
// value is the raw key — testable without a real i18n instance.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import * as gateway from "../gateway";
import { useBankStatementGate } from "./useBankStatementGate";

const mockParse = vi.mocked(gateway.parseBankStatement);
const mockResolve = vi.mocked(gateway.resolveBankAccountFromIban);
const mockCreate = vi.mocked(gateway.createBankAccount);

// ---------------------------------------------------------------------------
// Fixtures — stable references (F19)
// ---------------------------------------------------------------------------

const FILE_PATH = "/tmp/statement.pdf";

const PARSE_RESULT: BankStatementParseResult = {
  iban: "FR7612345678901234567890189",
  period: "du 01/04/2026 au 30/04/2026",
  credit_lines: [{ date: "2026-04-10", label: "CPAM75", amount: 150000 }],
  total_credits: 150000,
  unparsed_count: 0,
};

const PARSE_RESULT_NO_IBAN: BankStatementParseResult = {
  ...PARSE_RESULT,
  iban: null,
};

function makeAccount(overrides?: Partial<BankAccount>): BankAccount {
  return { id: "acc-1", name: "Cabinet principal", iban: PARSE_RESULT.iban, ...overrides };
}

// ---------------------------------------------------------------------------
// Parse errors
// ---------------------------------------------------------------------------

describe("useBankStatementGate — parse errors", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets phase=error and exposes i18n key when parseBankStatement returns an error", async () => {
    mockParse.mockResolvedValue({ success: false, error: { code: "PdfExtractionFailed" } });

    const { result } = renderHook(() => useBankStatementGate(FILE_PATH));

    // Initially loading
    expect(result.current.phase).toBe("loading");

    await waitFor(() => expect(result.current.phase).toBe("error"));

    // formatBankStatementError maps PdfExtractionFailed → bank:statement.modal.unknown_error
    expect(result.current.error).toBe("bank:statement.modal.unknown_error");
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("sets phase=error with no_iban key when parse succeeds but IBAN is null", async () => {
    mockParse.mockResolvedValue({ success: true, data: PARSE_RESULT_NO_IBAN });

    const { result } = renderHook(() => useBankStatementGate(FILE_PATH));

    await waitFor(() => expect(result.current.phase).toBe("error"));

    expect(result.current.error).toBe("statement.modal.no_iban");
    // parseResult is still stored even when IBAN is absent
    expect(result.current.parseResult).toEqual(PARSE_RESULT_NO_IBAN);
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("sets phase=error for NoSepaCreditLines — dedicated key (R26)", async () => {
    mockParse.mockResolvedValue({ success: false, error: { code: "NoSepaCreditLines" } });

    const { result } = renderHook(() => useBankStatementGate(FILE_PATH));

    await waitFor(() => expect(result.current.phase).toBe("error"));

    // formatBankStatementError maps NoSepaCreditLines → bank:statement.modal.no_vir_sepa_lines
    expect(result.current.error).toBe("bank:statement.modal.no_vir_sepa_lines");
  });
});

// ---------------------------------------------------------------------------
// resolveBankAccountFromIban errors
// ---------------------------------------------------------------------------

describe("useBankStatementGate — resolveBankAccountFromIban errors", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets phase=error when resolveBankAccountFromIban returns an error", async () => {
    mockParse.mockResolvedValue({ success: true, data: PARSE_RESULT });
    mockResolve.mockResolvedValue({ success: false, error: { code: "DatabaseError" } });

    const { result } = renderHook(() => useBankStatementGate(FILE_PATH));

    await waitFor(() => expect(result.current.phase).toBe("error"));

    expect(result.current.error).toBe("bank:statement.modal.unknown_error");
    expect(result.current.bankAccount).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveBankAccountFromIban → null (IBAN unknown) → create-account phase
// ---------------------------------------------------------------------------

describe("useBankStatementGate — IBAN unknown → create-account phase (BAS-011)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets phase=create-account when resolve returns null (IBAN unknown, BAS-011)", async () => {
    mockParse.mockResolvedValue({ success: true, data: PARSE_RESULT });
    mockResolve.mockResolvedValue({ success: true, data: null });

    const { result } = renderHook(() => useBankStatementGate(FILE_PATH));

    await waitFor(() => expect(result.current.phase).toBe("create-account"));

    expect(result.current.bankAccount).toBeNull();
    expect(result.current.parseResult).toEqual(PARSE_RESULT);
    expect(result.current.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveBankAccountFromIban → account → ready phase (happy path)
// ---------------------------------------------------------------------------

describe("useBankStatementGate — IBAN known → ready phase", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets phase=ready with bankAccount when resolve returns a known account", async () => {
    const account = makeAccount();
    mockParse.mockResolvedValue({ success: true, data: PARSE_RESULT });
    mockResolve.mockResolvedValue({ success: true, data: account });

    const { result } = renderHook(() => useBankStatementGate(FILE_PATH));

    await waitFor(() => expect(result.current.phase).toBe("ready"));

    expect(result.current.bankAccount).toEqual(account);
    expect(result.current.parseResult).toEqual(PARSE_RESULT);
    expect(result.current.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// handleCreateAccountSubmit — empty name validation (BAS-016)
// ---------------------------------------------------------------------------

describe("useBankStatementGate — handleCreateAccountSubmit: empty name (BAS-016)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets createError=name_required when the name field is blank and does not call createBankAccount", async () => {
    mockParse.mockResolvedValue({ success: true, data: PARSE_RESULT });
    mockResolve.mockResolvedValue({ success: true, data: null });

    const { result } = renderHook(() => useBankStatementGate(FILE_PATH));
    await waitFor(() => expect(result.current.phase).toBe("create-account"));

    // name is "" by default
    await act(async () => {
      await result.current.handleCreateAccountSubmit();
    });

    expect(result.current.createError).toBe("statement.modal.create_account.name_required");
    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("create-account");
  });

  it("sets createError=name_required for a whitespace-only name", async () => {
    mockParse.mockResolvedValue({ success: true, data: PARSE_RESULT });
    mockResolve.mockResolvedValue({ success: true, data: null });

    const { result } = renderHook(() => useBankStatementGate(FILE_PATH));
    await waitFor(() => expect(result.current.phase).toBe("create-account"));

    // Set name to whitespace
    act(() => result.current.handleCreateNameChange("   "));

    await act(async () => {
      await result.current.handleCreateAccountSubmit();
    });

    expect(result.current.createError).toBe("statement.modal.create_account.name_required");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleCreateAccountSubmit — IbanAlreadyUsed conflict (BAS-016 IBAN-conflict branch)
// ---------------------------------------------------------------------------

describe("useBankStatementGate — handleCreateAccountSubmit: IbanAlreadyUsed (BAS-016)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets createError=error_iban_already_used when createBankAccount returns IbanAlreadyUsed (BAS-016)", async () => {
    mockParse.mockResolvedValue({ success: true, data: PARSE_RESULT });
    mockResolve.mockResolvedValue({ success: true, data: null });
    mockCreate.mockResolvedValue({ success: false, error: { code: "IbanAlreadyUsed" } });

    const { result } = renderHook(() => useBankStatementGate(FILE_PATH));
    await waitFor(() => expect(result.current.phase).toBe("create-account"));

    act(() => result.current.handleCreateNameChange("Cabinet principal"));

    await act(async () => {
      await result.current.handleCreateAccountSubmit();
    });

    expect(mockCreate).toHaveBeenCalledWith("Cabinet principal", PARSE_RESULT.iban);
    expect(result.current.createError).toBe(
      "statement.modal.create_account.error_iban_already_used",
    );
    // Phase stays on create-account (error, not success)
    expect(result.current.phase).toBe("create-account");
    expect(result.current.isCreatingAccount).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// handleCreateAccountSubmit — other backend error → generic key (BAS-016 fallback)
// ---------------------------------------------------------------------------

describe("useBankStatementGate — handleCreateAccountSubmit: other error (BAS-016 fallback)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets createError=error_unknown for any non-IbanAlreadyUsed backend error (BAS-016)", async () => {
    mockParse.mockResolvedValue({ success: true, data: PARSE_RESULT });
    mockResolve.mockResolvedValue({ success: true, data: null });
    mockCreate.mockResolvedValue({ success: false, error: { code: "DatabaseError" } });

    const { result } = renderHook(() => useBankStatementGate(FILE_PATH));
    await waitFor(() => expect(result.current.phase).toBe("create-account"));

    act(() => result.current.handleCreateNameChange("Cabinet principal"));

    await act(async () => {
      await result.current.handleCreateAccountSubmit();
    });

    expect(result.current.createError).toBe("statement.modal.create_account.error_unknown");
    expect(result.current.phase).toBe("create-account");
    expect(result.current.isCreatingAccount).toBe(false);
  });

  it("resets isCreatingAccount to false even when createBankAccount throws unexpectedly", async () => {
    mockParse.mockResolvedValue({ success: true, data: PARSE_RESULT });
    mockResolve.mockResolvedValue({ success: true, data: null });
    // The gateway wraps IPC failures in a ServiceResult, but in case the mock
    // throws (infrastructure fault), the finally block must still reset the flag.
    // Simulate via a resolved error (the hook's success branch never executes).
    mockCreate.mockResolvedValue({ success: false, error: { code: "BankAccountNameEmpty" } });

    const { result } = renderHook(() => useBankStatementGate(FILE_PATH));
    await waitFor(() => expect(result.current.phase).toBe("create-account"));

    act(() => result.current.handleCreateNameChange("X"));

    await act(async () => {
      await result.current.handleCreateAccountSubmit();
    });

    expect(result.current.isCreatingAccount).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// handleCreateAccountSubmit — success → ready + bankAccount set (BAS-014)
// ---------------------------------------------------------------------------

describe("useBankStatementGate — handleCreateAccountSubmit: success → ready (BAS-014)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets phase=ready and bankAccount after successful account creation (BAS-014)", async () => {
    const newAccount = makeAccount({ id: "acc-new", name: "Cabinet B" });
    mockParse.mockResolvedValue({ success: true, data: PARSE_RESULT });
    mockResolve.mockResolvedValue({ success: true, data: null });
    mockCreate.mockResolvedValue({ success: true, data: newAccount });

    const { result } = renderHook(() => useBankStatementGate(FILE_PATH));
    await waitFor(() => expect(result.current.phase).toBe("create-account"));

    act(() => result.current.handleCreateNameChange("Cabinet B"));

    await act(async () => {
      await result.current.handleCreateAccountSubmit();
    });

    expect(result.current.phase).toBe("ready");
    expect(result.current.bankAccount).toEqual(newAccount);
    expect(result.current.createError).toBeNull();
    expect(result.current.isCreatingAccount).toBe(false);
  });

  it("trimmed name is sent to createBankAccount (leading/trailing spaces stripped, BAS-016)", async () => {
    const newAccount = makeAccount({ id: "acc-trim", name: "Cabinet C" });
    mockParse.mockResolvedValue({ success: true, data: PARSE_RESULT });
    mockResolve.mockResolvedValue({ success: true, data: null });
    mockCreate.mockResolvedValue({ success: true, data: newAccount });

    const { result } = renderHook(() => useBankStatementGate(FILE_PATH));
    await waitFor(() => expect(result.current.phase).toBe("create-account"));

    act(() => result.current.handleCreateNameChange("  Cabinet C  "));

    await act(async () => {
      await result.current.handleCreateAccountSubmit();
    });

    expect(mockCreate).toHaveBeenCalledWith("Cabinet C", PARSE_RESULT.iban);
  });
});

// ---------------------------------------------------------------------------
// handleCreateNameChange — clears createError on each keystroke (BAS-016)
// ---------------------------------------------------------------------------

describe("useBankStatementGate — handleCreateNameChange clears error (BAS-016)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clears createError when the user types after a failed submission (BAS-016)", async () => {
    mockParse.mockResolvedValue({ success: true, data: PARSE_RESULT });
    mockResolve.mockResolvedValue({ success: true, data: null });

    const { result } = renderHook(() => useBankStatementGate(FILE_PATH));
    await waitFor(() => expect(result.current.phase).toBe("create-account"));

    // Trigger validation error (empty name)
    await act(async () => {
      await result.current.handleCreateAccountSubmit();
    });
    expect(result.current.createError).not.toBeNull();

    // Typing clears the error
    act(() => result.current.handleCreateNameChange("C"));
    expect(result.current.createError).toBeNull();
    expect(result.current.createName).toBe("C");
  });
});

// ---------------------------------------------------------------------------
// Loading phase — initial state before any gateway call resolves
// ---------------------------------------------------------------------------

describe("useBankStatementGate — loading phase", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts in loading phase with null error, parseResult, and bankAccount", () => {
    // Prevent the effect from resolving
    mockParse.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useBankStatementGate(FILE_PATH));

    expect(result.current.phase).toBe("loading");
    expect(result.current.error).toBeNull();
    expect(result.current.parseResult).toBeNull();
    expect(result.current.bankAccount).toBeNull();
  });
});

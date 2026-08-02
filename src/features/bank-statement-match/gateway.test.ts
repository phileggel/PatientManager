import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BankAccount,
  BankError,
  BankStatementCorrection,
  BankStatementParseResult,
  BankStatementReconciliation,
} from "@/bindings";
import type { ServiceResult } from "@/types/api";

import {
  computeBankStatementReconciliation,
  createBankAccount,
  parseBankStatement,
  resolveBankAccountFromIban,
  validateBankStatementReconciliation,
} from "./gateway";

const mockInvoke = vi.mocked(invoke);

describe("bank-statement-match gateway — createBankAccount re-export (BAS-014 / §2.4.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ServiceResult success with the created BankAccount on happy path", async () => {
    const created: BankAccount = {
      id: "acc-new-1",
      name: "Main Practice",
      iban: "FR7612345678901234567890189",
    };

    // bindings.ts wraps invoke result in { status: "ok", data: … }
    mockInvoke.mockResolvedValue(created);

    const result: ServiceResult<BankAccount, BankError> = await createBankAccount(
      "Main Practice",
      "FR7612345678901234567890189",
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(created);
    }
    expect(mockInvoke).toHaveBeenCalledWith("create_bank_account", {
      name: "Main Practice",
      iban: "FR7612345678901234567890189",
    });
  });

  it("returns ServiceResult failure with IbanAlreadyUsed when backend rejects (BAS-013)", async () => {
    // bindings.ts catch block: non-Error rejections become { status: "error", error: value }
    // Post typed-error migration the wire shape is `{ code: "IbanAlreadyUsed" }`
    // (no IBAN payload — PII would never have a place on the wire).
    mockInvoke.mockRejectedValue({ code: "IbanAlreadyUsed" });

    const result: ServiceResult<BankAccount, BankError> = await createBankAccount(
      "Duplicate",
      "FR7612345678901234567890189",
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toEqual({ code: "IbanAlreadyUsed" });
    }
    expect(mockInvoke).toHaveBeenCalledWith("create_bank_account", {
      name: "Duplicate",
      iban: "FR7612345678901234567890189",
    });
  });
});

describe("bank-statement-match gateway — typed-error ServiceResult wrappers", () => {
  // Each phase sets a fresh persistent invoke behavior after a reset — avoids the
  // `*Once` queue interacting with the persistent base set by the block above.
  function invokeResolves(value: unknown) {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(value);
  }
  // A non-Error rejection: bindings returns `{ status: "error", error }`.
  function invokeTypedError(code: string) {
    mockInvoke.mockReset();
    mockInvoke.mockRejectedValue({ code });
  }
  // A genuine Error rejection: bindings rethrows → the gateway catch maps DatabaseError.
  function invokeThrows() {
    mockInvoke.mockReset();
    mockInvoke.mockRejectedValue(new Error("ipc down"));
  }

  const PARSE_DATA = {
    iban: "FR76",
    period: null,
    credit_lines: [{ date: "2026-04-10", label: "CPAM75", amount: 150000 }],
    total_credits: 150000,
    unparsed_count: 0,
  };

  it("parseBankStatement maps ok and typed-error results, and catches infra throws", async () => {
    invokeResolves(PARSE_DATA);
    expect(await parseBankStatement("/tmp/s.pdf")).toEqual({ success: true, data: PARSE_DATA });

    invokeTypedError("NoSepaCreditLines");
    expect(await parseBankStatement("/tmp/s.pdf")).toEqual({
      success: false,
      error: { code: "NoSepaCreditLines" },
    });

    invokeThrows();
    expect(await parseBankStatement("/tmp/s.pdf")).toEqual({
      success: false,
      error: { code: "DatabaseError" },
    });
  });

  it("resolveBankAccountFromIban passes data through and maps typed errors", async () => {
    invokeResolves(null);
    expect(await resolveBankAccountFromIban("FR76")).toEqual({ success: true, data: null });

    invokeTypedError("DatabaseError");
    expect(await resolveBankAccountFromIban("FR76")).toEqual({
      success: false,
      error: { code: "DatabaseError" },
    });
  });
});

// ---------------------------------------------------------------------------
// NEW: computeBankStatementReconciliation / validateBankStatementReconciliation
// (BAS-060–069, BAS-090–094, BAS-100–103)
// ---------------------------------------------------------------------------

const PARSE_RESULT_FIXTURE: BankStatementParseResult = {
  iban: "FR7612345678901234567890189",
  period: "du 01/04/2026 au 30/04/2026",
  credit_lines: [{ date: "2026-04-10", label: "CPAM75", amount: 150000 }],
  total_credits: 150000,
  unparsed_count: 0,
};

const CORRECTIONS_FIXTURE: BankStatementCorrection[] = [
  {
    type: "LinkFund",
    bank_label: "CPAM75",
    assignment: { type: "Fund", fund_id: "fund-1" },
  },
];

const RECONCILIATION_FIXTURE: BankStatementReconciliation = {
  lines: [
    {
      line_id: "line-1",
      credit_line: { date: "2026-04-10", label: "CPAM75", amount: 150000 },
      status: "Matched",
      fund_id: "fund-1",
      assigned_group_ids: ["group-1"],
      assigned_procedure_ids: [],
      covered_amount: 150000,
      remainder_acknowledged: false,
      candidate_groups: [],
      broadened_candidates: [],
      candidate_procedures: [],
      suggested_fund_id: null,
      suggested_fund_name: null,
    },
  ],
  resolved_count: 1,
  needs_correction_count: 0,
};

describe("bank-statement-match gateway — computeBankStatementReconciliation (BAS-064)", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("passes through ok result: returns ServiceResult success with BankStatementReconciliation", async () => {
    vi.mocked(invoke).mockResolvedValue(RECONCILIATION_FIXTURE);

    const result: ServiceResult<BankStatementReconciliation, unknown> =
      await computeBankStatementReconciliation("acc-1", PARSE_RESULT_FIXTURE, CORRECTIONS_FIXTURE);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resolved_count).toBe(1);
      expect(result.data.needs_correction_count).toBe(0);
      expect(result.data.lines).toHaveLength(1);
      expect(result.data.lines[0]?.status).toBe("Matched");
    }
    expect(vi.mocked(invoke)).toHaveBeenCalledWith(
      "compute_bank_statement_reconciliation",
      expect.objectContaining({
        bankAccountId: "acc-1",
        parseResult: PARSE_RESULT_FIXTURE,
        corrections: CORRECTIONS_FIXTURE,
      }),
    );
  });

  it("passes through AssignmentOverflow error without throwing (BAS-094, F27)", async () => {
    vi.mocked(invoke).mockRejectedValue({ code: "AssignmentOverflow" });

    const result = await computeBankStatementReconciliation("acc-1", PARSE_RESULT_FIXTURE, [
      { type: "AssignGroups", line_id: "line-1", group_ids: ["group-big"] },
    ]);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect((result.error as { code: string }).code).toBe("AssignmentOverflow");
    }
  });

  it("passes through GroupNotEligible error without throwing (BAS-090, F27)", async () => {
    vi.mocked(invoke).mockRejectedValue({ code: "GroupNotEligible" });

    const result = await computeBankStatementReconciliation("acc-1", PARSE_RESULT_FIXTURE, []);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect((result.error as { code: string }).code).toBe("GroupNotEligible");
    }
  });

  it("passes through GroupAlreadyConsumed error without throwing (BAS-067, F27)", async () => {
    vi.mocked(invoke).mockRejectedValue({ code: "GroupAlreadyConsumed" });

    const result = await computeBankStatementReconciliation("acc-1", PARSE_RESULT_FIXTURE, []);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect((result.error as { code: string }).code).toBe("GroupAlreadyConsumed");
    }
  });

  it("passes through DatabaseError without throwing (F27 infra catch-all)", async () => {
    vi.mocked(invoke).mockRejectedValue({ code: "DatabaseError" });

    const result = await computeBankStatementReconciliation("acc-1", PARSE_RESULT_FIXTURE, []);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect((result.error as { code: string }).code).toBe("DatabaseError");
    }
  });

  it("maps a genuine IPC Error throw to the DatabaseError infra sentinel (F27)", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("ipc crash"));

    const result = await computeBankStatementReconciliation("acc-1", PARSE_RESULT_FIXTURE, []);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect((result.error as { code: string }).code).toBe("DatabaseError");
    }
  });
});

describe("bank-statement-match gateway — validateBankStatementReconciliation (BAS-063, BAS-093)", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("passes through ok result: returns ServiceResult success with the BankEntry count", async () => {
    vi.mocked(invoke).mockResolvedValue(3);

    const result: ServiceResult<number, unknown> = await validateBankStatementReconciliation(
      "acc-1",
      PARSE_RESULT_FIXTURE,
      CORRECTIONS_FIXTURE,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(3);
    }
    expect(vi.mocked(invoke)).toHaveBeenCalledWith(
      "validate_bank_statement_reconciliation",
      expect.objectContaining({
        bankAccountId: "acc-1",
        parseResult: PARSE_RESULT_FIXTURE,
        corrections: CORRECTIONS_FIXTURE,
      }),
    );
  });

  it("passes through AssignmentOverflow error without throwing (BAS-094, F27)", async () => {
    vi.mocked(invoke).mockRejectedValue({ code: "AssignmentOverflow" });

    const result = await validateBankStatementReconciliation("acc-1", PARSE_RESULT_FIXTURE, []);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect((result.error as { code: string }).code).toBe("AssignmentOverflow");
    }
  });

  it("passes through BankAccountNotFound error without throwing (F27)", async () => {
    vi.mocked(invoke).mockRejectedValue({ code: "BankAccountNotFound", bank_account_id: "acc-1" });

    const result = await validateBankStatementReconciliation("acc-1", PARSE_RESULT_FIXTURE, []);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect((result.error as { code: string }).code).toBe("BankAccountNotFound");
    }
  });

  it("passes through DatabaseError without throwing (F27 infra catch-all)", async () => {
    vi.mocked(invoke).mockRejectedValue({ code: "DatabaseError" });

    const result = await validateBankStatementReconciliation("acc-1", PARSE_RESULT_FIXTURE, []);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect((result.error as { code: string }).code).toBe("DatabaseError");
    }
  });

  it("maps a genuine IPC Error throw to the DatabaseError infra sentinel (F27)", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("ipc crash"));

    const result = await validateBankStatementReconciliation("acc-1", PARSE_RESULT_FIXTURE, []);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect((result.error as { code: string }).code).toBe("DatabaseError");
    }
  });
});

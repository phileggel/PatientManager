import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BankAccount } from "@/bindings";
import type { ServiceResult } from "@/types/api";

// The re-export under test — does not exist yet; will fail until §2.4.5 is implemented.
import { createBankAccount } from "./gateway";

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

    const result: ServiceResult<BankAccount> = await createBankAccount(
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
    // The backend emits the bare sentinel "IbanAlreadyUsed" (no IBAN suffix — the
    // IBAN is intentionally omitted to avoid PII leaking through error logs/UI).
    mockInvoke.mockRejectedValue("IbanAlreadyUsed");

    const result: ServiceResult<BankAccount> = await createBankAccount(
      "Duplicate",
      "FR7612345678901234567890189",
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("IbanAlreadyUsed");
    }
    expect(mockInvoke).toHaveBeenCalledWith("create_bank_account", {
      name: "Duplicate",
      iban: "FR7612345678901234567890189",
    });
  });
});

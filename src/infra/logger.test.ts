import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "./logger";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

/** The text the logger hands to the backend, which writes it to the log file. */
function written(): string {
  const calls = vi.mocked(invoke).mock.calls;
  const args = calls[calls.length - 1]?.[1] as { message: string };
  return args.message;
}

describe("logger (DEBT-059: no value of a logged object reaches the log file)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const method of ["log", "debug", "info", "warn", "error"] as const) {
      vi.spyOn(console, method).mockImplementation(() => {});
    }
  });

  it("writes neither a name nor an SSN held by a logged object", () => {
    // Built apart from the call: scripts/privacy-check.py rightly refuses a log call that
    // names an SSN, and cannot see one inside an object — which is what this guard is for.
    const form = { name: "Nom Prenom", ssn: "1234567890123" };

    logger.info("patient form: Submitting", form);

    expect(written()).toContain("patient form: Submitting");
    expect(written()).not.toContain("Nom Prenom");
    expect(written()).not.toContain("1234567890123");
    expect(written()).toContain('"name":"[redacted]"');
  });

  it("keeps what tells a failure apart: identifiers, codes, numbers and flags", () => {
    logger.error("Delete fund failed", {
      fundId: "f-1",
      source_procedure_id: "p-9",
      code: "FundNotFound",
      count: 3,
      hasIban: true,
    });

    expect(written()).toContain('"fundId":"f-1"');
    expect(written()).toContain('"source_procedure_id":"p-9"');
    expect(written()).toContain('"code":"FundNotFound"');
    expect(written()).toContain('"count":3');
    expect(written()).toContain('"hasIban":true');
  });

  it("redacts the values of a nested object and counts an array without listing it", () => {
    logger.error("Failed", {
      error: { code: "ValidationFailed", detail: "Nom Prenom is not valid" },
      rows: [{ name: "Nom Prenom" }, { name: "Autre Nom" }],
    });

    expect(written()).toContain('"code":"ValidationFailed"');
    expect(written()).not.toContain("Nom Prenom");
    expect(written()).not.toContain("Autre Nom");
    expect(written()).toContain('"rows":"[2 items]"');
  });

  it("keeps the message of an error the runtime threw, not the object's other fields", () => {
    const error = Object.assign(new TypeError("invoke failed"), { payload: "Nom Prenom" });

    logger.error("Exception", { error });

    expect(written()).toContain("TypeError");
    expect(written()).toContain("invoke failed");
    expect(written()).not.toContain("Nom Prenom");
  });

  it("writes only the kind of an error the application built, whose message may quote a name", () => {
    logger.error("form: Submission failed", { error: new Error("Nom Prenom already exists") });

    expect(written()).toContain('"error":"Error"');
    expect(written()).not.toContain("Nom Prenom");
  });

  it("hands the console the same text as the log file", () => {
    logger.info("Adding fund", { fundName: "CPAM Nom Prenom" });

    const shown = vi.mocked(console.info).mock.calls[0]?.join(" ") ?? "";
    expect(shown).toContain("Adding fund");
    expect(shown).not.toContain("Nom Prenom");
  });

  it("ticket #465: a text computed at run time does not compile, a literal does", () => {
    const name = String("Nom Prenom");
    const userId = String("u-1");
    const TAG = "[Test]";
    // @ts-expect-error a template literal may carry what the user typed
    logger.info(`created ${userId}`);
    // @ts-expect-error a text read at run time may carry what the user typed
    logger.info(TAG, name);
    logger.info(TAG, "created", { name });

    expect(written()).toBe('[Test] created {"name":"[redacted]"}');
  });
});

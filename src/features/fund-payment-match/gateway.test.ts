import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportGenerationRequest } from "@/bindings";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any import of the module under test
// ---------------------------------------------------------------------------

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  writeFile: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks so the mocked module factory runs first)
// ---------------------------------------------------------------------------

import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { generateReportPdf, saveReportPdf } from "./gateway";

const mockInvoke = vi.mocked(invoke);
const mockSave = vi.mocked(save);
const mockWriteFile = vi.mocked(writeFile);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRequest(): ReportGenerationRequest {
  return {
    title: "Reconciliation Report",
    continuation_title: "Reconciliation Report (continued)",
    header_lines: [
      "Period: 2025-04-01 – 2025-04-30",
      "Generated: 2025-05-07 14:32",
      "Source PDF: remise-2025-04.pdf",
    ],
    unreconciled: {
      type: "Empty",
      data: {
        heading: "Unreconciled procedures",
        empty_message: "All procedures in the period have been reconciled.",
      },
    },
    correction_section_heading: "Corrections applied",
    correction_groups: [],
    page_label: "Page",
  };
}

// Simulate a small valid PDF byte stream (just needs to be non-empty)
const fakePdfBytes = [37, 80, 68, 70, 45, 49, 46, 52]; // "%PDF-1.4"

// ---------------------------------------------------------------------------
// generateReportPdf
// ---------------------------------------------------------------------------

describe("fund-payment-match gateway — generateReportPdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: invokes generate_fund_reconciliation_report_pdf with the request and returns a Uint8Array", async () => {
    // bindings.ts wraps the raw invoke result as { status: "ok", data: <result> }
    mockInvoke.mockResolvedValue(fakePdfBytes);

    const request = makeRequest();
    const result = await generateReportPdf(request);

    expect(mockInvoke).toHaveBeenCalledWith("generate_fund_reconciliation_report_pdf", { request });
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(fakePdfBytes.length);
    // Verify byte-for-byte match
    expect(Array.from(result)).toEqual(fakePdfBytes);
  });

  it("error path: backend rejects → function throws with the error message", async () => {
    // bindings.ts catch block surfaces non-Error rejections as { status: "error", error: e }
    const errorMsg = "PdfGenerationFailed: font load error";
    mockInvoke.mockRejectedValue(errorMsg);

    await expect(generateReportPdf(makeRequest())).rejects.toThrow(errorMsg);
    expect(mockInvoke).toHaveBeenCalledWith("generate_fund_reconciliation_report_pdf", {
      request: expect.any(Object),
    });
  });

  it("error path: backend rejects with InvalidRequest message → throws", async () => {
    mockInvoke.mockRejectedValue("InvalidRequest: title is empty");

    await expect(generateReportPdf(makeRequest())).rejects.toThrow(
      "InvalidRequest: title is empty",
    );
  });
});

// ---------------------------------------------------------------------------
// saveReportPdf
// ---------------------------------------------------------------------------

describe("fund-payment-match gateway — saveReportPdf", () => {
  const testBytes = new Uint8Array(fakePdfBytes);
  const defaultFilename = "reconciliation-2025-04-01-to-2025-04-30.pdf";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cancel path: save() returns null → returns {saved: false} and writeFile is not called", async () => {
    mockSave.mockResolvedValue(null);

    const result = await saveReportPdf(testBytes, defaultFilename);

    expect(result).toEqual({ saved: false });
    expect(mockSave).toHaveBeenCalledWith({
      defaultPath: defaultFilename,
      filters: [{ name: "PDF document", extensions: ["pdf"] }],
    });
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("happy path: save() returns a path → writeFile called with path and bytes, returns {saved: true}", async () => {
    const chosenPath = "/home/phil/Documents/reconciliation-2025-04-01-to-2025-04-30.pdf";
    mockSave.mockResolvedValue(chosenPath);
    mockWriteFile.mockResolvedValue(undefined);

    const result = await saveReportPdf(testBytes, defaultFilename);

    expect(result).toEqual({ saved: true });
    expect(mockSave).toHaveBeenCalledWith({
      defaultPath: defaultFilename,
      filters: [{ name: "PDF document", extensions: ["pdf"] }],
    });
    expect(mockWriteFile).toHaveBeenCalledWith(chosenPath, testBytes);
  });

  it("write error path: writeFile throws → error propagates out of saveReportPdf", async () => {
    const chosenPath = "/home/phil/Documents/reconciliation.pdf";
    mockSave.mockResolvedValue(chosenPath);
    mockWriteFile.mockRejectedValue(new Error("Permission denied"));

    await expect(saveReportPdf(testBytes, defaultFilename)).rejects.toThrow("Permission denied");
  });
});

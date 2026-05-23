import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportGenerationRequest } from "@/bindings";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any import of the module under test
// ---------------------------------------------------------------------------

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

vi.mock("@/infra/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks so the mocked module factory runs first)
// ---------------------------------------------------------------------------

import { invoke } from "@tauri-apps/api/core";
import { exportAndOpenReportPdf, generateReportPdf } from "./gateway";

const mockInvoke = vi.mocked(invoke);

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

const fakePdfBytes = [37, 80, 68, 70, 45, 49, 46, 52]; // "%PDF-1.4"

// ---------------------------------------------------------------------------
// generateReportPdf
// ---------------------------------------------------------------------------

describe("fund-payment-match gateway — generateReportPdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: invokes generate_fund_reconciliation_report_pdf with the request and returns a Uint8Array", async () => {
    mockInvoke.mockResolvedValue(fakePdfBytes);

    const request = makeRequest();
    const result = await generateReportPdf(request);

    expect(mockInvoke).toHaveBeenCalledWith("generate_fund_reconciliation_report_pdf", { request });
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(fakePdfBytes.length);
    expect(Array.from(result)).toEqual(fakePdfBytes);
  });

  it("error path: backend rejects → function throws with the error message", async () => {
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
// exportAndOpenReportPdf
// ---------------------------------------------------------------------------

describe("fund-payment-match gateway — exportAndOpenReportPdf", () => {
  const filename = "fund_reconciliation_report_2025-04.pdf";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: invokes export_and_open_fund_reconciliation_report_pdf with the request and filename, returns the absolute path", async () => {
    const savedPath = "/home/phil/Downloads/fund_reconciliation_report_2025-04.pdf";
    mockInvoke.mockResolvedValue(savedPath);

    const request = makeRequest();
    const result = await exportAndOpenReportPdf(request, filename);

    expect(result).toBe(savedPath);
    expect(mockInvoke).toHaveBeenCalledWith("export_and_open_fund_reconciliation_report_pdf", {
      request,
      filename,
    });
  });

  it("error path: backend rejects with WriteFailed → error propagates", async () => {
    mockInvoke.mockRejectedValue("Failed to save PDF: permission_denied");

    await expect(exportAndOpenReportPdf(makeRequest(), filename)).rejects.toThrow(
      "Failed to save PDF: permission_denied",
    );
  });

  it("error path: backend rejects with OpenFailed → error propagates", async () => {
    mockInvoke.mockRejectedValue("Failed to open PDF in system viewer");

    await expect(exportAndOpenReportPdf(makeRequest(), filename)).rejects.toThrow(
      "Failed to open PDF in system viewer",
    );
  });

  it("error path: backend rejects InvalidRequest for a bad filename → error propagates", async () => {
    mockInvoke.mockRejectedValue("Invalid request: Filename contains path separator");

    await expect(exportAndOpenReportPdf(makeRequest(), "bad/name.pdf")).rejects.toThrow(
      "Filename contains path separator",
    );
  });
});

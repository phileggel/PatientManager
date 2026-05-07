/**
 * useReportGeneration hook tests — new gateway-based flow (PR 3)
 *
 * This file replaces the previous window.open-based test suite. The hook
 * now calls gateway.generateReportPdf to produce a PDF byte stream and
 * exposes previewBytes / isGenerating state as specified in FPR-011
 * through FPR-019. Generation failures surface as a toast (FPR-014).
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AutoCorrection, ReconcileAndCandidatesResponse } from "@/bindings";
import {
  mockReportPeriod,
  mockSourceFileName,
  mockUnreconciledProcedures,
  samplePdfBytes,
} from "../shared/__fixtures__/reportFixtures";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../gateway", () => ({
  generateReportPdf: vi.fn(),
  saveReportPdf: vi.fn(),
  extractPdfText: vi.fn(),
  parsePdfText: vi.fn(),
  reconcileAndCreateCandidates: vi.fn(),
  createFundPaymentWithAutoCorrections: vi.fn(),
  getUnreconciledProceduresInRange: vi.fn(),
}));

const mockToastShow = vi.hoisted(() => vi.fn());

vi.mock("@/core/snackbar", () => ({
  toastService: { show: mockToastShow, subscribe: vi.fn(() => vi.fn()) },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: "fr" },
  }),
}));

vi.mock("i18next", () => ({
  default: { language: "fr", t: (k: string) => k },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { logger } from "@/lib/logger";
import * as gateway from "../gateway";
import { useReportGeneration } from "./useReportGeneration";

const mockGenerateReportPdf = vi.mocked(gateway.generateReportPdf);

// ---------------------------------------------------------------------------
// Fixtures (shared with `reportPresenter.test.ts` and the visual proof)
// ---------------------------------------------------------------------------

const mockReconciliationData: ReconcileAndCandidatesResponse = {
  candidates: [],
  reconciliation: { matches: [] },
};

const fakePdfBytes = samplePdfBytes;

const baseArgs = {
  filePath: `/tmp/${mockSourceFileName}`,
  reportDateRange: { start: mockReportPeriod.start, end: mockReportPeriod.end },
  unreconciledReport: mockUnreconciledProcedures,
  autoCorrections: new Map<string, AutoCorrection>(),
  reconciliationData: mockReconciliationData,
  fundIdToLabel: new Map<string, string>(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useReportGeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── FPR-011: handleReport calls the gateway exactly once ─────────────────

  it("handleReport calls gateway.generateReportPdf exactly once (FPR-011)", async () => {
    mockGenerateReportPdf.mockResolvedValue(fakePdfBytes);

    const { result } = renderHook(() => useReportGeneration(baseArgs));

    await act(async () => {
      await result.current.handleReport();
    });

    expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1);
  });

  // ── FPR-011: request payload has all string fields (no raw types) ─────────

  it("dispatched request has non-empty string fields and pre-joined rows (FPR-011, FPR-013, ADR-006)", async () => {
    mockGenerateReportPdf.mockResolvedValue(fakePdfBytes);

    const { result } = renderHook(() => useReportGeneration(baseArgs));

    await act(async () => {
      await result.current.handleReport();
    });

    expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1);
    const [request] = mockGenerateReportPdf.mock.calls[0]!;

    // All top-level string fields must be non-empty
    expect(typeof request.title).toBe("string");
    expect(request.title.length).toBeGreaterThan(0);
    expect(typeof request.page_label).toBe("string");
    expect(request.page_label.length).toBeGreaterThan(0);
    expect(typeof request.continuation_title).toBe("string");
    expect(request.continuation_title.length).toBeGreaterThan(0);

    // header_lines must be a non-empty array of strings
    expect(Array.isArray(request.header_lines)).toBe(true);
    expect(request.header_lines.length).toBeGreaterThan(0);
    for (const line of request.header_lines) {
      expect(typeof line).toBe("string");
    }

    // unreconciled must be the "Rows" variant because mockUnreconciledProcedures is non-empty
    expect(request.unreconciled.type).toBe("Rows");
  });

  it("unreconciled rows variant: unreconciled.type is 'Rows' when unreconciledReport has entries", async () => {
    mockGenerateReportPdf.mockResolvedValue(fakePdfBytes);

    const args = { ...baseArgs, unreconciledReport: mockUnreconciledProcedures };
    const { result } = renderHook(() => useReportGeneration(args));

    await act(async () => {
      await result.current.handleReport();
    });

    const [request] = mockGenerateReportPdf.mock.calls[0]!;
    expect(request.unreconciled.type).toBe("Rows");
    if (request.unreconciled.type === "Rows") {
      expect(request.unreconciled.data.rows.length).toBe(mockUnreconciledProcedures.length);
    }
  });

  it("empty unreconciledReport → request carries unreconciled.type === 'Empty' (FPR-032)", async () => {
    mockGenerateReportPdf.mockResolvedValue(fakePdfBytes);

    const args = { ...baseArgs, unreconciledReport: [] };
    const { result } = renderHook(() => useReportGeneration(args));

    await act(async () => {
      await result.current.handleReport();
    });

    const [request] = mockGenerateReportPdf.mock.calls[0]!;
    expect(request.unreconciled.type).toBe("Empty");
  });

  it("empty autoCorrections Map → request.correction_groups is [] (FPR-040)", async () => {
    mockGenerateReportPdf.mockResolvedValue(fakePdfBytes);

    const args = {
      ...baseArgs,
      autoCorrections: new Map<string, AutoCorrection>(),
    };
    const { result } = renderHook(() => useReportGeneration(args));

    await act(async () => {
      await result.current.handleReport();
    });

    const [request] = mockGenerateReportPdf.mock.calls[0]!;
    expect(request.correction_groups).toEqual([]);
  });

  it("correction_groups are in FPR-041 priority order (ContestAmount first, DateMismatch last)", async () => {
    mockGenerateReportPdf.mockResolvedValue(fakePdfBytes);

    const autoCorrections = new Map<string, AutoCorrection>([
      ["DateMismatch-proc-d", { DateMismatch: { procedure_id: "proc-d", pdf_date: "2025-04-04" } }],
      ["ContestAmount-proc-c", { ContestAmount: { procedure_id: "proc-c", paid_amount: 45000 } }],
    ]);

    const matches = [
      {
        type: "SingleMatchIssue" as const,
        data: {
          pdf_line: {
            line_index: 0,
            payment_date: "2025-05-02",
            invoice_number: "001",
            fund_name: "CPAM 931",
            patient_name: "PATIENT C",
            ssn: "1111111111111",
            nature: "SF",
            procedure_start_date: "2025-04-01",
            procedure_end_date: "2025-04-01",
            is_period: false,
            amount: 50,
          },
          db_match: {
            procedure_id: "proc-c",
            procedure_date: "2025-04-01",
            fund_id: "fund-1" as string | null,
            amount: 50000 as number | null,
            anomalies: [] as import("@/bindings").AnomalyType[],
          },
        },
      },
      {
        type: "SingleMatchIssue" as const,
        data: {
          pdf_line: {
            line_index: 1,
            payment_date: "2025-05-02",
            invoice_number: "002",
            fund_name: "CPAM 931",
            patient_name: "PATIENT D",
            ssn: "2222222222222",
            nature: "SF",
            procedure_start_date: "2025-04-03",
            procedure_end_date: "2025-04-03",
            is_period: false,
            amount: 10,
          },
          db_match: {
            procedure_id: "proc-d",
            procedure_date: "2025-04-03",
            fund_id: "fund-1" as string | null,
            amount: 10000 as number | null,
            anomalies: [] as import("@/bindings").AnomalyType[],
          },
        },
      },
    ];

    const reconciliationData: ReconcileAndCandidatesResponse = {
      candidates: [],
      reconciliation: { matches },
    };

    const args = {
      ...baseArgs,
      autoCorrections,
      reconciliationData,
    };

    const { result } = renderHook(() => useReportGeneration(args));

    await act(async () => {
      await result.current.handleReport();
    });

    const [request] = mockGenerateReportPdf.mock.calls[0]!;
    // ContestAmount (priority 1) must appear before DateMismatch (priority 6)
    expect(request.correction_groups).toHaveLength(2);
    expect(request.correction_groups[0]!.rows[0]).toContain("PATIENT C");
    expect(request.correction_groups[1]!.rows[0]).toContain("PATIENT D");
  });

  // ── FPR-019: isGenerating flips true → false ──────────────────────────────

  it("isGenerating is true while awaiting the gateway and false after it resolves (FPR-019)", async () => {
    let resolveGenerate!: (v: Uint8Array) => void;
    mockGenerateReportPdf.mockReturnValue(
      new Promise<Uint8Array>((r) => {
        resolveGenerate = r;
      }),
    );

    const { result } = renderHook(() => useReportGeneration(baseArgs));

    expect(result.current.isGenerating).toBe(false);

    act(() => {
      void result.current.handleReport();
    });

    // isGenerating should be true while the promise is pending
    await waitFor(() => {
      expect(result.current.isGenerating).toBe(true);
    });

    await act(async () => {
      resolveGenerate(fakePdfBytes);
    });

    await waitFor(() => {
      expect(result.current.isGenerating).toBe(false);
    });
  });

  it("duplicate call guard: second handleReport call while isGenerating=true does not call gateway again (FPR-019)", async () => {
    let resolveFirst!: (v: Uint8Array) => void;
    mockGenerateReportPdf.mockReturnValue(
      new Promise<Uint8Array>((r) => {
        resolveFirst = r;
      }),
    );

    const { result } = renderHook(() => useReportGeneration(baseArgs));

    act(() => {
      void result.current.handleReport();
    });

    await waitFor(() => {
      expect(result.current.isGenerating).toBe(true);
    });

    // Second call while still generating — should be ignored
    await act(async () => {
      await result.current.handleReport();
    });

    expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1);

    // Clean up pending promise
    await act(async () => {
      resolveFirst(fakePdfBytes);
    });
  });

  // ── FPR-015: success → previewBytes set ──────────────────────────────────

  it("success: previewBytes is set to the bytes returned by the gateway (FPR-015)", async () => {
    mockGenerateReportPdf.mockResolvedValue(fakePdfBytes);

    const { result } = renderHook(() => useReportGeneration(baseArgs));

    expect(result.current.previewBytes).toBeNull();

    await act(async () => {
      await result.current.handleReport();
    });

    expect(result.current.previewBytes).toEqual(fakePdfBytes);
  });

  // ── FPR-014: error → toast shown, previewBytes stays null ────────────────

  it("error: gateway throws → error toast is shown, previewBytes stays null (FPR-014)", async () => {
    mockGenerateReportPdf.mockRejectedValue(new Error("PdfGenerationFailed"));

    const { result } = renderHook(() => useReportGeneration(baseArgs));

    await act(async () => {
      await result.current.handleReport();
    });

    expect(mockToastShow).toHaveBeenCalledWith("error", expect.any(String));
    expect(result.current.previewBytes).toBeNull();
  });

  it("error: logger.error is called once when gateway throws (FPR-014)", async () => {
    mockGenerateReportPdf.mockRejectedValue(new Error("PdfGenerationFailed"));

    const { result } = renderHook(() => useReportGeneration(baseArgs));

    await act(async () => {
      await result.current.handleReport();
    });

    expect(vi.mocked(logger.error)).toHaveBeenCalledTimes(1);
  });

  it("error: isGenerating returns to false after a failure so the user can retry (FPR-014, FPR-019)", async () => {
    mockGenerateReportPdf.mockRejectedValue(new Error("PdfGenerationFailed"));

    const { result } = renderHook(() => useReportGeneration(baseArgs));

    await act(async () => {
      await result.current.handleReport();
    });

    expect(result.current.isGenerating).toBe(false);
  });

  // ── FPR-018: closePreview clears previewBytes ─────────────────────────────

  it("closePreview sets previewBytes back to null (FPR-018)", async () => {
    mockGenerateReportPdf.mockResolvedValue(fakePdfBytes);

    const { result } = renderHook(() => useReportGeneration(baseArgs));

    await act(async () => {
      await result.current.handleReport();
    });

    expect(result.current.previewBytes).not.toBeNull();

    act(() => {
      result.current.closePreview();
    });

    expect(result.current.previewBytes).toBeNull();
  });

  // ── defaultFilename ──────────────────────────────────────────────────────

  it("defaultFilename is reconciliation-{start}-to-{end}.pdf with ISO dates (FPR-016)", () => {
    const { result } = renderHook(() => useReportGeneration(baseArgs));

    expect(result.current.defaultFilename).toBe("reconciliation-2026-04-01-to-2026-04-30.pdf");
  });

  it("defaultFilename when reportDateRange is null falls back gracefully", () => {
    const args = { ...baseArgs, reportDateRange: null };
    const { result } = renderHook(() => useReportGeneration(args));

    // Must be a string — content is implementation detail but must not throw
    expect(typeof result.current.defaultFilename).toBe("string");
  });
});

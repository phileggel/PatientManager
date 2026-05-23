/**
 * useReportGeneration hook tests — direct export flow.
 *
 * The hook calls gateway.exportAndOpenReportPdf, which renders the PDF,
 * writes it to the user's Downloads directory under a locale-aware
 * filename, and opens it in the system default PDF viewer.
 * Failures surface as an error toast (FPR-014).
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AutoCorrection, ReconcileAndCandidatesResponse } from "@/bindings";
import {
  mockReportPeriod,
  mockSourceFileName,
  mockUnreconciledProcedures,
} from "../shared/__fixtures__/reportFixtures";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../gateway", () => ({
  exportAndOpenReportPdf: vi.fn(),
  generateReportPdf: vi.fn(),
  extractPdfText: vi.fn(),
  parsePdfText: vi.fn(),
  reconcileAndCreateCandidates: vi.fn(),
  createFundPaymentWithAutoCorrections: vi.fn(),
  getUnreconciledProceduresInRange: vi.fn(),
}));

const mockToastShow = vi.hoisted(() => vi.fn());

vi.mock("@/ui/components/snackbar", () => ({
  toastService: { show: mockToastShow, subscribe: vi.fn(() => vi.fn()) },
}));

vi.mock("@/infra/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

// The hook's filename builder pulls `modal.report.filename.stem` from i18n.
// Returning a deterministic stem per language keeps the assertions readable
// without coupling the test to the real translation files.
const STEM_BY_LANG: Record<string, string> = {
  fr: "rapport_rapprochement_caisse",
  en: "fund_reconciliation_report",
};

let currentLang = "fr";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => {
      if (k === "modal.report.filename.stem") return STEM_BY_LANG[currentLang] ?? k;
      if (k === "modal.report.exportSuccess" && opts && "filename" in opts) {
        return `saved:${String(opts.filename)}`;
      }
      return k;
    },
    i18n: { language: currentLang },
  }),
}));

vi.mock("i18next", () => ({
  default: {
    get language() {
      return currentLang;
    },
    t: (k: string) => k,
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { logger } from "@/infra/logger";
import * as gateway from "../gateway";
import { useReportGeneration } from "./useReportGeneration";

const mockExportAndOpen = vi.mocked(gateway.exportAndOpenReportPdf);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockReconciliationData: ReconcileAndCandidatesResponse = {
  candidates: [],
  reconciliation: { matches: [] },
  already_imported: false,
};

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
    currentLang = "fr";
  });

  // ── FPR-011: handleReport calls the gateway exactly once ─────────────────

  it("handleReport calls gateway.exportAndOpenReportPdf exactly once (FPR-011)", async () => {
    mockExportAndOpen.mockResolvedValue(
      "/home/phil/Downloads/rapport_rapprochement_caisse_2026-04.pdf",
    );

    const { result } = renderHook(() => useReportGeneration(baseArgs));

    await act(async () => {
      await result.current.handleReport();
    });

    expect(mockExportAndOpen).toHaveBeenCalledTimes(1);
  });

  // ── FPR-011, FPR-013, ADR-006: request payload shape ─────────────────────

  it("dispatched request has non-empty string fields and pre-joined rows (FPR-011, FPR-013, ADR-006)", async () => {
    mockExportAndOpen.mockResolvedValue("/home/phil/Downloads/file.pdf");

    const { result } = renderHook(() => useReportGeneration(baseArgs));

    await act(async () => {
      await result.current.handleReport();
    });

    const [request] = mockExportAndOpen.mock.calls[0]!;
    expect(typeof request.title).toBe("string");
    expect(request.title.length).toBeGreaterThan(0);
    expect(typeof request.page_label).toBe("string");
    expect(typeof request.continuation_title).toBe("string");
    expect(Array.isArray(request.header_lines)).toBe(true);
    expect(request.header_lines.length).toBeGreaterThan(0);
    expect(request.unreconciled.type).toBe("Rows");
  });

  it("unreconciled rows variant carries all input rows", async () => {
    mockExportAndOpen.mockResolvedValue("/home/phil/Downloads/file.pdf");

    const args = { ...baseArgs, unreconciledReport: mockUnreconciledProcedures };
    const { result } = renderHook(() => useReportGeneration(args));

    await act(async () => {
      await result.current.handleReport();
    });

    const [request] = mockExportAndOpen.mock.calls[0]!;
    expect(request.unreconciled.type).toBe("Rows");
    if (request.unreconciled.type === "Rows") {
      expect(request.unreconciled.data.rows.length).toBe(mockUnreconciledProcedures.length);
    }
  });

  it("empty unreconciledReport → request carries unreconciled.type === 'Empty' (FPR-032)", async () => {
    mockExportAndOpen.mockResolvedValue("/home/phil/Downloads/file.pdf");

    const args = { ...baseArgs, unreconciledReport: [] };
    const { result } = renderHook(() => useReportGeneration(args));

    await act(async () => {
      await result.current.handleReport();
    });

    const [request] = mockExportAndOpen.mock.calls[0]!;
    expect(request.unreconciled.type).toBe("Empty");
  });

  it("empty autoCorrections Map → request.correction_groups is [] (FPR-040)", async () => {
    mockExportAndOpen.mockResolvedValue("/home/phil/Downloads/file.pdf");

    const args = { ...baseArgs, autoCorrections: new Map<string, AutoCorrection>() };
    const { result } = renderHook(() => useReportGeneration(args));

    await act(async () => {
      await result.current.handleReport();
    });

    const [request] = mockExportAndOpen.mock.calls[0]!;
    expect(request.correction_groups).toEqual([]);
  });

  // ── Locale-aware filename construction ───────────────────────────────────

  it("French locale → filename uses rapport_rapprochement_caisse stem and end-month tag", async () => {
    mockExportAndOpen.mockResolvedValue("/home/phil/Downloads/x.pdf");
    currentLang = "fr";

    const { result } = renderHook(() => useReportGeneration(baseArgs));

    await act(async () => {
      await result.current.handleReport();
    });

    const [, filename] = mockExportAndOpen.mock.calls[0]!;
    expect(filename).toBe(`rapport_rapprochement_caisse_${mockReportPeriod.end.slice(0, 7)}.pdf`);
  });

  it("English locale → filename uses fund_reconciliation_report stem and end-month tag", async () => {
    mockExportAndOpen.mockResolvedValue("/home/phil/Downloads/x.pdf");
    currentLang = "en";

    const { result } = renderHook(() => useReportGeneration(baseArgs));

    await act(async () => {
      await result.current.handleReport();
    });

    const [, filename] = mockExportAndOpen.mock.calls[0]!;
    expect(filename).toBe(`fund_reconciliation_report_${mockReportPeriod.end.slice(0, 7)}.pdf`);
  });

  it("filename month tag is taken from the period end date, not the start", async () => {
    mockExportAndOpen.mockResolvedValue("/home/phil/Downloads/x.pdf");

    const args = {
      ...baseArgs,
      reportDateRange: { start: "2026-04-28", end: "2026-05-03" },
    };
    const { result } = renderHook(() => useReportGeneration(args));

    await act(async () => {
      await result.current.handleReport();
    });

    const [, filename] = mockExportAndOpen.mock.calls[0]!;
    expect(filename).toBe("rapport_rapprochement_caisse_2026-05.pdf");
  });

  // ── FPR-019: isGenerating flips true → false ─────────────────────────────

  it("isGenerating is true while awaiting the gateway and false after it resolves (FPR-019)", async () => {
    let resolveGenerate!: (v: string) => void;
    mockExportAndOpen.mockReturnValue(
      new Promise<string>((r) => {
        resolveGenerate = r;
      }),
    );

    const { result } = renderHook(() => useReportGeneration(baseArgs));

    expect(result.current.isGenerating).toBe(false);

    act(() => {
      void result.current.handleReport();
    });

    await waitFor(() => {
      expect(result.current.isGenerating).toBe(true);
    });

    await act(async () => {
      resolveGenerate("/home/phil/Downloads/x.pdf");
    });

    await waitFor(() => {
      expect(result.current.isGenerating).toBe(false);
    });
  });

  it("duplicate call guard: second handleReport call while isGenerating=true does not call gateway again (FPR-019)", async () => {
    let resolveFirst!: (v: string) => void;
    mockExportAndOpen.mockReturnValue(
      new Promise<string>((r) => {
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

    await act(async () => {
      await result.current.handleReport();
    });

    expect(mockExportAndOpen).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst("/home/phil/Downloads/x.pdf");
    });
  });

  // ── FPR-015: success toast with saved filename ───────────────────────────

  it("success: shows success toast with the saved filename (FPR-015)", async () => {
    const savedPath = "/home/phil/Downloads/rapport_rapprochement_caisse_2026-04.pdf";
    mockExportAndOpen.mockResolvedValue(savedPath);

    const { result } = renderHook(() => useReportGeneration(baseArgs));

    await act(async () => {
      await result.current.handleReport();
    });

    expect(mockToastShow).toHaveBeenCalledWith(
      "success",
      "saved:rapport_rapprochement_caisse_2026-04.pdf",
    );
  });

  it("success toast uses the path leaf (handles backend collision suffix)", async () => {
    mockExportAndOpen.mockResolvedValue(
      "/home/phil/Downloads/rapport_rapprochement_caisse_2026-04 (3).pdf",
    );

    const { result } = renderHook(() => useReportGeneration(baseArgs));

    await act(async () => {
      await result.current.handleReport();
    });

    expect(mockToastShow).toHaveBeenCalledWith(
      "success",
      "saved:rapport_rapprochement_caisse_2026-04 (3).pdf",
    );
  });

  // ── FPR-014: failures surface as a toast and reset the busy flag ─────────

  it("error: gateway throws → error toast is shown (FPR-014)", async () => {
    mockExportAndOpen.mockRejectedValue(new Error("Failed to save PDF: permission_denied"));

    const { result } = renderHook(() => useReportGeneration(baseArgs));

    await act(async () => {
      await result.current.handleReport();
    });

    expect(mockToastShow).toHaveBeenCalledWith("error", "modal.report.error.exportFailed");
  });

  it("error: logger.error is called once when gateway throws (FPR-014)", async () => {
    mockExportAndOpen.mockRejectedValue(new Error("Failed to open PDF in system viewer"));

    const { result } = renderHook(() => useReportGeneration(baseArgs));

    await act(async () => {
      await result.current.handleReport();
    });

    expect(vi.mocked(logger.error)).toHaveBeenCalledTimes(1);
  });

  it("error: isGenerating returns to false after a failure so the user can retry (FPR-014, FPR-019)", async () => {
    mockExportAndOpen.mockRejectedValue(new Error("PdfGenerationFailed"));

    const { result } = renderHook(() => useReportGeneration(baseArgs));

    await act(async () => {
      await result.current.handleReport();
    });

    expect(result.current.isGenerating).toBe(false);
  });

  // ── Guard rails ───────────────────────────────────────────────────────────

  it("guard: handleReport is a no-op when reportDateRange is null (no exporter call, no toast)", async () => {
    const args = { ...baseArgs, reportDateRange: null };
    const { result } = renderHook(() => useReportGeneration(args));

    await act(async () => {
      await result.current.handleReport();
    });

    expect(mockExportAndOpen).not.toHaveBeenCalled();
    expect(mockToastShow).not.toHaveBeenCalled();
  });

  it("guard: handleReport is a no-op when unreconciledReport is null", async () => {
    const args = { ...baseArgs, unreconciledReport: null };
    const { result } = renderHook(() => useReportGeneration(args));

    await act(async () => {
      await result.current.handleReport();
    });

    expect(mockExportAndOpen).not.toHaveBeenCalled();
    expect(mockToastShow).not.toHaveBeenCalled();
  });
});

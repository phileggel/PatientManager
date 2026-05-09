import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { samplePdfBytes, sampleReportRequest } from "../shared/__fixtures__/reportFixtures";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the component
// ---------------------------------------------------------------------------

const mockToastShow = vi.hoisted(() => vi.fn());

vi.mock("@/core/snackbar", () => ({
  toastService: { show: mockToastShow, subscribe: vi.fn(() => vi.fn()) },
}));

vi.mock("../gateway", () => ({
  saveReportPdf: vi.fn(),
  generateReportPdf: vi.fn(),
  extractPdfText: vi.fn(),
  parsePdfText: vi.fn(),
  reconcileAndCreateCandidates: vi.fn(),
  createFundPaymentWithAutoCorrections: vi.fn(),
  getUnreconciledProceduresInRange: vi.fn(),
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

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import * as gateway from "../gateway";
import { ReportPreviewModal } from "./ReportPreviewModal";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakePdfBytes = samplePdfBytes;
const fakeRequest = sampleReportRequest;
const fakeBlobUrl = "blob:http://localhost/fake-pdf-url";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ReportPreviewModal", () => {
  const defaultProps = {
    bytes: fakePdfBytes,
    request: fakeRequest,
    defaultFilename: "reconciliation-2025-04-01-to-2025-04-30.pdf",
    onClose: vi.fn(),
  };

  let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Spy on URL.createObjectURL / URL.revokeObjectURL without replacing
    // the URL constructor — happy-dom's iframe loader needs `new URL(...)`.
    createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue(fakeBlobUrl);
    revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  afterEach(() => {
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });

  // ── Blob URL lifecycle ───────────────────────────────────────────────────

  it("creates a blob URL from bytes on mount and uses it as the iframe src (FPR-015)", () => {
    render(<ReportPreviewModal {...defaultProps} />);

    expect(createObjectURLSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "application/pdf" }),
    );
    const iframeEl = document.querySelector("iframe");
    expect(iframeEl).not.toBeNull();
    expect(iframeEl?.src).toBe(fakeBlobUrl);
  });

  it("revokes the blob URL on unmount to prevent memory leaks", () => {
    const { unmount } = render(<ReportPreviewModal {...defaultProps} />);

    unmount();

    expect(revokeObjectURLSpy).toHaveBeenCalledWith(fakeBlobUrl);
  });

  // ── Save → success ───────────────────────────────────────────────────────

  it("Save button success: calls saveReportPdf, shows success toast, modal stays open (FPR-016)", async () => {
    const user = userEvent.setup();
    vi.mocked(gateway.saveReportPdf).mockResolvedValue({ saved: true });

    render(<ReportPreviewModal {...defaultProps} />);

    const saveButton = screen.getByRole("button", { name: /modal\.preview\.save/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(gateway.saveReportPdf).toHaveBeenCalledWith(fakeRequest, defaultProps.defaultFilename);
    });
    await waitFor(() => {
      expect(mockToastShow).toHaveBeenCalledWith("success", expect.any(String));
    });
    // Modal stays open — onClose not called
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  // ── Save → cancelled ─────────────────────────────────────────────────────

  it("Save button cancel: saveReportPdf returns {saved: false} → no toast, modal stays open (FPR-016)", async () => {
    const user = userEvent.setup();
    vi.mocked(gateway.saveReportPdf).mockResolvedValue({ saved: false });

    render(<ReportPreviewModal {...defaultProps} />);

    const saveButton = screen.getByRole("button", { name: /modal\.preview\.save/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(gateway.saveReportPdf).toHaveBeenCalled();
    });
    // No toast shown for cancel
    expect(mockToastShow).not.toHaveBeenCalled();
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  // ── Save → error ─────────────────────────────────────────────────────────

  it("Save button error: saveReportPdf throws → shows error toast, modal stays open, Save button still clickable (FPR-016)", async () => {
    const user = userEvent.setup();
    vi.mocked(gateway.saveReportPdf).mockRejectedValue(new Error("Write failed"));

    render(<ReportPreviewModal {...defaultProps} />);

    const saveButton = screen.getByRole("button", { name: /modal\.preview\.save/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockToastShow).toHaveBeenCalledWith("error", expect.any(String));
    });
    // Modal stays open — onClose not called
    expect(defaultProps.onClose).not.toHaveBeenCalled();
    // Save button is still present and clickable (not removed from DOM)
    expect(screen.getByRole("button", { name: /modal\.preview\.save/i })).toBeInTheDocument();
  });

  // ── Close ────────────────────────────────────────────────────────────────

  it("Close button calls onClose (FPR-018)", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<ReportPreviewModal {...defaultProps} onClose={onClose} />);

    const closeButton = screen.getByRole("button", { name: /modal\.preview\.close/i });
    await user.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Header X icon button also calls onClose (FPR-018)", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<ReportPreviewModal {...defaultProps} onClose={onClose} />);

    // The X icon button in the header uses `t("modal.header.close")`
    // — the same key used by ReconciliationModal's header close.
    const headerClose = screen.getByRole("button", { name: /modal\.header\.close/i });
    await user.click(headerClose);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../gateway", () => ({
  pickDiagnosticReportPath: vi.fn(),
  generateDiagnosticReport: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { toastService } from "@/ui/components/snackbar";
import * as gateway from "../gateway";
import { useDiagnosticReport } from "./useDiagnosticReport";

describe("useDiagnosticReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("test_dgr_011_proposes_a_dated_txt_file_and_does_nothing_when_cancelled", async () => {
    vi.mocked(gateway.pickDiagnosticReportPath).mockResolvedValue(null);

    const { result } = renderHook(() => useDiagnosticReport());
    await act(() => result.current.generate());

    const [, defaultPath] = vi.mocked(gateway.pickDiagnosticReportPath).mock.calls[0] ?? [];
    expect(defaultPath).toMatch(/^diagnostic-\d{8}\.txt$/);
    expect(gateway.generateDiagnosticReport).not.toHaveBeenCalled();
    expect(result.current.saved).toBeNull();
  });

  it("test_dgr_012_is_generating_while_the_report_is_being_written", async () => {
    vi.mocked(gateway.pickDiagnosticReportPath).mockResolvedValue("/home/me/report.txt");
    let finish: (value: Awaited<ReturnType<typeof gateway.generateDiagnosticReport>>) => void =
      () => {};
    vi.mocked(gateway.generateDiagnosticReport).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );

    const { result } = renderHook(() => useDiagnosticReport());
    let pending: Promise<void> = Promise.resolve();
    await act(async () => {
      pending = result.current.generate();
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.isGenerating).toBe(true));

    await act(async () => {
      finish({ success: true, data: { support_code: "K7QF-2M4X" } });
      await pending;
    });
    expect(result.current.isGenerating).toBe(false);
  });

  it("test_dgr_014_shows_the_file_name_and_the_support_code_once_saved", async () => {
    vi.mocked(gateway.pickDiagnosticReportPath).mockResolvedValue("/home/me/docs/report.txt");
    vi.mocked(gateway.generateDiagnosticReport).mockResolvedValue({
      success: true,
      data: { support_code: "K7QF-2M4X" },
    });

    const { result } = renderHook(() => useDiagnosticReport());
    await act(() => result.current.generate());

    expect(gateway.generateDiagnosticReport).toHaveBeenCalledWith("/home/me/docs/report.txt");
    expect(result.current.saved).toEqual({ fileName: "report.txt", supportCode: "K7QF-2M4X" });
    expect(result.current.isGenerating).toBe(false);
  });

  it("test_dgr_014_reads_the_file_name_of_a_windows_path", async () => {
    vi.mocked(gateway.pickDiagnosticReportPath).mockResolvedValue("C:\\Users\\me\\report.txt");
    vi.mocked(gateway.generateDiagnosticReport).mockResolvedValue({
      success: true,
      data: { support_code: "K7QF-2M4X" },
    });

    const { result } = renderHook(() => useDiagnosticReport());
    await act(() => result.current.generate());

    expect(result.current.saved?.fileName).toBe("report.txt");
  });

  it("test_dgr_014_a_new_attempt_replaces_the_previous_result", async () => {
    vi.mocked(gateway.pickDiagnosticReportPath).mockResolvedValue("/home/me/report.txt");
    vi.mocked(gateway.generateDiagnosticReport).mockResolvedValueOnce({
      success: true,
      data: { support_code: "K7QF-2M4X" },
    });
    vi.mocked(gateway.generateDiagnosticReport).mockResolvedValueOnce({
      success: false,
      error: { code: "ReportFailed" },
    });

    const { result } = renderHook(() => useDiagnosticReport());
    await act(() => result.current.generate());
    expect(result.current.saved).not.toBeNull();
    await act(() => result.current.generate());

    expect(result.current.saved).toBeNull();
  });

  it("test_dgr_015_a_save_dialog_that_fails_becomes_a_toast", async () => {
    vi.mocked(gateway.pickDiagnosticReportPath).mockRejectedValue(new Error("dialog failed"));

    const { result } = renderHook(() => useDiagnosticReport());
    await act(() => result.current.generate());

    expect(toastService.show).toHaveBeenCalledWith("error", "errors.unexpected");
    expect(result.current.isGenerating).toBe(false);
  });

  it("test_dgr_015_a_typed_error_becomes_a_toast_and_nothing_is_shown_as_saved", async () => {
    vi.mocked(gateway.pickDiagnosticReportPath).mockResolvedValue("/home/me/report.txt");
    vi.mocked(gateway.generateDiagnosticReport).mockResolvedValue({
      success: false,
      error: { code: "ReportFailed" },
    });

    const { result } = renderHook(() => useDiagnosticReport());
    await act(() => result.current.generate());

    expect(toastService.show).toHaveBeenCalledWith("error", "db-backup:errors.report_failed");
    expect(result.current.saved).toBeNull();
    expect(result.current.isGenerating).toBe(false);
  });
});

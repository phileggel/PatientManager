import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../gateway", () => ({
  pickStartupFailureReportPath: vi.fn(),
  generateStartupFailureReport: vi.fn(),
  closeApplication: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import * as gateway from "../gateway";
import { useStartupFailurePage } from "./useStartupFailurePage";

describe("useStartupFailurePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("test_dgr_043_proposes_a_dated_txt_file_and_does_nothing_when_cancelled", async () => {
    vi.mocked(gateway.pickStartupFailureReportPath).mockResolvedValue(null);

    const { result } = renderHook(() => useStartupFailurePage());
    await act(() => result.current.exportReport());

    const [, defaultPath] = vi.mocked(gateway.pickStartupFailureReportPath).mock.calls[0] ?? [];
    expect(defaultPath).toMatch(/^startup-failure-\d{8}\.txt$/);
    expect(gateway.generateStartupFailureReport).not.toHaveBeenCalled();
    expect(result.current.saved).toBeNull();
  });

  it("test_dgr_043_a_written_report_gives_its_file_name_and_support_code", async () => {
    vi.mocked(gateway.pickStartupFailureReportPath).mockResolvedValue(
      "C:\\Users\\me\\startup-failure-20261122.txt",
    );
    vi.mocked(gateway.generateStartupFailureReport).mockResolvedValue({
      success: true,
      data: { support_code: "K7QF-2M4X" },
    });

    const { result } = renderHook(() => useStartupFailurePage());
    await act(() => result.current.exportReport());

    expect(result.current.saved).toEqual({
      fileName: "startup-failure-20261122.txt",
      supportCode: "K7QF-2M4X",
    });
    expect(result.current.error).toBeNull();
    expect(result.current.isExporting).toBe(false);
  });

  it("test_dgr_023_a_refused_report_keeps_its_typed_error", async () => {
    vi.mocked(gateway.pickStartupFailureReportPath).mockResolvedValue("/etc/report.txt");
    vi.mocked(gateway.generateStartupFailureReport).mockResolvedValue({
      success: false,
      error: { code: "PathRejected" },
    });

    const { result } = renderHook(() => useStartupFailurePage());
    await act(() => result.current.exportReport());

    expect(result.current.error).toEqual({ code: "PathRejected" });
    expect(result.current.saved).toBeNull();
  });

  it("test_dgr_043_an_unexpected_throw_is_shown_not_swallowed", async () => {
    vi.mocked(gateway.pickStartupFailureReportPath).mockRejectedValue(new Error("ipc down"));

    const { result } = renderHook(() => useStartupFailurePage());
    await act(() => result.current.exportReport());

    expect(result.current.error).toBe("unexpected");
    expect(result.current.isExporting).toBe(false);
  });

  it("closes_the_application", async () => {
    const { result } = renderHook(() => useStartupFailurePage());
    await act(() => result.current.close());

    expect(gateway.closeApplication).toHaveBeenCalledTimes(1);
  });
});

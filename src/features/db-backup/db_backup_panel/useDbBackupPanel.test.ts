import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
  open: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));

vi.mock("../gateway", () => ({
  exportDatabase: vi.fn(),
  importDatabase: vi.fn(),
}));

vi.mock("@/core/snackbar", () => ({
  toastService: { show: vi.fn() },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import * as dialog from "@tauri-apps/plugin-dialog";
import * as process from "@tauri-apps/plugin-process";
import { toastService } from "@/core/snackbar";
import * as gateway from "../gateway";
import { useDbBackupPanel } from "./useDbBackupPanel";

describe("useDbBackupPanel — export flow (R2, R3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not call exportDatabase when save dialog is cancelled", async () => {
    vi.mocked(dialog.save).mockResolvedValue(null);

    const { result } = renderHook(() => useDbBackupPanel());
    await act(() => result.current.handleExport());

    expect(gateway.exportDatabase).not.toHaveBeenCalled();
  });

  it("calls exportDatabase with the chosen path and shows success toast", async () => {
    vi.mocked(dialog.save).mockResolvedValue("/backups/backup.db.gz");
    vi.mocked(gateway.exportDatabase).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDbBackupPanel());
    await act(() => result.current.handleExport());

    expect(gateway.exportDatabase).toHaveBeenCalledWith("/backups/backup.db.gz");
    expect(toastService.show).toHaveBeenCalledWith("success", "export.success");
  });

  it("shows error toast and resets isExporting when export fails", async () => {
    vi.mocked(dialog.save).mockResolvedValue("/backups/backup.db.gz");
    vi.mocked(gateway.exportDatabase).mockRejectedValue(new Error("disk full"));

    const { result } = renderHook(() => useDbBackupPanel());
    await act(() => result.current.handleExport());

    expect(toastService.show).toHaveBeenCalledWith("error", "disk full");
    expect(result.current.isExporting).toBe(false);
  });
});

describe("useDbBackupPanel — import flow (R4, R5, R6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not open confirmation when open dialog is cancelled", async () => {
    vi.mocked(dialog.open).mockResolvedValue(null);

    const { result } = renderHook(() => useDbBackupPanel());
    await act(() => result.current.handleImportRequest());

    expect(result.current.confirmOpen).toBe(false);
  });

  it("opens confirmation dialog after file is selected", async () => {
    vi.mocked(dialog.open).mockResolvedValue("/backups/backup.db.gz");

    const { result } = renderHook(() => useDbBackupPanel());
    await act(() => result.current.handleImportRequest());

    expect(result.current.confirmOpen).toBe(true);
  });

  it("closes confirmation and clears path on cancel", async () => {
    vi.mocked(dialog.open).mockResolvedValue("/backups/backup.db.gz");

    const { result } = renderHook(() => useDbBackupPanel());
    await act(() => result.current.handleImportRequest());
    act(() => result.current.handleImportCancel());

    expect(result.current.confirmOpen).toBe(false);
  });

  it("calls importDatabase and relaunch on confirm success", async () => {
    vi.mocked(dialog.open).mockResolvedValue("/backups/backup.db.gz");
    vi.mocked(gateway.importDatabase).mockResolvedValue(undefined);
    vi.mocked(process.relaunch).mockResolvedValue(undefined);
    vi.useFakeTimers();

    const { result } = renderHook(() => useDbBackupPanel());
    await act(() => result.current.handleImportRequest());
    await act(() => result.current.handleImportConfirm());

    expect(gateway.importDatabase).toHaveBeenCalledWith("/backups/backup.db.gz");
    expect(toastService.show).toHaveBeenCalledWith("success", "import.success");

    await act(() => vi.runAllTimersAsync());
    expect(process.relaunch).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("shows error toast and resets isImporting when import fails", async () => {
    vi.mocked(dialog.open).mockResolvedValue("/backups/backup.db.gz");
    vi.mocked(gateway.importDatabase).mockRejectedValue(new Error("invalid backup"));

    const { result } = renderHook(() => useDbBackupPanel());
    await act(() => result.current.handleImportRequest());
    await act(() => result.current.handleImportConfirm());

    expect(toastService.show).toHaveBeenCalledWith("error", "invalid backup");
    expect(result.current.isImporting).toBe(false);
  });
});

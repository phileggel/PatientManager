import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));

vi.mock("../gateway", () => ({
  pickExportPath: vi.fn(),
  pickImportPath: vi.fn(),
  exportDatabase: vi.fn(),
  importDatabase: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import * as process from "@tauri-apps/plugin-process";
import { getLastFolder, setLastFolder } from "@/features/shell/import_modal/lastFolderStore";
import { toastService } from "@/ui/components/snackbar";
import * as gateway from "../gateway";
import { useDbBackupPanel } from "./useDbBackupPanel";

describe("useDbBackupPanel — export flow (R2, R3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("does not call exportDatabase when save dialog is cancelled", async () => {
    vi.mocked(gateway.pickExportPath).mockResolvedValue(null);

    const { result } = renderHook(() => useDbBackupPanel());
    await act(() => result.current.handleExport());

    expect(gateway.exportDatabase).not.toHaveBeenCalled();
  });

  it("calls exportDatabase with the chosen path and shows success toast", async () => {
    vi.mocked(gateway.pickExportPath).mockResolvedValue("/backups/backup.db.gz");
    vi.mocked(gateway.exportDatabase).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDbBackupPanel());
    await act(() => result.current.handleExport());

    expect(gateway.exportDatabase).toHaveBeenCalledWith("/backups/backup.db.gz");
    expect(toastService.show).toHaveBeenCalledWith("success", "export.success");
  });

  it("shows error toast and resets isExporting when export fails", async () => {
    vi.mocked(gateway.pickExportPath).mockResolvedValue("/backups/backup.db.gz");
    vi.mocked(gateway.exportDatabase).mockRejectedValue(new Error("disk full"));

    const { result } = renderHook(() => useDbBackupPanel());
    await act(() => result.current.handleExport());

    expect(toastService.show).toHaveBeenCalledWith("error", "disk full");
    expect(result.current.isExporting).toBe(false);
  });

  it("seeds pickExportPath with the remembered db-backup folder + timestamped filename", async () => {
    setLastFolder("db-backup", "/saved/folder");
    vi.mocked(gateway.pickExportPath).mockResolvedValue(null);

    const { result } = renderHook(() => useDbBackupPanel());
    await act(() => result.current.handleExport());

    const [, defaultPath] = vi.mocked(gateway.pickExportPath).mock.calls[0]!;
    expect(defaultPath).toMatch(/^\/saved\/folder\/backup_\d{8}_\d{6}\.db\.gz$/);
  });

  it("falls back to filename-only when no folder is remembered", async () => {
    vi.mocked(gateway.pickExportPath).mockResolvedValue(null);

    const { result } = renderHook(() => useDbBackupPanel());
    await act(() => result.current.handleExport());

    const [, defaultPath] = vi.mocked(gateway.pickExportPath).mock.calls[0]!;
    expect(defaultPath).toMatch(/^backup_\d{8}_\d{6}\.db\.gz$/);
  });

  it("persists the parent of the chosen export path to db-backup memory", async () => {
    vi.mocked(gateway.pickExportPath).mockResolvedValue("/new/folder/backup.db.gz");
    vi.mocked(gateway.exportDatabase).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDbBackupPanel());
    await act(() => result.current.handleExport());

    expect(getLastFolder("db-backup")).toBe("/new/folder");
  });
});

describe("useDbBackupPanel — import flow (R4, R5, R6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("does not open confirmation when open dialog is cancelled", async () => {
    vi.mocked(gateway.pickImportPath).mockResolvedValue(null);

    const { result } = renderHook(() => useDbBackupPanel());
    await act(() => result.current.handleImportRequest());

    expect(result.current.confirmOpen).toBe(false);
  });

  it("opens confirmation dialog after file is selected", async () => {
    vi.mocked(gateway.pickImportPath).mockResolvedValue("/backups/backup.db.gz");

    const { result } = renderHook(() => useDbBackupPanel());
    await act(() => result.current.handleImportRequest());

    expect(result.current.confirmOpen).toBe(true);
  });

  it("closes confirmation and clears path on cancel", async () => {
    vi.mocked(gateway.pickImportPath).mockResolvedValue("/backups/backup.db.gz");

    const { result } = renderHook(() => useDbBackupPanel());
    await act(() => result.current.handleImportRequest());
    act(() => result.current.handleImportCancel());

    expect(result.current.confirmOpen).toBe(false);
  });

  it("calls importDatabase and relaunch on confirm success", async () => {
    vi.mocked(gateway.pickImportPath).mockResolvedValue("/backups/backup.db.gz");
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
    vi.mocked(gateway.pickImportPath).mockResolvedValue("/backups/backup.db.gz");
    vi.mocked(gateway.importDatabase).mockRejectedValue(new Error("invalid backup"));

    const { result } = renderHook(() => useDbBackupPanel());
    await act(() => result.current.handleImportRequest());
    await act(() => result.current.handleImportConfirm());

    expect(toastService.show).toHaveBeenCalledWith("error", "invalid backup");
    expect(result.current.isImporting).toBe(false);
  });

  it("seeds pickImportPath with the remembered db-backup folder", async () => {
    setLastFolder("db-backup", "/saved/folder");
    vi.mocked(gateway.pickImportPath).mockResolvedValue(null);

    const { result } = renderHook(() => useDbBackupPanel());
    await act(() => result.current.handleImportRequest());

    expect(gateway.pickImportPath).toHaveBeenCalledWith(expect.any(String), "/saved/folder");
  });

  it("persists the parent of the chosen import path to db-backup memory (shared with export)", async () => {
    vi.mocked(gateway.pickImportPath).mockResolvedValue("/restored/from/backup.db.gz");

    const { result } = renderHook(() => useDbBackupPanel());
    await act(() => result.current.handleImportRequest());

    expect(getLastFolder("db-backup")).toBe("/restored/from");
  });
});

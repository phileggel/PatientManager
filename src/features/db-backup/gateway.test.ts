import { beforeEach, describe, expect, it, vi } from "vitest";

const mockOpen = vi.hoisted(() => vi.fn());
const mockSave = vi.hoisted(() => vi.fn());
const mockExport = vi.hoisted(() => vi.fn());
const mockImport = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mockOpen, save: mockSave }));
vi.mock("@/bindings", () => ({
  commands: { exportDatabase: mockExport, importDatabase: mockImport },
}));
vi.mock("@/infra/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

import { exportDatabase, importDatabase, pickExportPath, pickImportPath } from "./gateway";

describe("db-backup/gateway — pickExportPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as Window).__e2e;
  });

  it("calls save() with the .gz filter and the provided title + default path", async () => {
    mockSave.mockResolvedValue("/tmp/backup.gz");
    const result = await pickExportPath("Export DB", "/home/u/backup.gz");
    expect(mockSave).toHaveBeenCalledWith({
      title: "Export DB",
      defaultPath: "/home/u/backup.gz",
      filters: [{ name: "Database backup", extensions: ["gz"] }],
    });
    expect(result).toBe("/tmp/backup.gz");
  });

  it("returns null when the user cancels", async () => {
    mockSave.mockResolvedValue(null);
    expect(await pickExportPath("Export DB", "/home/u/backup.gz")).toBeNull();
  });

  // ADR-007: e2e override
  it("returns the override and skips save() when window.__e2e.pickExportPath is set", async () => {
    window.__e2e = { pickExportPath: "/fixture/backup.gz" };
    expect(await pickExportPath("t", "/default.gz")).toBe("/fixture/backup.gz");
    expect(mockSave).not.toHaveBeenCalled();
  });
});

describe("db-backup/gateway — pickImportPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as Window).__e2e;
  });

  it("calls open() with the .gz filter and the provided title", async () => {
    mockOpen.mockResolvedValue("/tmp/in.gz");
    const result = await pickImportPath("Import DB");
    expect(mockOpen).toHaveBeenCalledWith({
      title: "Import DB",
      multiple: false,
      filters: [{ name: "Database backup", extensions: ["gz"] }],
    });
    expect(result).toBe("/tmp/in.gz");
  });

  it("returns null when the user cancels", async () => {
    mockOpen.mockResolvedValue(null);
    expect(await pickImportPath("t")).toBeNull();
  });

  it("returns null when open() returns a string array (defensive)", async () => {
    mockOpen.mockResolvedValue(["/tmp/a.gz", "/tmp/b.gz"]);
    expect(await pickImportPath("t")).toBeNull();
  });

  // ADR-007: e2e override
  it("returns the override and skips open() when window.__e2e.pickImportPath is set", async () => {
    window.__e2e = { pickImportPath: "/fixture/in.gz" };
    expect(await pickImportPath("t")).toBe("/fixture/in.gz");
    expect(mockOpen).not.toHaveBeenCalled();
  });
});

// F27: the gateway returns a typed ServiceResult and never throws.
describe("db-backup/gateway — typed ServiceResult pass-through", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exportDatabase ok → { success: true }", async () => {
    mockExport.mockResolvedValue({ status: "ok", data: null });
    expect(await exportDatabase("/tmp/backup.gz")).toEqual({ success: true, data: undefined });
  });

  it("exportDatabase typed error → { success: false, error } (not thrown)", async () => {
    mockExport.mockResolvedValue({ status: "error", error: { code: "ExportFailed" } });
    expect(await exportDatabase("/tmp/backup.gz")).toEqual({
      success: false,
      error: { code: "ExportFailed" },
    });
  });

  it("importDatabase ok → { success: true }", async () => {
    mockImport.mockResolvedValue({ status: "ok", data: null });
    expect(await importDatabase("/tmp/in.gz")).toEqual({ success: true, data: undefined });
  });

  it("importDatabase typed error → { success: false, error } (not thrown)", async () => {
    mockImport.mockResolvedValue({ status: "error", error: { code: "BackupCorrupted" } });
    expect(await importDatabase("/tmp/in.gz")).toEqual({
      success: false,
      error: { code: "BackupCorrupted" },
    });
  });
});

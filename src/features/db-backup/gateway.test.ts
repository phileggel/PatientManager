import { beforeEach, describe, expect, it, vi } from "vitest";

const mockOpen = vi.hoisted(() => vi.fn());
const mockSave = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mockOpen, save: mockSave }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

import { pickExportPath, pickImportPath } from "./gateway";

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

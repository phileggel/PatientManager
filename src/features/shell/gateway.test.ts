import { beforeEach, describe, expect, it, vi } from "vitest";

const mockOpen = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mockOpen }));

import { pickExcelFilePath, pickPdfFilePath } from "./gateway";

describe("shell/gateway — pickExcelFilePath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as Window).__e2e;
  });

  it("calls open() with xlsx/xls/csv filters and the provided title", async () => {
    mockOpen.mockResolvedValue(null);
    await pickExcelFilePath("Select an Excel file");
    expect(mockOpen).toHaveBeenCalledWith({
      title: "Select an Excel file",
      multiple: false,
      filters: [{ name: "Excel Files", extensions: ["xlsx", "xls", "csv"] }],
    });
  });

  it("returns the path when open() resolves with a string", async () => {
    mockOpen.mockResolvedValue("/tmp/data.xlsx");
    expect(await pickExcelFilePath("t")).toBe("/tmp/data.xlsx");
  });

  it("returns null when open() resolves with null (cancelled)", async () => {
    mockOpen.mockResolvedValue(null);
    expect(await pickExcelFilePath("t")).toBeNull();
  });

  it("returns null when open() resolves with a string array (defensive)", async () => {
    mockOpen.mockResolvedValue(["/tmp/a.xlsx", "/tmp/b.xlsx"]);
    expect(await pickExcelFilePath("t")).toBeNull();
  });
});

describe("shell/gateway — pickPdfFilePath", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls open() with pdf filter and the provided title", async () => {
    mockOpen.mockResolvedValue(null);
    await pickPdfFilePath("Select a PDF");
    expect(mockOpen).toHaveBeenCalledWith({
      title: "Select a PDF",
      multiple: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
  });

  it("returns the path when open() resolves with a string", async () => {
    mockOpen.mockResolvedValue("/tmp/statement.pdf");
    expect(await pickPdfFilePath("t")).toBe("/tmp/statement.pdf");
  });

  it("returns null when open() resolves with null (cancelled)", async () => {
    mockOpen.mockResolvedValue(null);
    expect(await pickPdfFilePath("t")).toBeNull();
  });

  it("returns null when open() resolves with a string array (defensive)", async () => {
    mockOpen.mockResolvedValue(["/tmp/a.pdf"]);
    expect(await pickPdfFilePath("t")).toBeNull();
  });
});

// ADR-007: every native-API gateway must route through `e2eOverride`. These
// tests assert the override branch fires (and the real `open()` is bypassed)
// when `window.__e2e[<key>]` is set, and falls through otherwise.
describe("shell/gateway — e2e override", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as Window).__e2e;
  });

  it("pickExcelFilePath returns the override and skips open() when window.__e2e is set", async () => {
    window.__e2e = { pickExcelFilePath: "/fixture/sample.xlsx" };
    expect(await pickExcelFilePath("t")).toBe("/fixture/sample.xlsx");
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it("pickPdfFilePath returns the override and skips open() when window.__e2e is set", async () => {
    window.__e2e = { pickPdfFilePath: "/fixture/sample.pdf" };
    expect(await pickPdfFilePath("t")).toBe("/fixture/sample.pdf");
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it("override of null is honoured (simulates user cancel)", async () => {
    window.__e2e = { pickPdfFilePath: null };
    expect(await pickPdfFilePath("t")).toBeNull();
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it("falls through to open() when window.__e2e is undefined", async () => {
    mockOpen.mockResolvedValue("/real/path.pdf");
    expect(await pickPdfFilePath("t")).toBe("/real/path.pdf");
    expect(mockOpen).toHaveBeenCalledTimes(1);
  });

  it("falls through to open() when the key is absent from window.__e2e", async () => {
    // Override is set for a different key — pickPdfFilePath must still call open().
    window.__e2e = { pickExcelFilePath: "/fixture/wrong.xlsx" };
    mockOpen.mockResolvedValue("/real/path.pdf");
    expect(await pickPdfFilePath("t")).toBe("/real/path.pdf");
    expect(mockOpen).toHaveBeenCalledTimes(1);
  });
});

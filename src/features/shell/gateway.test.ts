import { beforeEach, describe, expect, it, vi } from "vitest";

const mockOpen = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mockOpen }));

import { pickExcelFilePath, pickPdfFilePath } from "./gateway";

describe("shell/gateway — pickExcelFilePath", () => {
  beforeEach(() => vi.clearAllMocks());

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

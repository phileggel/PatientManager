import { afterEach, describe, expect, it, vi } from "vitest";
import { e2eOverride } from "./e2e";

afterEach(() => {
  delete (window as Window).__e2e;
});

describe("e2eOverride", () => {
  it("returns the override and does NOT call real() when the key is set", async () => {
    window.__e2e = { pickPdfFilePath: "/fixture/sample.pdf" };
    const real = vi.fn(async () => "/should/not/be/called");

    const result = await e2eOverride("pickPdfFilePath", real);

    expect(result).toBe("/fixture/sample.pdf");
    expect(real).not.toHaveBeenCalled();
  });

  it("calls real() when window.__e2e is undefined", async () => {
    const real = vi.fn(async () => "/from/real");
    expect(await e2eOverride("pickPdfFilePath", real)).toBe("/from/real");
    expect(real).toHaveBeenCalledTimes(1);
  });

  it("calls real() when the key is absent from window.__e2e", async () => {
    window.__e2e = { pickExcelFilePath: "/other/key.xlsx" };
    const real = vi.fn(async () => "/from/real");
    expect(await e2eOverride("pickPdfFilePath", real)).toBe("/from/real");
    expect(real).toHaveBeenCalledTimes(1);
  });

  it("returns null when the override value is explicitly null (cancel semantics)", async () => {
    window.__e2e = { pickPdfFilePath: null };
    const real = vi.fn(async () => "/should/not/be/called");
    expect(await e2eOverride("pickPdfFilePath", real)).toBeNull();
    expect(real).not.toHaveBeenCalled();
  });
});

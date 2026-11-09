import { afterEach, describe, expect, it, vi } from "vitest";
import { toastService } from "./toastService";

describe("toastService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.__e2e;
  });

  it("tells its listeners outside the E2E build", () => {
    const listener = vi.fn();
    const unsubscribe = toastService.subscribe(listener);

    toastService.show("success", "saved");
    unsubscribe();

    expect(listener).toHaveBeenCalledWith("success", "saved");
  });

  it("hides the snackbars in the E2E build unless a test asks for them", () => {
    vi.stubEnv("MODE", "e2e");
    const listener = vi.fn();
    const unsubscribe = toastService.subscribe(listener);

    toastService.show("success", "hidden");
    window.__e2e = { toasts: true };
    toastService.show("info", "shown");
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("info", "shown");
  });
});

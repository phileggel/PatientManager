import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StartupFailure } from "@/bindings";

const getStartupFailure = vi.hoisted(() => vi.fn<() => Promise<StartupFailure | null>>());
vi.mock("@/features/shell/gateway", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/shell/gateway")>()),
  getStartupFailure,
}));

import App from "./App";

describe("Initial Rendering", () => {
  beforeEach(() => {
    getStartupFailure.mockReset();
  });

  it("should render without crashing (no white screen)", async () => {
    getStartupFailure.mockResolvedValue(null);

    const { container } = render(<App />);

    await waitFor(() => expect(container.innerHTML).not.toBe(""));
    expect(container.firstChild).toBeInTheDocument();
    expect(document.getElementById("startup-failure-page")).toBeNull();
  });

  it("test_dgr_040_a_failed_start_up_opens_the_failure_page_alone", async () => {
    getStartupFailure.mockResolvedValue({
      stage: "migration",
      migration_version: 20261114,
      migration_description: "fund group one bank entry",
      cause: "UNIQUE constraint failed: link.group_id",
      backup_taken: true,
    });

    render(<App />);

    await waitFor(() =>
      expect(document.getElementById("startup-failure-page")).toBeInTheDocument(),
    );
    expect(screen.getByText("UNIQUE constraint failed: link.group_id")).toBeInTheDocument();
  });
});

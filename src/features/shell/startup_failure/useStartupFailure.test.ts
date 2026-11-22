import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StartupFailure } from "@/bindings";

vi.mock("../gateway", () => ({
  getStartupFailure: vi.fn(),
}));

import * as gateway from "../gateway";
import { useStartupFailure } from "./useStartupFailure";

const failure: StartupFailure = {
  stage: "migration",
  migration_version: 20261114,
  migration_description: "fund group one bank entry",
  cause: "UNIQUE constraint failed: link.group_id",
  backup_taken: true,
};

describe("useStartupFailure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("test_dgr_040_a_failed_start_up_is_read_once", async () => {
    vi.mocked(gateway.getStartupFailure).mockResolvedValue(failure);

    const { result } = renderHook(() => useStartupFailure());

    expect(result.current.checking).toBe(true);
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.failure).toEqual(failure);
    expect(gateway.getStartupFailure).toHaveBeenCalledTimes(1);
  });

  it("test_dgr_044_a_start_up_that_succeeded_gives_no_failure", async () => {
    vi.mocked(gateway.getStartupFailure).mockResolvedValue(null);

    const { result } = renderHook(() => useStartupFailure());

    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.failure).toBeNull();
  });

  it("an_unanswered_read_opens_the_application_as_before", async () => {
    vi.mocked(gateway.getStartupFailure).mockRejectedValue(new Error("ipc down"));

    const { result } = renderHook(() => useStartupFailure());

    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.failure).toBeNull();
  });
});

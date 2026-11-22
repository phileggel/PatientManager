import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StartupFailure } from "@/bindings";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../useUpdater", () => ({
  useUpdater: vi.fn(),
}));

vi.mock("./useStartupFailurePage", () => ({
  useStartupFailurePage: () => ({
    isExporting: false,
    saved: null,
    error: null,
    exportReport: vi.fn(),
    close: vi.fn(),
  }),
}));

import { useUpdater } from "../useUpdater";
import { StartupFailurePage } from "./StartupFailurePage";

const failure: StartupFailure = {
  stage: "migration",
  migration_version: 20261114,
  migration_description: "fund group one bank entry",
  cause: "UNIQUE constraint failed: link.group_id",
  backup_taken: true,
};

describe("StartupFailurePage", () => {
  beforeEach(() => {
    vi.mocked(useUpdater).mockReturnValue({ state: "idle", version: null, install: vi.fn() });
  });

  it("test_dgr_041_says_what_failed_and_that_the_backup_was_taken", () => {
    render(<StartupFailurePage failure={failure} />);

    expect(screen.getByText("startup_failure.title_upgrade")).toBeTruthy();
    expect(screen.getByText(/startup_failure\.backup/)).toBeTruthy();
    expect(screen.getByText("UNIQUE constraint failed: link.group_id")).toBeTruthy();
  });

  it("test_dgr_042_no_backup_sentence_when_none_was_taken", () => {
    render(<StartupFailurePage failure={{ ...failure, backup_taken: false }} />);

    expect(screen.queryByText(/startup_failure\.backup/)).toBeNull();
  });

  it("offers_the_update_when_a_newer_version_exists", () => {
    vi.mocked(useUpdater).mockReturnValue({
      state: "available",
      version: "0.31.1",
      install: vi.fn(),
    });

    render(<StartupFailurePage failure={failure} />);

    expect(screen.getByText("updater.install")).toBeTruthy();
  });
});

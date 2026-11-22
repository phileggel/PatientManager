import { describe, expect, it } from "vitest";
import type { StartupFailure } from "@/bindings";
import {
  presentStartupFailureStep,
  presentStartupFailureTitle,
  presentStartupReportError,
} from "./presenter";

const migration: StartupFailure = {
  stage: "migration",
  migration_version: 20261114,
  migration_description: "fund group one bank entry",
  cause: "UNIQUE constraint failed: link.group_id",
  backup_taken: true,
};

describe("startup failure presenter", () => {
  it("test_dgr_040_an_upgrade_stage_reads_as_a_failed_upgrade", () => {
    for (const stage of ["backup", "checksum_repair", "repair", "migration"] as const) {
      expect(presentStartupFailureTitle({ ...migration, stage })).toBe(
        "startup_failure.title_upgrade",
      );
    }
  });

  it("test_dgr_045_any_other_stage_reads_as_a_failed_start_up", () => {
    for (const stage of ["pending_import", "open", "other"] as const) {
      expect(presentStartupFailureTitle({ ...migration, stage })).toBe(
        "startup_failure.title_start",
      );
    }
  });

  it("test_dgr_041_a_migration_is_named_by_its_version_and_description", () => {
    expect(presentStartupFailureStep(migration)).toEqual({
      key: "startup_failure.step.migration",
      params: { version: 20261114, description: "fund group one bank entry" },
    });
  });

  it("test_dgr_041_a_migration_sqlx_did_not_name_reads_as_its_stage", () => {
    expect(presentStartupFailureStep({ ...migration, migration_version: null })).toEqual({
      key: "startup_failure.stage.migration",
    });
    expect(presentStartupFailureStep({ ...migration, stage: "open" })).toEqual({
      key: "startup_failure.stage.open",
    });
  });

  it("test_dgr_026_dgr_023_dgr_025_each_report_error_has_its_message", () => {
    expect(presentStartupReportError({ code: "HomeUnresolved" })).toBe(
      "startup_failure.errors.home_unresolved",
    );
    expect(presentStartupReportError({ code: "PathRejected" })).toBe(
      "startup_failure.errors.path_rejected",
    );
    expect(presentStartupReportError({ code: "ReportFailed" })).toBe(
      "startup_failure.errors.report_failed",
    );
    expect(presentStartupReportError({ code: "NoStartupFailure" })).toBe(
      "startup_failure.errors.no_startup_failure",
    );
    expect(presentStartupReportError("unexpected")).toBe("startup_failure.errors.unexpected");
  });
});

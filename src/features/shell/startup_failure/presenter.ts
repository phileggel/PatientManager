import type { DiagnosticReportError, StartupFailure } from "@/bindings";

/** An i18n key and its parameters. */
export interface Message {
  key: string;
  params?: Record<string, string | number>;
}

/** DGR-040, DGR-045 — the page's title: an upgrade that failed, or a start-up that failed. */
export function presentStartupFailureTitle(failure: StartupFailure): string {
  switch (failure.stage) {
    case "backup":
    case "checksum_repair":
    case "repair":
    case "migration":
      return "startup_failure.title_upgrade";
    case "pending_import":
    case "open":
    case "other":
      return "startup_failure.title_start";
  }
}

/** DGR-041 — the failed step, the migration's version and description when known. */
export function presentStartupFailureStep(failure: StartupFailure): Message {
  if (failure.stage === "migration" && failure.migration_version !== null) {
    return {
      key: "startup_failure.step.migration",
      params: {
        version: failure.migration_version,
        description: failure.migration_description ?? "",
      },
    };
  }
  return { key: `startup_failure.stage.${failure.stage}` };
}

/** F27 — the failure report's error as an i18n key; `unexpected` is a throw the hook caught. */
export function presentStartupReportError(error: DiagnosticReportError | "unexpected"): string {
  if (error === "unexpected") return "startup_failure.errors.unexpected";
  switch (error.code) {
    case "HomeUnresolved":
      return "startup_failure.errors.home_unresolved";
    case "PathRejected":
      return "startup_failure.errors.path_rejected";
    case "ReportFailed":
      return "startup_failure.errors.report_failed";
    case "NoStartupFailure":
      return "startup_failure.errors.no_startup_failure";
  }
}

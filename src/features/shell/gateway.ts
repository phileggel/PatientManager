import { open, save } from "@tauri-apps/plugin-dialog";
import { exit } from "@tauri-apps/plugin-process";
import {
  commands,
  type DiagnosticReportError,
  type DiagnosticReportResult,
  type StartupFailure,
} from "@/bindings";
import { logger } from "@/infra/logger";
import { e2eOverride } from "@/lib/e2e";
import type { ServiceResult } from "@/types/api";

// ── Native file-picker dialogs ────────────────────────────────────────────────

function toPathOrNull(result: string | string[] | null): string | null {
  return typeof result === "string" ? result : null;
}

export async function pickExcelFilePath(
  title: string,
  defaultPath?: string,
): Promise<string | null> {
  return e2eOverride("pickExcelFilePath", async () =>
    toPathOrNull(
      await open({
        title,
        multiple: false,
        defaultPath,
        filters: [{ name: "Excel Files", extensions: ["xlsx"] }],
      }),
    ),
  );
}

export async function pickPdfFilePath(title: string, defaultPath?: string): Promise<string | null> {
  return e2eOverride("pickPdfFilePath", async () =>
    toPathOrNull(
      await open({
        title,
        multiple: false,
        defaultPath,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      }),
    ),
  );
}

// ── Start-up failure (DGR-040 to DGR-045) ────────────────────────────────────

/** DGR-041, DGR-044 — what failed at start-up, or `null` when the start-up succeeded. */
export async function getStartupFailure(): Promise<StartupFailure | null> {
  return commands.getStartupFailure();
}

/** Where to save the start-up failure report. */
export async function pickStartupFailureReportPath(
  title: string,
  defaultPath: string,
): Promise<string | null> {
  return e2eOverride("pickStartupFailureReportPath", async () =>
    save({
      title,
      defaultPath,
      filters: [{ name: "Report", extensions: ["txt"] }],
    }),
  );
}

/**
 * DGR-043 — writes the failure report to `destPath` and returns its support code.
 *
 * @returns the typed error on failure (F27 pass-through — never throws).
 */
export async function generateStartupFailureReport(
  destPath: string,
): Promise<ServiceResult<DiagnosticReportResult, DiagnosticReportError>> {
  logger.info("[shell] generateStartupFailureReport");
  const result = await commands.generateStartupFailureReport(destPath);
  if (result.status === "error") {
    logger.error("[shell] generateStartupFailureReport failed", { error: result.error });
    return { success: false, error: result.error };
  }
  return { success: true, data: result.data };
}

/** Closes the application from the start-up failure page. */
export async function closeApplication(): Promise<void> {
  await exit(0);
}

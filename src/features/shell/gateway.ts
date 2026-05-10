import { open } from "@tauri-apps/plugin-dialog";
import { e2eOverride } from "@/lib/e2e";

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
        filters: [{ name: "Excel Files", extensions: ["xlsx", "xls", "csv"] }],
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

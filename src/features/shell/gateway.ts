import { open } from "@tauri-apps/plugin-dialog";

// ── Native file-picker dialogs ────────────────────────────────────────────────

function toPathOrNull(result: string | string[] | null): string | null {
  return typeof result === "string" ? result : null;
}

export async function pickExcelFilePath(title: string): Promise<string | null> {
  return toPathOrNull(
    await open({
      title,
      multiple: false,
      filters: [{ name: "Excel Files", extensions: ["xlsx", "xls", "csv"] }],
    }),
  );
}

export async function pickPdfFilePath(title: string): Promise<string | null> {
  return toPathOrNull(
    await open({
      title,
      multiple: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    }),
  );
}

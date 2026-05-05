import { open } from "@tauri-apps/plugin-dialog";

// ── Native file-picker dialogs ────────────────────────────────────────────────

export async function pickExcelFilePath(): Promise<string | null> {
  const result = await open({
    multiple: false,
    filters: [{ name: "Excel Files", extensions: ["xlsx", "xls", "csv"] }],
  });
  return typeof result === "string" ? result : null;
}

export async function pickPdfFilePath(): Promise<string | null> {
  const result = await open({
    multiple: false,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  return typeof result === "string" ? result : null;
}

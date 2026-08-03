/**
 * BAS-118B — global app settings, persisted per device in localStorage.
 * Storage conventions mirror `theme-mode` (useThemeToggle) and
 * `lastFolderStore`: one plain value per key, defensive read, validated write.
 */

export const PROCEDURE_WINDOW_STORAGE_KEY = "settings:procedure-window-days";
export const DEFAULT_PROCEDURE_WINDOW_DAYS = 90;

function isValidWindow(days: number): boolean {
  return Number.isInteger(days) && days > 0;
}

/** The bank-reconciliation procedure display window, in days (BAS-118). */
export function getProcedureWindowDays(): number {
  const raw = localStorage.getItem(PROCEDURE_WINDOW_STORAGE_KEY);
  if (raw === null) return DEFAULT_PROCEDURE_WINDOW_DAYS;
  const parsed = Number(raw);
  return isValidWindow(parsed) ? parsed : DEFAULT_PROCEDURE_WINDOW_DAYS;
}

/** Persists the window; an invalid value is rejected, never stored. */
export function setProcedureWindowDays(days: number): void {
  if (!isValidWindow(days)) return;
  localStorage.setItem(PROCEDURE_WINDOW_STORAGE_KEY, String(days));
}

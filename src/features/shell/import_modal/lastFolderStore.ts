/**
 * Per-feature memory of the last folder a user picked an import file from.
 * Each kind is stored under its own localStorage key so the three import flows
 * (Excel, fund PDF, bank PDF) don't share a default path.
 *
 * Storage format mirrors `theme-mode` (see `useThemeToggle.ts`): a plain
 * string value per key, set only when the user successfully picks a file.
 */

export type ImportKind = "excel" | "fund-pdf" | "bank-pdf";

const STORAGE_PREFIX = "import-last-folder:";

function storageKey(kind: ImportKind): string {
  return `${STORAGE_PREFIX}${kind}`;
}

export function getLastFolder(kind: ImportKind): string | undefined {
  const value = localStorage.getItem(storageKey(kind));
  return value ?? undefined;
}

export function setLastFolder(kind: ImportKind, folder: string): void {
  if (folder.length === 0) return;
  localStorage.setItem(storageKey(kind), folder);
}

/**
 * Extracts the parent directory of a file path. Handles both POSIX (`/`) and
 * Windows (`\`) separators. Returns `undefined` for paths that have no
 * useful parent component — a bare filename, a POSIX root file like `/foo`,
 * or a Windows drive-root file like `C:\foo` (where the only parent is `C:`,
 * not a real folder we'd want to surface as a remembered import location).
 */
export function parentDir(path: string): string | undefined {
  const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (lastSlash <= 0) return undefined;
  const parent = path.slice(0, lastSlash);
  // Bare Windows drive letter ("C:") is not a remembered folder — drop it.
  if (/^[A-Za-z]:$/.test(parent)) return undefined;
  return parent;
}

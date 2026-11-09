/**
 * toastService - Module-level singleton for toast notifications.
 *
 * Observer pattern: any module (hook, service, callback) can call
 * toastService.show() without threading props through the component tree.
 * The useSnackbar hook subscribes at mount and drives rendering.
 */

declare global {
  interface Window {
    /** `true` shows the snackbars in the E2E build, which hides them (docs/e2e-rules.md E11). */
    __e2eSnackbars?: boolean;
  }
}

/** The E2E build hides the snackbars unless a test asks; folds to `false` elsewhere. */
function snackbarsHiddenForE2e(): boolean {
  return import.meta.env.MODE === "e2e" && window.__e2eSnackbars !== true;
}

export type SnackbarType = "success" | "error" | "info" | "warning";

type Listener = (type: SnackbarType, message: string) => void;

const listeners = new Set<Listener>();

export const toastService = {
  show(type: SnackbarType, message: string) {
    if (snackbarsHiddenForE2e()) return;
    for (const fn of listeners) {
      fn(type, message);
    }
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

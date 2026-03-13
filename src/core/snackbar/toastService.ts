/**
 * toastService - Module-level singleton for toast notifications.
 *
 * Observer pattern: any module (hook, service, callback) can call
 * toastService.show() without threading props through the component tree.
 * The useSnackbar hook subscribes at mount and drives rendering.
 */

export type SnackbarType = "success" | "error" | "info" | "warning";

type Listener = (type: SnackbarType, message: string) => void;

const listeners = new Set<Listener>();

export const toastService = {
  show(type: SnackbarType, message: string) {
    for (const fn of listeners) {
      fn(type, message);
    }
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

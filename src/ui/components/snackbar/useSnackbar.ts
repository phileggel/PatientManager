import { useCallback, useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import { type SnackbarType, toastService } from "./toastService";

export type { SnackbarType };

export interface Snackbar {
  id: string;
  type: SnackbarType;
  message: string;
}

interface UseSnackbarReturn {
  snackbars: Snackbar[];
  dismissSnackbar: (id: string) => void;
  /** @deprecated Use toastService.show() directly instead */
  showSnackbar: (type: SnackbarType, message: string) => void;
}

const AUTO_DISMISS_TIMEOUT = 5000;

/**
 * useSnackbar - Subscribes to toastService and manages the snackbar queue.
 *
 * Mount this once at the app root (App.tsx) to render snackbars.
 * Any module can call toastService.show() to trigger a notification.
 */
export function useSnackbar(): UseSnackbarReturn {
  const [snackbars, setSnackbars] = useState<Snackbar[]>([]);

  const addSnackbar = useCallback((type: SnackbarType, message: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    logger.debug("Showing snackbar", { type, message });
    setSnackbars((prev) => [...prev, { id, type, message }]);
  }, []);

  const dismissSnackbar = useCallback((id: string) => {
    logger.debug("Dismissing snackbar", { id });
    setSnackbars((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // Subscribe to the singleton on mount
  useEffect(() => {
    return toastService.subscribe(addSnackbar);
  }, [addSnackbar]);

  // Auto-dismiss after timeout
  useEffect(() => {
    if (snackbars.length === 0) return;
    const latest = snackbars[snackbars.length - 1];
    if (!latest) return;
    const timer = setTimeout(() => dismissSnackbar(latest.id), AUTO_DISMISS_TIMEOUT);
    return () => clearTimeout(timer);
  }, [snackbars, dismissSnackbar]);

  return { snackbars, dismissSnackbar, showSnackbar: toastService.show.bind(toastService) };
}

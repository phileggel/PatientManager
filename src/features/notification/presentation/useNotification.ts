import { useCallback, useEffect, useState } from "react";
import { logger } from "@/lib/logger";

/**
 * Notification types for the bottom bar notification system
 */
export type NotificationType = "success" | "error" | "info" | "warning";

/**
 * Notification data structure
 */
export interface Notification {
  type: NotificationType;
  message: string;
}

/**
 * Hook return type for useNotification
 */
interface UseNotificationReturn {
  notification: Notification | null;
  showNotification: (type: NotificationType, message: string) => void;
}

const AUTO_DISMISS_TIMEOUT = 5000; // 5 seconds

/**
 * Custom hook to manage notification system
 *
 * @returns {UseNotificationReturn} Object with current notification and showNotification function
 *
 * @example
 * const { notification, showNotification } = useNotification()
 *
 * // Show success notification (auto-dismisses after 5s)
 * showNotification('success', 'Patient added successfully!')
 *
 * // Show error notification
 * showNotification('error', 'Failed to save patient')
 *
 * // Render the notification in your component
 * <BottomBar type={notification?.type || null} message={notification?.message || null} />
 */
export function useNotification(): UseNotificationReturn {
  const [notification, setNotification] = useState<Notification | null>(null);

  const dismissNotification = useCallback(() => {
    logger.debug("Dismissing notification");
    setNotification(null);
  }, []);

  const showNotification = useCallback((type: NotificationType, message: string) => {
    logger.debug("Showing notification", { type, message });
    setNotification({ type, message });
  }, []);

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    if (!notification) return;

    const timer = setTimeout(dismissNotification, AUTO_DISMISS_TIMEOUT);
    return () => clearTimeout(timer);
  }, [notification, dismissNotification]);

  return { notification, showNotification };
}

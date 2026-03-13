import { AlertCircle, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { useEffect } from "react";
import { logger } from "@/lib/logger";

import type { NotificationType } from "./useNotification";

interface BottomBarProps {
  type: NotificationType | null;
  message: string | null;
}

const iconMap: Record<NotificationType, React.ReactNode> = {
  success: <CheckCircle size={20} />,
  error: <AlertCircle size={20} />,
  info: <Info size={20} />,
  warning: <AlertTriangle size={20} />,
};

export function BottomBar({ type, message }: BottomBarProps) {
  useEffect(() => {
    logger.info("[BottomBar] Component mounted");
  }, []);

  const hasMessage = type && message;

  return (
    <div
      className="
        fixed bottom-0 left-0 right-0
        min-h-12 bg-primary-60 px-6 py-3
        shadow-elevation-3 flex items-center z-[50]
      "
      role={hasMessage ? "alert" : "status"}
    >
      {hasMessage && type && (
        <div className="flex items-center gap-3">
          <div className="shrink-0 flex items-center justify-center text-white">
            {iconMap[type]}
          </div>
          <p className="m-0 text-base leading-6 font-normal text-white">{message}</p>
        </div>
      )}
    </div>
  );
}

import { AlertCircle, CheckCircle, Info, X } from "lucide-react";
import type { SnackbarType } from "./useSnackbar";

interface SnackbarProps {
  type: SnackbarType;
  message: string;
  onDismiss: () => void;
}

/**
 * Snackbar Light Color Palette
 * Clean, simple colors for notification feedback
 */
const colorMap: Record<SnackbarType, { bgVar: string; textVar: string }> = {
  success: {
    bgVar: "--color-snackbar-success-bg",
    textVar: "--color-snackbar-success-text",
  },
  error: {
    bgVar: "--color-snackbar-error-bg",
    textVar: "--color-snackbar-error-text",
  },
  info: {
    bgVar: "--color-snackbar-info-bg",
    textVar: "--color-snackbar-info-text",
  },
  warning: {
    bgVar: "--color-snackbar-warning-bg",
    textVar: "--color-snackbar-warning-text",
  },
};

const iconMap: Record<SnackbarType, React.ReactNode> = {
  success: <CheckCircle size={20} />,
  error: <AlertCircle size={20} />,
  info: <Info size={20} />,
  warning: <AlertCircle size={20} />,
};

export function Snackbar({ type, message, onDismiss }: SnackbarProps) {
  const colors = colorMap[type];

  return (
    <div
      style={{
        backgroundColor: `var(${colors.bgVar})`,
        color: `var(${colors.textVar})`,
      }}
      className="rounded-lg px-4 py-3 flex items-center gap-3 animate-slide-in-from-bottom"
      role="alert"
    >
      <div className="shrink-0">{iconMap[type]}</div>
      <p className="flex-1 text-sm font-medium">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="hover:opacity-70 p-1 shrink-0 transition-opacity"
        aria-label="Dismiss notification"
      >
        <X size={18} />
      </button>
    </div>
  );
}

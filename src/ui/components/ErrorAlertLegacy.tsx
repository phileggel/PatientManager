import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "./button";

export type AlertVariant = "error" | "warning" | "info" | "success";

interface ErrorAlertLegacyProps {
  /**
   * Alert variant determines styling and color
   */
  variant?: AlertVariant;

  /**
   * Main error/message text
   */
  message: string;

  /**
   * Optional detailed description or error details
   */
  description?: string;

  /**
   * Show dismiss button
   */
  dismissible?: boolean;

  /**
   * Callback when dismiss button is clicked
   */
  onDismiss?: () => void;

  /**
   * Show retry button with callback
   */
  onRetry?: () => void;

  /**
   * Custom label for retry button
   */
  retryLabel?: string;
}

const variantStyles: Record<
  AlertVariant,
  { bg: string; border: string; text: string; icon: string }
> = {
  error: {
    bg: "bg-error-20",
    border: "border-error-30",
    text: "text-error-70",
    icon: "text-error-60",
  },
  warning: {
    bg: "bg-warning-20",
    border: "border-warning-30",
    text: "text-warning-90",
    icon: "text-warning-70",
  },
  info: {
    bg: "bg-primary-10",
    border: "border-primary-20",
    text: "text-primary-60",
    icon: "text-primary-50",
  },
  success: {
    bg: "bg-success-10",
    border: "border-success-30",
    text: "text-success-70",
    icon: "text-success-60",
  },
};

/**
 * ErrorAlertLegacy - Deprecated Component
 *
 * DEPRECATED: Review usage and decide on refactoring approach.
 * Uses custom alert styling and needs evaluation for M3 alignment.
 *
 * TODO: Review consumers and determine if replacement or refactoring needed.
 * Consumers:
 * - src/features/excel-import/presentation/ImportExcelPage.tsx
 *
 * This component exists only for backward compatibility during refactoring.
 *
 * @example
 * <ErrorAlertLegacy
 *   variant="error"
 *   message="Import failed"
 *   description="Check file format and try again"
 *   onRetry={() => retryImport()}
 *   onDismiss={() => setError(null)}
 *   dismissible
 * />
 */
export function ErrorAlertLegacy({
  variant = "error",
  message,
  description,
  dismissible = true,
  onDismiss,
  onRetry,
  retryLabel = "Retry",
}: ErrorAlertLegacyProps) {
  const { t } = useTranslation("common");
  const styles = variantStyles[variant];

  return (
    <div
      className={`rounded border p-4 ${styles.bg} ${styles.border}`}
      role="alert"
      aria-live="polite"
      aria-label={`${variant} alert: ${message}`}
    >
      <div className="flex items-start gap-3">
        {/* Alert icon */}
        <div className={`mt-0.5 shrink-0 ${styles.icon}`} aria-hidden="true">
          {variant === "error" && <span className="font-bold">⚠</span>}
          {variant === "warning" && <span className="font-bold">!</span>}
          {variant === "info" && <span className="font-bold">ℹ</span>}
          {variant === "success" && <span className="font-bold">✓</span>}
        </div>

        {/* Message content */}
        <div className="flex-1">
          <p className={`font-medium ${styles.text}`}>{message}</p>
          {description && <p className={`mt-1 text-sm ${styles.text} opacity-90`}>{description}</p>}
        </div>

        {/* Dismiss button */}
        {dismissible && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className={`shrink-0 ${styles.text} hover:opacity-70`}
            aria-label={t("action.dismiss")}
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* Action buttons */}
      {(onRetry || (dismissible && onDismiss)) && (
        <div className="mt-3 flex gap-2">
          {onRetry && <Button onClick={onRetry}>{retryLabel}</Button>}
          {dismissible && onDismiss && (
            <Button variant="secondary" onClick={onDismiss}>
              {t("action.dismiss")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

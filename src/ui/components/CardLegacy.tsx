import type { ReactNode } from "react";

interface CardLegacyProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

/**
 * CardLegacy - Deprecated Component
 *
 * DEPRECATED: This component uses outdated styling (neutral-30/90 colors) instead of M3 design tokens.
 *
 * TODO: Review usage and refactor consumers to use modern M3 components or create M3-based Card replacement.
 * Consumers:
 * - src/features/bank-transfer/presentation/BankTransferForm.tsx
 * - src/features/procedure/ui/ProcedureForm.tsx
 * - src/features/fund-payment/add_fund_payment_panel/AddFundPaymentPanel.tsx
 *
 * This component exists only for backward compatibility during refactoring.
 */
export function CardLegacy({ title, children, className = "" }: CardLegacyProps) {
  return (
    <div
      className={`
        flex flex-col
        h-full max-h-full
        overflow-hidden
        bg-neutral-30
        border border-neutral-30 rounded-lg
        pb-6 px-6
        shadow-elevation-1
        transition-all duration-300 ease-out
        ${className}
      `}
    >
      {title && <h2 className="shrink-0 p-4">{title}</h2>}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto text-neutral-90">{children}</div>
    </div>
  );
}

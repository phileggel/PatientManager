import type { BankStatementCreditLine } from "@/bindings";
import { useFormatters } from "@/ui/format/formatters";

interface LineContextHeaderProps {
  /** Host-scoped id, e.g. `link-fund-modal-context` (F25). */
  id: string;
  creditLine: BankStatementCreditLine;
}

/**
 * BAS-110 — the bank line being corrected, as `date · amount · raw label` on a
 * single line. The raw label renders muted-italic (the same treatment the
 * unified list gives unlinked labels) so it is never mistaken for a fund name;
 * an over-long label truncates with an ellipsis rather than wrapping. The
 * `mb-4` bottom margin is the dedicated separation from the resolution
 * controls (wireframe review 2026-07-31).
 */
export function LineContextHeader({ id, creditLine }: LineContextHeaderProps) {
  const { formatCurrency, formatDate } = useFormatters();

  return (
    <p id={id} className="mb-4 flex min-w-0 items-baseline gap-2 text-sm text-m3-on-surface">
      <span className="shrink-0">{formatDate(creditLine.date)}</span>
      <span className="shrink-0 font-medium">{formatCurrency(creditLine.amount)}</span>
      <span className="min-w-0 truncate italic text-m3-on-surface-variant">{creditLine.label}</span>
    </p>
  );
}

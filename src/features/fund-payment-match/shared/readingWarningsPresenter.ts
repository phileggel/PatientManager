import type { PdfParseResult } from "@/bindings";

/** FPA-020 — a group whose stated total is not the sum of its lines. */
export interface MismatchedGroup {
  fundLabel: string;
  paymentDate: string;
  statedTotal: number;
  linesSum: number;
}

/** FPA-020, FPA-030 — what of the fund's PDF statement could not be read. */
export interface ReadingWarnings {
  mismatched: MismatchedGroup[];
  unparsedCount: number;
  samples: string[];
}

/** The warnings of a parsed statement, in the order of the PDF; `null` when there is none. */
export function toReadingWarnings(parsed: PdfParseResult | null): ReadingWarnings | null {
  if (!parsed) return null;
  const mismatched = parsed.groups
    .filter((group) => !group.is_total_valid)
    .map((group) => ({
      fundLabel: group.fund_label,
      paymentDate: group.payment_date,
      statedTotal: group.total_amount,
      linesSum: group.lines_total,
    }));
  if (mismatched.length === 0 && parsed.unparsed_line_count === 0) return null;
  return {
    mismatched,
    unparsedCount: parsed.unparsed_line_count,
    samples: parsed.unparsed_lines.slice(0, 5),
  };
}

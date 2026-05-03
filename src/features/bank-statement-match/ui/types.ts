import type { ResolvedCreditLine } from "@/bindings";

export interface IdentifiableCreditLine extends ResolvedCreditLine {
  lineId: string;
}

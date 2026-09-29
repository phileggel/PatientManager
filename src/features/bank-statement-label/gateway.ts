import {
  type BankFundLabelMapping,
  type BankStatementReconciliationError,
  commands,
  type FundAssignment,
} from "@/bindings";
import { logger } from "@/infra/logger";
import type { ServiceResult } from "@/types/api";

type LabelResult<T> = ServiceResult<T, BankStatementReconciliationError>;

/** BAS-041 — every saved bank statement label. */
export async function listBankStatementLabels(): Promise<LabelResult<BankFundLabelMapping[]>> {
  logger.debug("[bank-statement-label] listBankStatementLabels");
  const result = await commands.listBankLabelMappings();
  if (result.status === "ok") return { success: true, data: result.data };
  logger.error("[bank-statement-label] list failed", { code: result.error.code });
  return { success: false, error: result.error };
}

/** BAS-042 — assign a label to another fund, or to ignored. */
export async function reassignBankStatementLabel(
  id: string,
  assignment: FundAssignment,
): Promise<LabelResult<BankFundLabelMapping>> {
  logger.info("[bank-statement-label] reassign", { labelId: id, kind: assignment.type });
  const result = await commands.reassignBankLabelMapping(id, assignment);
  if (result.status === "ok") return { success: true, data: result.data };
  logger.error("[bank-statement-label] reassign failed", { code: result.error.code });
  return { success: false, error: result.error };
}

/** BAS-043 — delete a label; the next import asks for it again. */
export async function deleteBankStatementLabel(id: string): Promise<LabelResult<void>> {
  logger.info("[bank-statement-label] delete", { labelId: id });
  const result = await commands.deleteBankLabelMapping(id);
  if (result.status === "ok") return { success: true, data: undefined };
  logger.error("[bank-statement-label] delete failed", { code: result.error.code });
  return { success: false, error: result.error };
}

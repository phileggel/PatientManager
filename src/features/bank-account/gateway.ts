import { type BankAccount, commands } from "@/bindings";
import { useAppStore } from "@/lib/appStore";
import { logger } from "@/lib/logger";
import type { ServiceResult } from "@/types/api";

export function readAllBankAccounts(): ServiceResult<BankAccount[]> {
  logger.debug("Fetching all bank accounts from store");
  const bankAccounts = useAppStore.getState().bankAccounts;
  return { success: true, data: bankAccounts };
}

export async function createBankAccount(
  name: string,
  iban: string | null = null,
): Promise<ServiceResult<BankAccount>> {
  logger.info("Creating bank account", { name });

  const result = await commands.createBankAccount(name, iban);

  if (result.status === "ok") {
    logger.info("Bank account created successfully", { accountId: result.data.id, name });
    return { success: true, data: result.data };
  } else {
    logger.error("Failed to create bank account", { error: result.error });
    return { success: false, error: result.error };
  }
}

export async function updateBankAccount(
  id: string,
  name: string,
  iban: string | null = null,
): Promise<ServiceResult<BankAccount>> {
  logger.info("Updating bank account", { accountId: id, name });

  const result = await commands.updateBankAccount(id, name, iban);

  if (result.status === "ok") {
    logger.info("Bank account updated successfully");
    return { success: true, data: result.data };
  } else {
    logger.error("Failed to update bank account", { error: result.error });
    return { success: false, error: result.error };
  }
}

export async function deleteBankAccount(id: string): Promise<ServiceResult<void>> {
  logger.info("Deleting bank account", { accountId: id });

  const result = await commands.deleteBankAccount(id);

  if (result.status === "ok") {
    logger.info("Bank account deleted successfully", { accountId: id });
    return { success: true, data: undefined };
  } else {
    logger.error("Failed to delete bank account", { error: result.error });
    return { success: false, error: result.error };
  }
}

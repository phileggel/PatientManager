import type { BankTransfer, BankTransferType } from "@/bindings";
import { commands } from "@/bindings";
import { logger } from "@/lib/logger";

export type ServiceResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

export async function createBankTransfer(
  transferDate: string,
  amount: number,
  transferType: BankTransferType,
  bankAccount: string,
  source: string,
): Promise<ServiceResult<BankTransfer>> {
  logger.info("Creating bank transfer", { transferDate, amount, transferType });

  try {
    const result = await commands.createBankTransfer(
      transferDate,
      amount,
      transferType,
      bankAccount,
      source,
    );

    if (result.status === "ok") {
      logger.info("Bank transfer created", { id: result.data.id });
      return { success: true, data: result.data };
    } else {
      logger.error("Failed to create", { error: result.error });
      return { success: false, error: result.error };
    }
  } catch (error) {
    logger.error("Exception creating", { error });
    return { success: false, error: String(error) };
  }
}

export async function readAllBankTransfers(): Promise<ServiceResult<BankTransfer[]>> {
  logger.debug("Fetching all bank transfers");

  try {
    const result = await commands.readAllBankTransfers();

    if (result.status === "ok") {
      logger.debug("Bank transfers fetched", { count: result.data.length });
      return { success: true, data: result.data };
    } else {
      logger.error("Failed to fetch transfers", { error: result.error });
      return { success: false, error: result.error };
    }
  } catch (error) {
    logger.error("Exception fetching transfers", { error });
    return { success: false, error: String(error) };
  }
}

export async function updateBankTransfer(
  transfer: BankTransfer,
): Promise<ServiceResult<BankTransfer>> {
  logger.info("Updating bank transfer", { id: transfer.id });

  try {
    const result = await commands.updateBankTransfer(transfer);

    if (result.status === "ok") {
      logger.info("Bank transfer updated", { id: result.data.id });
      return { success: true, data: result.data };
    } else {
      logger.error("Failed to update", { error: result.error });
      return { success: false, error: result.error };
    }
  } catch (error) {
    logger.error("Exception updating", { error });
    return { success: false, error: String(error) };
  }
}

export async function deleteBankTransfer(id: string): Promise<ServiceResult<void>> {
  logger.info("Deleting bank transfer", { id });

  try {
    const result = await commands.deleteBankTransfer(id);

    if (result.status === "ok") {
      logger.info("Bank transfer deleted");
      return { success: true };
    } else {
      logger.error("Failed to delete", { error: result.error });
      return { success: false, error: result.error };
    }
  } catch (error) {
    logger.error("Exception deleting", { error });
    return { success: false, error: String(error) };
  }
}

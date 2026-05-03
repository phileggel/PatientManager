import { useEffect } from "react";
import { logger } from "@/lib/logger";
import { BankStatementModal } from "./ui/BankStatementModal";

const TAG = "[BankStatementPage]";

interface BankStatementPageProps {
  filePath: string;
  onClose: () => void;
}

export function BankStatementPage({ filePath, onClose }: BankStatementPageProps) {
  useEffect(() => {
    logger.info(TAG, "mounted");
  }, []);

  return <BankStatementModal filePath={filePath} onClose={onClose} />;
}

import { useEffect } from "react";
import { logger } from "@/infra/logger";
import { ReconciliationModal } from "./reconciliation_modal/ReconciliationModal";

const TAG = "[ReconciliationPage]";

interface ReconciliationPageProps {
  filePath: string;
  onClose: () => void;
}

export function ReconciliationPage({ filePath, onClose }: ReconciliationPageProps) {
  useEffect(() => {
    logger.info(TAG, "mounted");
  }, []);

  return <ReconciliationModal filePath={filePath} onClose={onClose} />;
}

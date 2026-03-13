import { useEffect } from "react";
import { logger } from "@/lib/logger";
import { AddFundPaymentPanel } from "./add_fund_payment_panel/AddFundPaymentPanel";
import FundPaymentList from "./fund_payment_list/FundPaymentList";

/**
 * FundPaymentManager - Page Container
 *
 * Layout container for fund payment management.
 * Children are self-contained Smart Components:
 * - FundPaymentList: displays groups and handles row actions (edit/delete)
 * - AddFundPaymentPanel: handles creation of new payment groups
 */
export function FundPaymentManager() {
  useEffect(() => {
    logger.info("[FundPaymentManager] Component mounted");
  }, []);

  return (
    <main className="flex flex-row flex-1 min-h-0 p-4 gap-4 box-border">
      {/* Left: List of payment groups (Smart Component) */}
      <FundPaymentList />

      {/* Right: Add new payment form (Smart Component) */}
      <AddFundPaymentPanel />
    </main>
  );
}

export default FundPaymentManager;

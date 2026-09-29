import { Tags } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { logger } from "@/infra/logger";
import { ManagerLayout } from "@/ui/components";
import { BankStatementLabelList } from "./bank_statement_label_list/BankStatementLabelList";
import { useBankStatementLabelList } from "./bank_statement_label_list/useBankStatementLabelList";

/**
 * BAS-041 — the « Libellés de relevé » page: saved bank statement labels on the
 * left; the side panel explains where they come from, since none is added here.
 */
export function BankStatementLabelManager() {
  const { t } = useTranslation("bank");
  const list = useBankStatementLabelList();
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    logger.info("[BankStatementLabelManager] Page mounted");
  }, []);

  return (
    <ManagerLayout
      searchId="bank-statement-label-search"
      title={t("statement_label.manager.title")}
      count={list.rows.length}
      searchTerm={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder={t("statement_label.manager.search_placeholder")}
      table={<BankStatementLabelList searchTerm={searchTerm} {...list} />}
      sidePanelTitle={t("statement_label.manager.panel_title")}
      sidePanelIcon={<Tags size={24} strokeWidth={2.5} />}
      sidePanelDescription={t("statement_label.manager.panel_description")}
      sidePanelContent={
        <p className="text-sm text-m3-on-surface-variant leading-relaxed">
          {t("statement_label.manager.panel_body")}
        </p>
      }
    />
  );
}

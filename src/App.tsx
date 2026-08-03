import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BankAccountManager } from "@/features/bank-account";
import { BankStatementPage } from "@/features/bank-statement-match";
import { BankTransferManager } from "@/features/bank-transfer";
import DashboardPage from "@/features/dashboard/presentation/DashboardPage";
import { DbBackupModal } from "@/features/db-backup";
import { ImportExcelPage } from "@/features/excel-import/presentation";
import { FundsManager } from "@/features/fund";
import { FundPaymentManager } from "@/features/fund-payment";
import { ReconciliationPage } from "@/features/fund-payment-match";
import { PatientsManager } from "@/features/patient";
import ProcedurePage from "@/features/procedure/ui/ProcedurePage";
import { ProcedureTypeManager } from "@/features/procedure-type";
import type { Page } from "@/features/shell";
import {
  Drawer,
  Footer,
  Header,
  ImportModal,
  ManagementModal,
  SettingsModal,
  useDrawerController,
} from "@/features/shell";
import { DesignSystemPage } from "@/features/shell/DesignSystemPage";
import { UpdateBanner } from "@/features/shell/UpdateBanner";
import { useUpdater } from "@/features/shell/useUpdater";
import { useCacheSync } from "@/infra/cache/sync";
import { logger } from "@/infra/logger";
import { APP_NAME, APP_VERSION } from "@/lib/version";
import { Snackbar, useSnackbar } from "@/ui/components/snackbar";

const TAG = "[App]";

function AppContent() {
  const { t } = useTranslation("common");
  const { snackbars, dismissSnackbar } = useSnackbar();
  const { isExpanded, toggle: toggleDrawer } = useDrawerController();
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [isDbBackupOpen, setIsDbBackupOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isManagementOpen, setIsManagementOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pendingFilePath, setPendingFilePath] = useState<string | null>(null);

  // Initialize app data and event listeners
  useCacheSync();
  const updater = useUpdater();

  useEffect(() => {
    logger.info(TAG, "component mounted");
  }, []);

  const handleNavigate = useCallback((page: Page) => {
    setCurrentPage(page);
  }, []);

  const handleImportFileSelected = useCallback(
    (page: "excel-import" | "fund-payment-match" | "bank-statement-match", filePath: string) => {
      setPendingFilePath(filePath);
      handleNavigate(page);
    },
    [handleNavigate],
  );

  const handleCloseImportPage = useCallback(() => {
    setPendingFilePath(null);
    handleNavigate("dashboard");
  }, [handleNavigate]);

  // Page-specific titles and subtitles
  const pageTitle = useMemo(() => {
    switch (currentPage) {
      case "procedures":
        return t("nav.procedures");
      case "patient":
        return t("nav.patient");
      case "funds":
        return t("nav.funds");
      case "procedure-types":
        return t("nav.procedure_types");
      case "excel-import":
        return t("nav.excel_import");
      case "fund-payment":
        return t("nav.fund_payment");
      case "fund-payment-match":
        return t("nav.reconciliation");
      case "bank-transfer":
        return t("nav.bank_transfer");
      case "bank-account":
        return t("nav.bank_account");
      case "bank-statement-match":
        return t("nav.bank_statement");
      case "dashboard":
        return t("nav.dashboard");
      case "design-system":
        return t("nav.design_system");
      default:
        return t("nav.dashboard");
    }
  }, [currentPage, t]);

  const pageSubtitle = useMemo(() => {
    switch (currentPage) {
      case "excel-import":
        return t("nav.subtitle.excel_import");
      case "fund-payment-match":
        return t("nav.subtitle.reconciliation");
      case "bank-statement-match":
        return t("nav.subtitle.bank_statement");
      default:
        return undefined;
    }
  }, [currentPage, t]);

  return (
    <div className="flex flex-row h-screen w-screen overflow-hidden bg-m3-surface">
      <Drawer
        isExpanded={isExpanded}
        onToggle={toggleDrawer}
        currentPage={currentPage}
        onNavigate={handleNavigate}
        onOpenDbBackup={() => setIsDbBackupOpen(true)}
        onOpenImport={() => setIsImportOpen(true)}
        onOpenManagement={() => setIsManagementOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header title={pageTitle} subtitle={pageSubtitle} />

        <main
          className="flex-1 flex flex-col min-h-0 overflow-hidden relative"
          aria-labelledby="app-page-title"
        >
          {currentPage === "dashboard" && <DashboardPage />}
          {currentPage === "patient" && <PatientsManager />}
          {currentPage === "funds" && <FundsManager />}
          {currentPage === "procedures" && <ProcedurePage />}
          {currentPage === "procedure-types" && <ProcedureTypeManager />}
          {currentPage === "excel-import" && pendingFilePath && (
            <ImportExcelPage filePath={pendingFilePath} onClose={handleCloseImportPage} />
          )}
          {currentPage === "fund-payment" && <FundPaymentManager />}
          {currentPage === "fund-payment-match" && pendingFilePath && (
            <ReconciliationPage filePath={pendingFilePath} onClose={handleCloseImportPage} />
          )}
          {currentPage === "bank-transfer" && <BankTransferManager />}
          {currentPage === "bank-account" && <BankAccountManager />}
          {currentPage === "bank-statement-match" && pendingFilePath && (
            <BankStatementPage filePath={pendingFilePath} onClose={handleCloseImportPage} />
          )}
          {import.meta.env.DEV && currentPage === "design-system" && <DesignSystemPage />}

          {/* Snackbars - display in center-bottom with slide-up animation */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col gap-3 z-50 max-w-sm pointer-events-none">
            {snackbars.map((snackbar) => (
              <div key={snackbar.id} className="pointer-events-auto">
                <Snackbar
                  type={snackbar.type}
                  message={snackbar.message}
                  onDismiss={() => dismissSnackbar(snackbar.id)}
                />
              </div>
            ))}
          </div>
        </main>

        <Footer appName={APP_NAME} version={APP_VERSION} />

        {updater.state !== "idle" && updater.state !== "done" && (
          <div className="shrink-0 min-h-8 bg-m3-primary-container flex items-center justify-center">
            <UpdateBanner updater={updater} />
          </div>
        )}
      </div>

      <DbBackupModal isOpen={isDbBackupOpen} onClose={() => setIsDbBackupOpen(false)} />
      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onNavigate={handleNavigate}
        onFileSelected={handleImportFileSelected}
      />
      <ManagementModal
        isOpen={isManagementOpen}
        onClose={() => setIsManagementOpen(false)}
        onNavigate={handleNavigate}
      />
      {isSettingsOpen && (
        <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      )}
    </div>
  );
}

function App() {
  return <AppContent />;
}

export default App;

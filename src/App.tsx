import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Snackbar, useSnackbar } from "@/core/snackbar";
import { BankAccountManager } from "@/features/bank-account";
import { BankStatementPage } from "@/features/bank-statement-match";
import { BankTransferManager } from "@/features/bank-transfer";
import DashboardPage from "@/features/dashboard/presentation/DashboardPage";
import { DbBackupModal } from "@/features/db-backup";
import { DesignSystemPage } from "@/features/design-system/DesignSystemPage";
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
  useDrawerController,
} from "@/features/shell";
import { UpdateBanner } from "@/features/updater/UpdateBanner";
import { useUpdater } from "@/features/updater/useUpdater";
import { logger } from "@/lib/logger";
import { useAppInit } from "@/lib/useAppInit";
import { APP_NAME, APP_VERSION } from "@/lib/version";

const TAG = "[App]";

function AppContent() {
  const { t } = useTranslation("common");
  const { snackbars, dismissSnackbar } = useSnackbar();
  const { isOpen: isDrawerOpen, toggle: toggleDrawer, close: closeDrawer } = useDrawerController();
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [isDbBackupOpen, setIsDbBackupOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isManagementOpen, setIsManagementOpen] = useState(false);

  // Initialize app data and event listeners
  useAppInit();
  const updater = useUpdater();

  useEffect(() => {
    logger.info(TAG, "component mounted");
  }, []);

  const handleNavigate = (page: Page) => {
    setCurrentPage(page);
  };

  // Page-specific titles and subtitles
  const getPageTitle = () => {
    switch (currentPage) {
      case "procedures":
        return t("nav.procedures");
      case "patient":
        return t("nav.patient");
      case "funds":
        return t("nav.funds");
      case "procedure-types":
        return t("nav.procedureTypes");
      case "excel-import":
        return t("nav.excelImport");
      case "fund-payment":
        return t("nav.fundPayment");
      case "fund-payment-match":
        return t("nav.reconciliation");
      case "bank-transfer":
        return t("nav.bankTransfer");
      case "bank-account":
        return t("nav.bankAccount");
      case "bank-statement-match":
        return t("nav.bankStatement");
      case "dashboard":
        return t("nav.dashboard");
      case "design-system":
        return t("nav.designSystem");
      default:
        return t("nav.dashboard");
    }
  };

  const getPageSubtitle = () => {
    switch (currentPage) {
      case "excel-import":
        return t("nav.subtitle.excelImport");
      case "fund-payment-match":
        return t("nav.subtitle.reconciliation");
      case "bank-statement-match":
        return t("nav.subtitle.bankStatement");
      default:
        return undefined;
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-m3-surface">
      <Drawer
        isOpen={isDrawerOpen}
        onClose={closeDrawer}
        onNavigate={handleNavigate}
        onOpenDbBackup={() => setIsDbBackupOpen(true)}
        onOpenImport={() => setIsImportOpen(true)}
        onOpenManagement={() => setIsManagementOpen(true)}
      />

      <Header
        title={getPageTitle()}
        subtitle={getPageSubtitle()}
        isDrawerOpen={isDrawerOpen}
        onDrawerToggle={toggleDrawer}
      />

      <main className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        {currentPage === "dashboard" && <DashboardPage />}
        {currentPage === "patient" && <PatientsManager />}
        {currentPage === "funds" && <FundsManager />}
        {currentPage === "procedures" && <ProcedurePage />}
        {currentPage === "procedure-types" && <ProcedureTypeManager />}
        {currentPage === "excel-import" && <ImportExcelPage />}
        {currentPage === "fund-payment" && <FundPaymentManager />}
        {currentPage === "fund-payment-match" && <ReconciliationPage />}
        {currentPage === "bank-transfer" && <BankTransferManager />}
        {currentPage === "bank-account" && <BankAccountManager />}
        {currentPage === "bank-statement-match" && <BankStatementPage />}
        {import.meta.env.DEV && currentPage === "design-system" && <DesignSystemPage />}

        {/* Snackbars - display in center-bottom with slide-up animation */}
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex flex-col gap-3 z-50 max-w-sm pointer-events-none">
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

      <DbBackupModal isOpen={isDbBackupOpen} onClose={() => setIsDbBackupOpen(false)} />
      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onNavigate={handleNavigate}
      />
      <ManagementModal
        isOpen={isManagementOpen}
        onClose={() => setIsManagementOpen(false)}
        onNavigate={handleNavigate}
      />

      {updater.state !== "idle" && updater.state !== "done" && (
        <div className="shrink-0 min-h-8 bg-m3-primary-container flex items-center justify-center">
          <UpdateBanner updater={updater} />
        </div>
      )}
    </div>
  );
}

function App() {
  return <AppContent />;
}

export default App;

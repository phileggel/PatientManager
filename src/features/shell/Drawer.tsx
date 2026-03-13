import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAppStore } from "@/lib/appStore";
import { logger } from "@/lib/logger";
import { APP_NAME, APP_VERSION } from "@/lib/version";
import { DrawerToggle } from "./DrawerToggle";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (
    page:
      | "dashboard"
      | "patient"
      | "funds"
      | "procedures"
      | "procedure-types"
      | "excel-import"
      | "fund-payment"
      | "fund-payment-match"
      | "bank-transfer"
      | "bank-account"
      | "bank-statement-match",
  ) => void;
  onShowInfo?: (message: string) => void;
}

export const Drawer = ({ isOpen, onClose, onNavigate, onShowInfo }: DrawerProps) => {
  const { t } = useTranslation("common");
  const bankAccountCount = useAppStore((state) => state.bankAccounts.length);
  const fundCount = useAppStore((state) => state.funds.length);
  const [isListsOpen, setIsListsOpen] = useState(false);

  useEffect(() => {
    logger.info("[Drawer] Component mounted");
  }, []);

  const close = onClose;
  const drawerRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        close();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      firstFocusableRef.current?.focus();
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, close]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      close();
    }
  };

  const navigate = (page: Parameters<NonNullable<DrawerProps["onNavigate"]>>[0]) => {
    onNavigate?.(page);
    close();
  };

  const menuItemClasses = `
    w-full py-3 px-5 text-left
    border-none bg-transparent cursor-pointer
    text-base font-normal text-neutral-90
    transition-colors duration-150
    hover:bg-neutral-20 hover:text-primary-60
    focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-60 focus-visible:-outline-offset-2 focus-visible:bg-neutral-20
    active:bg-neutral-30
    sm:py-3.5 sm:px-4
  `;

  const subMenuItemClasses = `
    w-full py-2.5 pl-9 pr-5 text-left
    border-none bg-transparent cursor-pointer
    text-sm font-normal text-neutral-70
    transition-colors duration-150
    hover:bg-neutral-20 hover:text-primary-60
    focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-60 focus-visible:-outline-offset-2 focus-visible:bg-neutral-20
    active:bg-neutral-30
    sm:py-3 sm:pl-9
  `;

  const navigateFundMatch = () => {
    if (fundCount === 0) {
      onShowInfo?.(t("nav.requiresFundInfo"));
      navigate("funds");
    } else {
      navigate("fund-payment-match");
    }
  };

  const navigateFundPayment = () => {
    if (fundCount === 0) {
      onShowInfo?.(t("nav.requiresFundPaymentInfo"));
    }
    navigate("fund-payment");
  };

  const navigateBankFeature = (page: "bank-statement-match" | "bank-transfer") => {
    if (bankAccountCount === 0) {
      onShowInfo?.(t("nav.requiresBankAccountInfo"));
      navigate("bank-account");
    } else {
      navigate(page);
    }
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-1000 animate-[fadeIn_200ms_ease-out]"
          onClick={handleOverlayClick}
          aria-hidden="true"
        />
      )}

      {/* Drawer Panel */}
      <div
        id="drawer"
        ref={drawerRef}
        className={`
          fixed left-0 top-0 h-screen w-70
          bg-surface z-1001
          flex flex-col shadow-elevation-4
          transition-transform duration-200 ease-out
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
        role="dialog"
        aria-modal="true"
        aria-label={t("nav.dashboard")}
      >
        {/* Branding Section */}
        <div
          className="
            bg-linear-to-br from-primary-60 to-primary-80
            text-white px-8 border-b border-white/10
            md:px-4
            relative
            flex items-center gap-4
            shadow-elevation-1
            h-app-bar
          "
        >
          <DrawerToggle isOpen={isOpen} onToggle={close} />
          <div className="flex-1">
            <h2 className="mb-2 text-xl font-medium leading-tight tracking-wide">{APP_NAME}</h2>
            <p className="text-xs font-normal opacity-90">v{APP_VERSION}</p>
          </div>
        </div>

        {/* Navigation Section */}
        <nav className="flex-1 py-3 overflow-y-auto">
          <ul className="list-none m-0 p-0">
            {/* Main entries */}
            <li>
              <button
                type="button"
                ref={firstFocusableRef}
                className={menuItemClasses}
                onClick={() => navigate("dashboard")}
              >
                {t("nav.dashboard")}
              </button>
            </li>
            <li>
              <button
                type="button"
                className={menuItemClasses}
                onClick={() => navigate("procedures")}
              >
                {t("nav.procedures")}
              </button>
            </li>
            <li>
              <button type="button" className={menuItemClasses} onClick={() => navigateFundMatch()}>
                {t("nav.reconciliation")}
              </button>
            </li>
            <li>
              <button
                type="button"
                className={menuItemClasses}
                onClick={() => navigateBankFeature("bank-statement-match")}
              >
                {t("nav.bankStatement")}
              </button>
            </li>
            <li>
              <button
                type="button"
                className={menuItemClasses}
                onClick={() => navigate("excel-import")}
              >
                {t("nav.excelImport")}
              </button>
            </li>

            {/* Separator */}
            <li aria-hidden="true">
              <div className="my-2 mx-5 border-t border-neutral-20" />
            </li>

            {/* Lists accordion */}
            <li>
              <button
                type="button"
                className={`${menuItemClasses} flex items-center justify-between`}
                onClick={() => setIsListsOpen((prev) => !prev)}
                aria-expanded={isListsOpen}
              >
                <span>{t("nav.lists")}</span>
                <ChevronDown
                  className={`w-4 h-4 mr-1 transition-transform duration-200 ${isListsOpen ? "rotate-180" : ""}`}
                />
              </button>

              {isListsOpen && (
                <ul className="list-none m-0 p-0 border-l-2 border-neutral-20 ml-5">
                  <li>
                    <button
                      type="button"
                      className={subMenuItemClasses}
                      onClick={() => navigate("patient")}
                    >
                      {t("nav.patient")}
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      className={subMenuItemClasses}
                      onClick={() => navigate("funds")}
                    >
                      {t("nav.funds")}
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      className={subMenuItemClasses}
                      onClick={() => navigate("procedure-types")}
                    >
                      {t("nav.procedureTypes")}
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      className={subMenuItemClasses}
                      onClick={navigateFundPayment}
                    >
                      {t("nav.fundPayment")}
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      className={subMenuItemClasses}
                      onClick={() => navigateBankFeature("bank-transfer")}
                    >
                      {t("nav.bankTransfer")}
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      className={subMenuItemClasses}
                      onClick={() => navigate("bank-account")}
                    >
                      {t("nav.bankAccount")}
                    </button>
                  </li>
                </ul>
              )}
            </li>
          </ul>
        </nav>
      </div>
    </>
  );
};

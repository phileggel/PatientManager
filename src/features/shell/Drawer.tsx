import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAppStore } from "@/lib/appStore";
import { logger } from "@/lib/logger";
import { APP_NAME, APP_VERSION } from "@/lib/version";
import { DrawerToggle } from "./DrawerToggle";
import type { Page } from "./types";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (page: Page) => void;
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

  const drawerRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      firstFocusableRef.current?.focus();
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const navigate = (page: Parameters<NonNullable<DrawerProps["onNavigate"]>>[0]) => {
    onNavigate?.(page);
    onClose();
  };

  const menuItemClasses = `
    w-full py-3 px-5 text-left
    border-none bg-transparent cursor-pointer
    text-base font-normal text-m3-on-surface
    transition-colors duration-150
    hover:bg-m3-surface-container hover:text-m3-primary
    focus-visible:outline focus-visible:outline-2 focus-visible:outline-m3-primary focus-visible:-outline-offset-2 focus-visible:bg-m3-surface-container
    active:bg-m3-surface-container-high
    sm:py-3.5 sm:px-4
  `;

  const subMenuItemClasses = `
    w-full py-2.5 pl-9 pr-5 text-left
    border-none bg-transparent cursor-pointer
    text-sm font-normal text-m3-on-surface-variant
    transition-colors duration-150
    hover:bg-m3-surface-container hover:text-m3-primary
    focus-visible:outline focus-visible:outline-2 focus-visible:outline-m3-primary focus-visible:-outline-offset-2 focus-visible:bg-m3-surface-container
    active:bg-m3-surface-container-high
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
          className="fixed inset-0 bg-m3-scrim/50 z-1000 animate-[fadeIn_200ms_ease-out]"
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
          bg-m3-surface z-1001
          flex flex-col shadow-elevation-4
          transition-transform duration-200 ease-out
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
        role="dialog"
        aria-modal="true"
        aria-label={t("nav.openMenu")}
      >
        {/* Branding Section — uses fixed brand indigo gradient (header-from/to tokens,
            not overridden in dark mode). text-white is always accessible on rich indigo. */}
        <div
          className="
            bg-linear-to-br from-header-from to-header-to
            text-white px-8
            md:px-4
            relative
            flex items-center gap-4
            shadow-elevation-1
            h-app-bar
          "
        >
          <DrawerToggle isOpen={isOpen} onToggle={onClose} />
          <div className="flex-1">
            <h2 className="text-base font-medium leading-tight tracking-wide">{APP_NAME}</h2>
            <p className="text-xs font-normal opacity-90 mt-0.5">v{APP_VERSION}</p>
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

            {/* Vertical spacing between main entries and Lists accordion */}
            <li aria-hidden="true" className="my-1" />

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
                <ul className="list-none m-0 p-0 ml-5">
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

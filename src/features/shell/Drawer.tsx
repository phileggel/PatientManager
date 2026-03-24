import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { logger } from "@/lib/logger";
import { APP_NAME, APP_VERSION } from "@/lib/version";
import { DrawerToggle } from "./DrawerToggle";
import type { Page } from "./types";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (page: Page) => void;
  onOpenDbBackup?: () => void;
  onOpenImport?: () => void;
  onOpenManagement?: () => void;
}

export const Drawer = ({
  isOpen,
  onClose,
  onNavigate,
  onOpenDbBackup,
  onOpenImport,
  onOpenManagement,
}: DrawerProps) => {
  const { t } = useTranslation("common");

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
            text-m3-on-primary px-8
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
            {onOpenImport && (
              <li>
                <button
                  type="button"
                  className={menuItemClasses}
                  onClick={() => {
                    onOpenImport();
                    onClose();
                  }}
                >
                  {t("nav.import")}
                </button>
              </li>
            )}
            {onOpenManagement && (
              <li>
                <button
                  type="button"
                  className={menuItemClasses}
                  onClick={() => {
                    onOpenManagement();
                    onClose();
                  }}
                >
                  {t("nav.management")}
                </button>
              </li>
            )}

            {/* Maintenance section */}
            <li aria-hidden="true" className="my-3" />
            <li>
              <button
                type="button"
                className={menuItemClasses}
                onClick={() => {
                  onOpenDbBackup?.();
                  onClose();
                }}
              >
                {t("nav.dbBackup")}
              </button>
            </li>
          </ul>
        </nav>

        {/* Dev-only: Design System */}
        {import.meta.env.DEV && (
          <div className="bg-m3-surface-container px-4 py-3">
            <button
              type="button"
              className={subMenuItemClasses}
              onClick={() => navigate("design-system")}
            >
              {t("nav.designSystem")}
            </button>
          </div>
        )}
      </div>
    </>
  );
};

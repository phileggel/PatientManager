import {
  ClipboardList,
  HardDrive,
  LayoutDashboard,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  Upload,
} from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { logger } from "@/lib/logger";
import { APP_NAME, APP_VERSION } from "@/lib/version";
import type { Page } from "./types";

interface DrawerProps {
  isExpanded: boolean;
  onToggle: () => void;
  currentPage?: Page;
  onNavigate?: (page: Page) => void;
  onOpenDbBackup?: () => void;
  onOpenImport?: () => void;
  onOpenManagement?: () => void;
}

export const Drawer = ({
  isExpanded,
  onToggle,
  currentPage,
  onNavigate,
  onOpenDbBackup,
  onOpenImport,
  onOpenManagement,
}: DrawerProps) => {
  const { t } = useTranslation("common");

  useEffect(() => {
    logger.info("[Drawer] Component mounted");
  }, []);

  const navItemBase = [
    "w-full border-none bg-transparent cursor-pointer",
    "text-m3-on-surface transition-colors duration-150",
    "hover:bg-m3-surface-container hover:text-m3-primary",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-m3-primary",
    "focus-visible:-outline-offset-2 focus-visible:bg-m3-surface-container",
    "active:bg-m3-surface-container-high",
  ].join(" ");

  const navItemClasses = isExpanded
    ? `${navItemBase} py-3 px-5 flex items-center gap-3 text-left text-base font-normal sm:py-3.5 sm:px-4`
    : `${navItemBase} py-4 flex items-center justify-center`;

  return (
    <div
      className={`
        flex flex-col
        bg-m3-surface shadow-elevation-4
        transition-all duration-200 ease-out
        ${isExpanded ? "w-70" : "w-16"}
      `}
    >
      {/* Branding Section — uses fixed brand indigo gradient (header-from/to tokens,
          not overridden in dark mode). text-white is always accessible on rich indigo. */}
      <div
        className={`
          bg-linear-to-br from-header-from to-header-to
          text-m3-on-primary
          flex items-center gap-3
          shadow-elevation-1
          h-app-bar shrink-0
          ${isExpanded ? "px-3" : "justify-center px-0"}
        `}
      >
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 p-2 rounded-full text-white/90 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          aria-label={isExpanded ? t("nav.collapseDrawer") : t("nav.expandDrawer")}
          title={isExpanded ? t("nav.collapseDrawer") : t("nav.expandDrawer")}
        >
          {isExpanded ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
        </button>
        {isExpanded && (
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-medium leading-tight tracking-wide truncate">
              {APP_NAME}
            </h2>
            <p className="text-xs font-normal opacity-90 mt-0.5">v{APP_VERSION}</p>
          </div>
        )}
      </div>

      {/* Navigation Section */}
      <nav className="flex-1 py-3 overflow-y-auto" aria-label={t("nav.mainNavigation")}>
        <ul className="list-none m-0 p-0">
          <li>
            <button
              type="button"
              className={navItemClasses}
              onClick={() => onNavigate?.("dashboard")}
              title={!isExpanded ? t("nav.dashboard") : undefined}
              aria-label={!isExpanded ? t("nav.dashboard") : undefined}
              aria-current={currentPage === "dashboard" ? "page" : undefined}
            >
              <LayoutDashboard size={20} className="shrink-0" />
              {isExpanded && <span>{t("nav.dashboard")}</span>}
            </button>
          </li>
          <li>
            <button
              type="button"
              className={navItemClasses}
              onClick={() => onNavigate?.("procedures")}
              title={!isExpanded ? t("nav.procedures") : undefined}
              aria-label={!isExpanded ? t("nav.procedures") : undefined}
              aria-current={currentPage === "procedures" ? "page" : undefined}
            >
              <ClipboardList size={20} className="shrink-0" />
              {isExpanded && <span>{t("nav.procedures")}</span>}
            </button>
          </li>
          {onOpenImport && (
            <li>
              <button
                type="button"
                className={navItemClasses}
                onClick={onOpenImport}
                title={!isExpanded ? t("nav.import") : undefined}
                aria-label={!isExpanded ? t("nav.import") : undefined}
              >
                <Upload size={20} className="shrink-0" />
                {isExpanded && <span>{t("nav.import")}</span>}
              </button>
            </li>
          )}
          {onOpenManagement && (
            <li>
              <button
                type="button"
                className={navItemClasses}
                onClick={onOpenManagement}
                title={!isExpanded ? t("nav.management") : undefined}
                aria-label={!isExpanded ? t("nav.management") : undefined}
              >
                <Settings2 size={20} className="shrink-0" />
                {isExpanded && <span>{t("nav.management")}</span>}
              </button>
            </li>
          )}

          {/* Maintenance section separator */}
          <li aria-hidden="true">
            <hr className="my-3 mx-4 border-m3-outline-variant/30" />
          </li>
          <li>
            <button
              type="button"
              className={navItemClasses}
              onClick={() => onOpenDbBackup?.()}
              title={!isExpanded ? t("nav.dbBackup") : undefined}
              aria-label={!isExpanded ? t("nav.dbBackup") : undefined}
            >
              <HardDrive size={20} className="shrink-0" />
              {isExpanded && <span>{t("nav.dbBackup")}</span>}
            </button>
          </li>
        </ul>
      </nav>

      {/* Dev-only: Design System */}
      {import.meta.env.DEV && (
        <div className="bg-m3-surface-container py-3">
          <button
            type="button"
            className={navItemClasses}
            onClick={() => onNavigate?.("design-system")}
            title={!isExpanded ? t("nav.designSystem") : undefined}
            aria-label={!isExpanded ? t("nav.designSystem") : undefined}
            aria-current={currentPage === "design-system" ? "page" : undefined}
          >
            <Palette size={20} className="shrink-0" />
            {isExpanded && <span>{t("nav.designSystem")}</span>}
          </button>
        </div>
      )}
    </div>
  );
};

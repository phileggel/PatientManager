import { useEffect } from "react";
import { logger } from "@/lib/logger";
import { ThemeToggle } from "./theme_toggle/ThemeToggle";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  useEffect(() => {
    logger.info("[Header] Component mounted");
  }, []);

  // text-white is intentional: lives exclusively on the fixed-brand indigo gradient
  // (--color-header-from/to), which adapts to a darker indigo in dark mode.
  // White is always accessible on rich indigo (WCAG AA).
  return (
    <header
      className="
        bg-linear-to-br from-header-from to-header-to
        text-white px-6
        flex items-center gap-4
        shadow-elevation-1
        md:px-4
        relative z-50
        h-app-bar shrink-0
      "
    >
      <div className="flex-1">
        <h1 id="app-page-title" className="text-lg font-semibold leading-tight md:text-base">
          {title}
        </h1>
        {subtitle && <p className="text-xs font-normal text-white/90 mt-0.5">{subtitle}</p>}
      </div>
      <ThemeToggle />
    </header>
  );
}

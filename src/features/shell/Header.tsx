import { useEffect } from "react";
import { logger } from "@/lib/logger";
import { DrawerToggle } from "./DrawerToggle";
import { ThemeToggle } from "./theme_toggle/ThemeToggle";

interface HeaderProps {
  title: string;
  subtitle?: string;
  isDrawerOpen?: boolean;
  onDrawerToggle?: () => void;
}

export function Header({ title, subtitle, isDrawerOpen = false, onDrawerToggle }: HeaderProps) {
  useEffect(() => {
    logger.info("[Header] Component mounted");
  }, []);

  return (
    <header
      className="
        bg-linear-to-br from-header-from to-header-to
        text-white px-8
        grid grid-cols-[auto_1fr_auto] items-center gap-4
        shadow-elevation-1
        md:px-4
        relative z-50
        h-app-bar
      "
    >
      <div>
        {onDrawerToggle && <DrawerToggle isOpen={isDrawerOpen} onToggle={onDrawerToggle} />}
      </div>
      <div className="text-center">
        <h1 className="text-3xl font-semibold leading-tight mb-2 md:text-2xl">{title}</h1>
        {subtitle && (
          <p className="text-lg font-normal leading-6 text-white/95 md:text-sm">{subtitle}</p>
        )}
      </div>
      <div className="flex justify-end">
        <ThemeToggle />
      </div>
    </header>
  );
}

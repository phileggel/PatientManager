import { useEffect } from "react";
import { logger } from "@/lib/logger";
import { DrawerToggle } from "./DrawerToggle";

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
        bg-linear-to-br from-primary-60 to-primary-80
        text-white px-8
        flex items-center gap-4
        shadow-elevation-1
        md:px-4
        relative z-50
        h-app-bar
      "
    >
      {onDrawerToggle && <DrawerToggle isOpen={isDrawerOpen} onToggle={onDrawerToggle} />}
      <div className="absolute left-1/2 -translate-x-1/2 text-center">
        <h1 className="text-3xl font-semibold leading-tight mb-2 md:text-2xl">{title}</h1>
        {subtitle && (
          <p className="text-lg font-normal leading-6 opacity-95 md:text-sm">{subtitle}</p>
        )}
      </div>
    </header>
  );
}

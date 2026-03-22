import { Menu, X } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { logger } from "@/lib/logger";

interface DrawerToggleProps {
  isOpen: boolean;
  onToggle: () => void;
}

export const DrawerToggle = ({ isOpen, onToggle }: DrawerToggleProps) => {
  const { t } = useTranslation("common");

  useEffect(() => {
    logger.info("[DrawerToggle] Component mounted");
  }, []);

  return (
    <button
      type="button"
      onClick={onToggle}
      className="
        flex items-center justify-center
        w-12 h-12 p-0 m-0
        bg-transparent border-none cursor-pointer
        text-white rounded-xl
        transition-colors duration-150
        hover:bg-white/10
        focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2
      "
      aria-label={isOpen ? t("nav.closeMenu") : t("nav.openMenu")}
      aria-expanded={isOpen}
      aria-controls="drawer"
    >
      {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
    </button>
  );
};

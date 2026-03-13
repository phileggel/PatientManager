import { useEffect } from "react";
import { logger } from "@/lib/logger";

interface FooterProps {
  text: string;
  version?: string;
}

export function Footer({ text, version }: FooterProps) {
  useEffect(() => {
    logger.info("[Footer] Component mounted");
  }, []);

  return (
    <footer className="bg-neutral-90 text-white text-center py-5 mt-auto">
      <p className="m-0 text-sm">
        {text}
        {version && <span className="opacity-80"> v{version}</span>}
      </p>
    </footer>
  );
}

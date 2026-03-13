import { type ReactNode, useEffect } from "react";
import { logger } from "@/lib/logger";

/**
 * PageContent - Reusable wrapper for page content that properly handles
 * flex layout with header/footer constraints
 *
 * Usage:
 * <PageContent>
 *   <div>Content here</div>
 * </PageContent>
 */
interface PageContentProps {
  children: ReactNode;
  layout?: "column" | "row";
}

export function PageContent({ children, layout = "row" }: PageContentProps) {
  useEffect(() => {
    logger.info("[PageContent] Component mounted");
  }, []);

  const layoutClass = layout === "row" ? "flex-row" : "flex-col";

  return (
    <main className={`flex ${layoutClass} flex-1 min-h-0 p-4 gap-4 box-border overflow-hidden`}>
      {children}
    </main>
  );
}

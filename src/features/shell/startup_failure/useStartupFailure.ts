import { useEffect, useState } from "react";
import type { StartupFailure } from "@/bindings";
import { logger } from "@/infra/logger";
import { getStartupFailure } from "../gateway";

const TAG = "[useStartupFailure]";

/** DGR-040 — whether the start-up failed, read once when the window opens. */
export function useStartupFailure(): { checking: boolean; failure: StartupFailure | null } {
  const [checking, setChecking] = useState(true);
  const [failure, setFailure] = useState<StartupFailure | null>(null);

  useEffect(() => {
    let isMounted = true;
    getStartupFailure()
      .then((found) => {
        if (isMounted) setFailure(found);
      })
      .catch((err) => {
        // Without an answer the application opens as before this check existed.
        logger.error(TAG, "reading the start-up failure failed", { error: String(err) });
      })
      .finally(() => {
        if (isMounted) setChecking(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  return { checking, failure };
}

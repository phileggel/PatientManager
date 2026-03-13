import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useState } from "react";
import { logger } from "@/lib/logger";

const TAG = "[Updater]";

type UpdaterState = "idle" | "available" | "downloading" | "done";

export interface UpdaterResult {
  state: UpdaterState;
  version: string | null;
  install: () => Promise<void>;
}

export function useUpdater(): UpdaterResult {
  const [state, setState] = useState<UpdaterState>("idle");
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD) return;

    check()
      .then((update) => {
        if (update?.available) {
          logger.info(TAG, "update available", { version: update.version });
          setVersion(update.version);
          setState("available");
        } else {
          logger.info(TAG, "app is up to date");
        }
      })
      .catch((err) => {
        logger.error(TAG, "update check failed", { err });
      });
  }, []);

  const install = useCallback(async () => {
    if (state !== "available") return;
    setState("downloading");
    try {
      const update = await check();
      if (update?.available) {
        await update.downloadAndInstall();
        setState("done");
        await relaunch();
      }
    } catch (err) {
      logger.error(TAG, "update install failed", { err });
      setState("available");
    }
  }, [state]);

  return { state, version, install };
}

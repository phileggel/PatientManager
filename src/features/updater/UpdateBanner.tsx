import { useTranslation } from "react-i18next";
import type { UpdaterResult } from "./useUpdater";

interface UpdateBannerProps {
  updater: UpdaterResult;
}

export function UpdateBanner({ updater }: UpdateBannerProps) {
  const { t } = useTranslation("common");

  if (updater.state === "idle" || updater.state === "done") return null;

  const isDownloading = updater.state === "downloading";

  return (
    <div className="flex items-center justify-center gap-3 px-4 text-white text-xs">
      <span>
        {isDownloading
          ? t("updater.downloading")
          : t("updater.available", { version: updater.version })}
      </span>
      {!isDownloading && (
        <button
          type="button"
          onClick={updater.install}
          className="underline font-medium hover:opacity-80 cursor-pointer"
        >
          {t("updater.install")}
        </button>
      )}
    </div>
  );
}

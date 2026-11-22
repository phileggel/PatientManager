import { CircleCheck, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { StartupFailure } from "@/bindings";
import { logger } from "@/infra/logger";
import { APP_VERSION } from "@/lib/version";
import { Button } from "@/ui/components";
import { UpdateBanner } from "../UpdateBanner";
import { type UpdaterResult, useUpdater } from "../useUpdater";
import {
  presentStartupFailureStep,
  presentStartupFailureTitle,
  presentStartupReportError,
} from "./presenter";
import { useStartupFailurePage } from "./useStartupFailurePage";

interface StartupFailurePageProps {
  failure: StartupFailure;
}

/**
 * DGR-040 to DGR-045 — shown in place of the application when its start-up failed:
 * what failed, the failure report to send to support, and the update when one exists.
 */
export function StartupFailurePage({ failure }: StartupFailurePageProps) {
  // The application's own updater: a fixed release installs from this page too.
  const updater = useUpdater();
  const page = useStartupFailurePage();

  useEffect(() => {
    logger.info("[StartupFailurePage] mounted", { stage: failure.stage });
  }, [failure.stage]);

  return <StartupFailureView failure={failure} updater={updater} {...page} />;
}

interface StartupFailureViewProps extends ReturnType<typeof useStartupFailurePage> {
  failure: StartupFailure;
  updater: UpdaterResult;
}

/** The page as it shows a given state; no logic of its own. */
export function StartupFailureView({
  failure,
  updater,
  isExporting,
  saved,
  error,
  exportReport,
  close,
}: StartupFailureViewProps) {
  const { t } = useTranslation("common");
  const step = presentStartupFailureStep(failure);

  return (
    <div id="startup-failure-page" className="flex h-screen w-screen flex-col bg-m3-surface">
      <main className="flex min-h-0 flex-auto items-center justify-center overflow-y-auto p-8">
        <div className="flex w-full max-w-xl flex-col gap-5 rounded-2xl bg-m3-surface-container-low p-8">
          <div className="flex items-start gap-3">
            <TriangleAlert size={28} className="mt-0.5 shrink-0 text-m3-error" />
            <div>
              <h1 className="text-xl font-semibold text-m3-on-surface">
                {t(presentStartupFailureTitle(failure))}
              </h1>
              <p className="mt-1 text-sm leading-relaxed text-m3-on-surface-variant">
                {t("startup_failure.intro")}
                {failure.backup_taken && <> {t("startup_failure.backup")}</>}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-m3-surface-container-high p-4 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-m3-on-surface-variant">{t("startup_failure.version")}</dt>
              <dd className="font-mono text-m3-on-surface">{APP_VERSION}</dd>
              <dt className="text-m3-on-surface-variant">{t("startup_failure.step_label")}</dt>
              <dd id="startup-failure-step" className="font-mono text-m3-on-surface">
                {t(step.key, step.params)}
              </dd>
              <dt className="text-m3-on-surface-variant">{t("startup_failure.cause")}</dt>
              <dd id="startup-failure-cause" className="font-mono break-words text-m3-on-surface">
                {failure.cause}
              </dd>
            </dl>
          </div>

          <p className="text-sm leading-relaxed text-m3-on-surface-variant">
            {t("startup_failure.explain")}
          </p>

          {saved && (
            <output
              id="startup-failure-saved"
              className="flex items-start gap-3 rounded-xl bg-m3-surface-container-high p-4"
            >
              <CircleCheck size={20} className="mt-0.5 shrink-0 text-m3-primary" />
              <div className="flex flex-col gap-1 text-sm">
                <span className="text-m3-on-surface">
                  {t("startup_failure.saved")} <span className="font-mono">{saved.fileName}</span>
                </span>
                <span className="text-m3-on-surface-variant">
                  {t("startup_failure.send")}{" "}
                  <span
                    id="startup-failure-code"
                    className="font-mono font-semibold whitespace-nowrap text-m3-on-surface"
                  >
                    {saved.supportCode}
                  </span>
                </span>
              </div>
            </output>
          )}

          {error && (
            <p id="startup-failure-error" role="alert" className="text-sm text-m3-error">
              {t(presentStartupReportError(error))}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <Button id="startup-failure-close" variant="outline" onClick={close}>
              {t("startup_failure.close")}
            </Button>
            <Button
              id="startup-failure-export"
              variant={saved ? "secondary" : "primary"}
              onClick={exportReport}
              loading={isExporting}
              disabled={isExporting}
            >
              {t("startup_failure.export")}
            </Button>
          </div>
        </div>
      </main>

      {updater.state !== "idle" && updater.state !== "done" && (
        <div className="shrink-0 min-h-8 bg-m3-primary-container flex items-center justify-center">
          <UpdateBanner updater={updater} />
        </div>
      )}
    </div>
  );
}

/**
 * ReconciliationResults - Step-by-step anomaly review with M3 design.
 *
 * Displays one issue at a time with ← → navigation.
 * Issues are sorted by priority: TooMany → Group → NotFound → Single.
 * Resolved count tracked by useReconciliationResults and reported via onReportResolvedCount.
 */

import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { AutoCorrection, ReconciliationResult } from "@/bindings";
import { logger } from "@/lib/logger";
import {
  buildAutoCorrection,
  buildContestKey,
  buildCorrectionKey,
  buildLinkProcedureKey,
  buildNotFoundCorrection,
  buildNotFoundKey,
} from "../shared/utils";
import { GroupMatchCard } from "./cards/GroupMatchCard";
import { NotFoundCard } from "./cards/NotFoundCard";
import { SingleMatchCard } from "./cards/SingleMatchCard";
import { TooManyCard } from "./cards/TooManyCard";
import { useReconciliationResults } from "./useReconciliationResults";

interface ReconciliationResultsProps {
  result: ReconciliationResult;
  acceptedKeys: Set<string>;
  autoCorrections: Map<string, AutoCorrection>;
  onAcceptCorrection: (key: string, correction: AutoCorrection) => void;
  onReportResolvedCount?: (count: number) => void;
  onReportUnresolvedGroupCount?: (count: number) => void;
}

export function ReconciliationResultsView({
  result,
  acceptedKeys,
  autoCorrections,
  onAcceptCorrection,
  onReportResolvedCount,
  onReportUnresolvedGroupCount,
}: ReconciliationResultsProps) {
  const { t } = useTranslation("fund-payment-match");

  useEffect(() => {
    logger.info("[ReconciliationResults] Component mounted");
  }, []);

  const {
    sortedIssues,
    currentIndex,
    currentIssue,
    goNext,
    goPrev,
    goTo,
    isResolved,
    resolvedCount,
    blockingCount,
  } = useReconciliationResults(
    result,
    acceptedKeys,
    autoCorrections,
    onReportResolvedCount,
    onReportUnresolvedGroupCount,
  );

  // Enter key = primary action on current card
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Enter") return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      if (!currentIssue || isResolved(currentIssue)) {
        goNext();
        return;
      }
      if (currentIssue.type === "NotFoundIssue") {
        const key = buildNotFoundKey(currentIssue.data.pdf_line);
        onAcceptCorrection(key, buildNotFoundCorrection(currentIssue.data.pdf_line));
      } else if (currentIssue.type === "SingleMatchIssue") {
        const { pdf_line, db_match } = currentIssue.data;
        const firstUnresolved = db_match.anomalies.find((a) => {
          if (a === "AmountMismatch")
            return (
              !acceptedKeys.has(buildCorrectionKey(a, db_match.procedure_id)) &&
              !acceptedKeys.has(buildContestKey(db_match.procedure_id))
            );
          return !acceptedKeys.has(buildCorrectionKey(a, db_match.procedure_id));
        });
        if (firstUnresolved) {
          onAcceptCorrection(
            buildCorrectionKey(firstUnresolved, db_match.procedure_id),
            buildAutoCorrection(firstUnresolved, pdf_line, db_match),
          );
        }
      } else if (currentIssue.type === "TooManyMatchIssue") {
        goNext();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIssue, isResolved, goNext, onAcceptCorrection, acceptedKeys]);

  if (sortedIssues.length === 0) {
    return (
      <div className="m3-card-elevated flex flex-col items-center justify-center gap-3 py-12 text-center">
        <div className="w-12 h-12 rounded-full bg-m3-success-container flex items-center justify-center">
          <Check size={24} className="text-m3-on-success-container" />
        </div>
        <p className="text-base font-medium text-m3-on-surface">{t("results.allCorrect")}</p>
      </div>
    );
  }

  const total = sortedIssues.length;
  const progressPct = total > 0 ? Math.round((resolvedCount / total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-m3-on-surface-variant">
            {t("results.progress", { resolved: resolvedCount, total })}
          </span>
          {blockingCount > 0 && (
            <span className="text-xs font-medium text-m3-on-error-container bg-m3-error-container px-2 py-0.5 rounded-full">
              {t("modal.blocking.banner", { count: blockingCount })}
            </span>
          )}
        </div>
        <div className="h-2 w-full rounded-full bg-m3-surface-container-highest overflow-hidden">
          <div
            className="h-full rounded-full bg-m3-primary transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Step navigator */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="m3-icon-button-primary disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Anomalie précédente"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="flex items-center gap-2 text-sm text-m3-on-surface-variant">
          <span>{t("results.stepNav", { current: currentIndex + 1, total })}</span>
          {currentIssue && isResolved(currentIssue) && (
            <Check size={14} className="text-m3-success" />
          )}
        </div>

        <button
          type="button"
          onClick={goNext}
          disabled={currentIndex === total - 1}
          className="m3-icon-button-primary disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Anomalie suivante"
        >
          <ArrowRight size={18} />
        </button>
      </div>

      {/* Current issue card */}
      {currentIssue && (
        <div className="animate-[fadeIn_150ms_ease-out]">
          {currentIssue.type === "NotFoundIssue" && (
            <NotFoundCard
              line={currentIssue.data.pdf_line}
              nearbyCandidates={currentIssue.data.nearby_candidates.filter(
                (c) => !acceptedKeys.has(buildLinkProcedureKey(c.procedure_id)),
              )}
              acceptedKeys={acceptedKeys}
              onAcceptCorrection={onAcceptCorrection}
            />
          )}
          {currentIssue.type === "SingleMatchIssue" && (
            <SingleMatchCard
              pdfLine={currentIssue.data.pdf_line}
              dbMatch={currentIssue.data.db_match}
              acceptedKeys={acceptedKeys}
              autoCorrections={autoCorrections}
              onAcceptCorrection={onAcceptCorrection}
            />
          )}
          {currentIssue.type === "GroupMatchIssue" && (
            <GroupMatchCard
              pdfLine={currentIssue.data.pdf_line}
              dbMatches={currentIssue.data.db_matches}
              acceptedKeys={acceptedKeys}
              autoCorrections={autoCorrections}
              onAcceptCorrection={onAcceptCorrection}
            />
          )}
          {currentIssue.type === "TooManyMatchIssue" && (
            <TooManyCard
              pdfLine={currentIssue.data.pdf_line}
              count={currentIssue.data.candidate_ids.length}
            />
          )}
        </div>
      )}

      {/* Dot navigation */}
      {total > 1 && (
        <div className="flex items-center justify-center gap-1.5 pt-1">
          {sortedIssues.map((issue, i) => {
            const issueKey =
              issue.type === "NotFoundIssue"
                ? `nf-${issue.data.pdf_line.line_index}`
                : issue.type === "SingleMatchIssue"
                  ? `sm-${issue.data.db_match.procedure_id}`
                  : issue.type === "GroupMatchIssue"
                    ? `gm-${issue.data.db_matches.map((m) => m.procedure_id).join("-")}`
                    : `tm-${issue.data.pdf_line.line_index}`;
            return (
              <button
                key={issueKey}
                type="button"
                onClick={() => goTo(i)}
                className={`rounded-full transition-all ${
                  i === currentIndex
                    ? "w-4 h-2 bg-m3-primary"
                    : isResolved(issue)
                      ? "w-2 h-2 bg-m3-success/60"
                      : "w-2 h-2 bg-m3-outline/30 hover:bg-m3-outline/60"
                }`}
                aria-label={`Aller à l'anomalie ${i + 1}`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

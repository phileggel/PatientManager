/**
 * NotFoundCard - Issue card for PDF lines with no matching procedure in the database.
 *
 * Actions:
 * - Create a new procedure (default)
 * - Split the line into several procedures (FPA-251, FPA-252)
 * - Link to a nearby existing procedure (if nearby_candidates available and not yet linked)
 *
 * Sources: acceptedKeys, autoCorrections (parent correction state), onAcceptCorrection callback.
 */

import { Link, Plus, Split } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AutoCorrection, NormalizedPdfLine, NotFoundCandidate } from "@/bindings";
import { Button } from "@/ui/components/button";
import { useFormatters } from "@/ui/format/formatters";
import {
  buildLinkProcedureCorrection,
  buildLinkProcedureKey,
  buildNotFoundCorrection,
  buildNotFoundKey,
  buildSplitCorrection,
} from "../../shared/utils";
import { IssueChip, PdfSummary, ResolvedBadge } from "./CardParts";
import { SplitEditor } from "./SplitEditor";

interface NotFoundCardProps {
  line: NormalizedPdfLine;
  nearbyCandidates: NotFoundCandidate[];
  acceptedKeys: Set<string>;
  autoCorrections: Map<string, AutoCorrection>;
  onAcceptCorrection: (key: string, correction: AutoCorrection) => void;
  /** Tells the parent whether the split editor is open (FPA-251). */
  onSplittingChange?: (open: boolean) => void;
}

export function NotFoundCard({
  line,
  nearbyCandidates,
  acceptedKeys,
  autoCorrections,
  onAcceptCorrection,
  onSplittingChange,
}: NotFoundCardProps) {
  const [splitting, setSplitting] = useState(false);
  const { t } = useTranslation("fund-payment-match");
  const { formatCurrency, formatDate } = useFormatters();

  const createKey = buildNotFoundKey(line);
  const isCreateAccepted = acceptedKeys.has(createKey);
  const linkedCandidate = nearbyCandidates.find((c) =>
    acceptedKeys.has(buildLinkProcedureKey(line.line_index, c.procedure_id)),
  );
  const isResolved = isCreateAccepted || linkedCandidate !== undefined;
  // A card resolved another way (Enter, the global auto-correction) closes its editor.
  useEffect(() => {
    if (isResolved) setSplitting(false);
  }, [isResolved]);
  useEffect(() => {
    onSplittingChange?.(splitting);
    return () => onSplittingChange?.(false);
  }, [splitting, onSplittingChange]);
  const accepted = autoCorrections.get(createKey);
  // FPA-254C: an accepted split says how many procedures it will create.
  const createLabel =
    accepted && "SplitIntoProcedures" in accepted
      ? t("split.will_create", { count: accepted.SplitIntoProcedures.parts.length })
      : t("results.action.will_create");

  return (
    <div className="m3-card-elevated space-y-4">
      <div className="flex items-start justify-between gap-3">
        <IssueChip label={t("results.issue_type.not_found")} variant="error" />
        {isResolved && (
          <ResolvedBadge label={isCreateAccepted ? createLabel : t("results.action.linked")} />
        )}
      </div>

      <PdfSummary line={line} />

      {!isResolved && splitting && (
        <SplitEditor
          line={line}
          onAccept={(parts) => {
            onAcceptCorrection(createKey, buildSplitCorrection(line, parts));
            setSplitting(false);
          }}
          onCancel={() => setSplitting(false)}
        />
      )}

      {!isResolved && !splitting && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-end gap-3 bg-m3-surface-container-low rounded-lg px-3 py-2.5">
            <Button
              id={`fund-payment-match-split-${line.line_index}-open`}
              variant="outline"
              size="sm"
              icon={<Split size={13} />}
              onClick={() => setSplitting(true)}
            >
              {t("split.action")}
            </Button>
            <Button
              id={`fund-payment-match-not-found-${line.line_index}-create`}
              variant="primary"
              size="sm"
              icon={<Plus size={13} />}
              onClick={() => onAcceptCorrection(createKey, buildNotFoundCorrection(line))}
            >
              {t("results.action.create")}
            </Button>
          </div>

          {nearbyCandidates.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-m3-on-surface-variant">
                <div className="flex-1 border-t border-m3-outline/20" />
                <span>{t("results.nearby.title")}</span>
                <div className="flex-1 border-t border-m3-outline/20" />
              </div>
              {nearbyCandidates.map((candidate) => {
                const linkKey = buildLinkProcedureKey(line.line_index, candidate.procedure_id);
                return (
                  <div
                    key={candidate.procedure_id}
                    className="flex items-center justify-between gap-3 bg-m3-surface-container-low rounded-lg px-3 py-2.5"
                  >
                    <div className="text-sm min-w-0">
                      <span className="font-medium text-m3-on-surface">
                        {candidate.patient_name}
                      </span>
                      <span className="text-m3-on-surface-variant ml-1 text-xs">
                        · {candidate.ssn}
                      </span>
                      <div className="text-xs text-m3-on-surface-variant mt-0.5">
                        {formatDate(candidate.procedure_date)} · {formatCurrency(candidate.amount)}
                      </div>
                    </div>
                    <Button
                      id={`fund-payment-match-not-found-${line.line_index}-link-${candidate.procedure_id}`}
                      variant="outline"
                      size="sm"
                      icon={<Link size={13} />}
                      onClick={() =>
                        onAcceptCorrection(linkKey, buildLinkProcedureCorrection(candidate, line))
                      }
                    >
                      {t("results.action.link")}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

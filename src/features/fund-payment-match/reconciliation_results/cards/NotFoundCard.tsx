/**
 * NotFoundCard - Issue card for PDF lines with no matching procedure in the database.
 *
 * Actions:
 * - Create a new procedure (default)
 * - Link to a nearby existing procedure (if nearby_candidates available and not yet linked)
 *
 * Sources: acceptedKeys (parent correction state), onAcceptCorrection callback.
 */

import { Link, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AutoCorrection, NormalizedPdfLine, NotFoundCandidate } from "@/bindings";
import { Button } from "@/ui/components/button";
import {
  buildLinkProcedureCorrection,
  buildLinkProcedureKey,
  buildNotFoundCorrection,
  buildNotFoundKey,
  formatAmount,
} from "../../shared/utils";
import { IssueChip, PdfSummary, ResolvedBadge } from "./CardParts";

interface NotFoundCardProps {
  line: NormalizedPdfLine;
  nearbyCandidates: NotFoundCandidate[];
  acceptedKeys: Set<string>;
  onAcceptCorrection: (key: string, correction: AutoCorrection) => void;
}

export function NotFoundCard({
  line,
  nearbyCandidates,
  acceptedKeys,
  onAcceptCorrection,
}: NotFoundCardProps) {
  const { t } = useTranslation("fund-payment-match");

  const createKey = buildNotFoundKey(line);
  const isCreateAccepted = acceptedKeys.has(createKey);
  const linkedCandidate = nearbyCandidates.find((c) =>
    acceptedKeys.has(buildLinkProcedureKey(c.procedure_id)),
  );
  const isResolved = isCreateAccepted || linkedCandidate !== undefined;

  return (
    <div className="m3-card-elevated space-y-4">
      <div className="flex items-start justify-between gap-3">
        <IssueChip label={t("results.issueType.notFound")} variant="error" />
        {isResolved && (
          <ResolvedBadge
            label={isCreateAccepted ? t("results.action.willCreate") : t("results.action.linked")}
          />
        )}
      </div>

      <PdfSummary line={line} />

      {!isResolved && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-end gap-3 bg-m3-surface-container-low rounded-lg px-3 py-2.5">
            <Button
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
                const linkKey = buildLinkProcedureKey(candidate.procedure_id);
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
                        {candidate.procedure_date} · {formatAmount(candidate.amount)} €
                      </div>
                    </div>
                    <Button
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

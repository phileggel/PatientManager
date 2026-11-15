import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { BankStatementCorrection, BankStatementReconciliation } from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";
import { Button } from "@/ui/components/button";
import { ComboboxField } from "@/ui/components/field/ComboboxField";
import { Switch } from "@/ui/components/switch/Switch";
import { Tag, type TagTone } from "@/ui/components/tag/Tag";
import { useFormatters } from "@/ui/format/formatters";
import { deriveLabelRows, type LabelRow, labelSlug } from "../shared/labelRows";

/** Where a label's assignment comes from (#692): saved, set in this import, none, ignored. */
type LabelOrigin = "known" | "new" | "todo" | "ignored";

const ORIGIN_TONE: Record<LabelOrigin, TagTone> = {
  known: "done",
  new: "new",
  todo: "action",
  ignored: "aside",
};

interface LabelAssociationScreenProps {
  reconciliation: BankStatementReconciliation;
  /** The draft before any correction: its links are the saved ones. */
  initialReconciliation: BankStatementReconciliation | null;
  isBusy: boolean;
  /** Rejection message from the last correction attempt. */
  errorText?: string | null;
  onApplyCorrection: (correction: BankStatementCorrection) => Promise<boolean>;
  onContinue: () => void;
  onCancel: () => void;
  /** Each label's fund (or null when ignored) when the matching step was left;
   *  null on the way in — back from the matching, the primary action returns there. */
  linksAtMatching: ReadonlyMap<string, string | null> | null;
}

/**
 * #692, step 2 — the labels of this import: an « Ignorer » switch, a
 * searchable fund field of one width, the row on one line with its notes under
 * it, a tag for where its link comes from. A link changed on return from the
 * matching says its lines start again (BAS-066B).
 */
export function LabelAssociationScreen({
  reconciliation,
  initialReconciliation,
  isBusy,
  errorText,
  onApplyCorrection,
  onContinue,
  onCancel,
  linksAtMatching,
}: LabelAssociationScreenProps) {
  const isBackFromMatching = linksAtMatching !== null;
  const { t } = useTranslation("bank");
  const { formatCurrency } = useFormatters();
  const funds = useCacheStore((state) => state.funds);
  const rows = deriveLabelRows(reconciliation.lines);
  const savedRows = new Map(
    deriveLabelRows(initialReconciliation?.lines ?? []).map((row) => [row.label, row]),
  );
  // An ignored label switched back on stays « À associer » until a fund is picked.
  const [unignored, setUnignored] = useState<string[]>([]);

  const originOf = (row: LabelRow): LabelOrigin => {
    if (unignored.includes(row.label)) return "todo";
    if (row.isRejected) return "ignored";
    if (!row.fundId) return "todo";
    return savedRows.get(row.label)?.fundId === row.fundId ? "known" : "new";
  };

  const link = (row: LabelRow, fundId: string) => {
    setUnignored((current) => current.filter((label) => label !== row.label));
    void onApplyCorrection({
      type: "LinkFund",
      bank_label: row.label,
      assignment: { type: "Fund", fund_id: fundId },
    });
  };

  const toggleIgnored = (row: LabelRow, ignored: boolean) => {
    if (ignored) {
      setUnignored((current) => current.filter((label) => label !== row.label));
      void onApplyCorrection({
        type: "LinkFund",
        bank_label: row.label,
        assignment: { type: "Rejected" },
      });
      return;
    }
    setUnignored((current) => [...current, row.label]);
  };

  const origins = rows.map((row) => originOf(row));
  const count = (origin: LabelOrigin) => origins.filter((o) => o === origin).length;
  const allDecided = origins.every((origin) => origin !== "todo");

  return (
    <div className="flex flex-col flex-1 gap-3 min-h-0">
      <div className="flex items-center justify-between gap-3">
        <h2 id="label-assoc-title" className="text-base font-semibold text-m3-on-surface">
          {t("label_association.title")}
        </h2>
        <span id="label-assoc-counter" className="text-xs text-m3-on-surface-variant">
          {t("label_association.counter.known", { count: count("known") })} ·{" "}
          {t("label_association.counter.new", { count: count("new") })} ·{" "}
          <span
            className={
              count("todo") > 0 ? "font-semibold text-[var(--color-snackbar-warning-text)]" : ""
            }
          >
            {t("label_association.counter.todo", { count: count("todo") })}
          </span>{" "}
          · {t("label_association.counter.ignored", { count: count("ignored") })}
        </span>
      </div>

      <div
        id="label-assoc-scrollzone"
        className="flex flex-col flex-1 gap-3 min-h-0 overflow-y-auto pr-1"
      >
        {rows.map((row, index) => {
          const origin = origins[index] ?? "todo";
          const slug = labelSlug(row.label);
          const ignored = origin === "ignored";
          const linkAtMatching = linksAtMatching?.get(row.label);
          const currentLink = row.isRejected ? null : row.fundId;
          const changedSinceMatching =
            isBackFromMatching && linkAtMatching !== undefined && linkAtMatching !== currentLink;
          return (
            <div
              key={row.label}
              id={`label-assoc-row-${slug}`}
              className={`rounded-xl border border-m3-outline/20 px-4 py-2.5 ${ignored ? "bg-m3-surface-container-low" : ""}`}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_max-content_30ch_7rem] items-center gap-x-4">
                <div className="flex min-w-0 flex-col">
                  <span
                    className={`truncate italic ${ignored ? "text-m3-on-surface-variant/70 line-through" : "text-m3-on-surface-variant"}`}
                  >
                    {row.label}
                  </span>
                  <span className="whitespace-nowrap text-xs text-m3-on-surface-variant">
                    {t("label_association.line_count", { count: row.count })} ·{" "}
                    {formatCurrency(row.totalAmount)}
                  </span>
                </div>
                <Switch
                  id={`label-assoc-ignore-${slug}`}
                  checked={ignored}
                  onChange={(next) => toggleIgnored(row, next)}
                  label={t("label_association.ignore")}
                  disabled={isBusy}
                />
                <div className={`min-w-0 ${ignored ? "opacity-40" : ""}`}>
                  <ComboboxField
                    id={`label-assoc-fund-${slug}`}
                    label={t("label_association.field_label", { label: row.label })}
                    hideLabel
                    items={funds}
                    displayKey="name"
                    idKey="id"
                    value={origin === "todo" || ignored ? "" : (row.fundId ?? "")}
                    onChange={(fundId) => link(row, fundId)}
                    placeholder={t("label_association.search_placeholder")}
                    disabled={isBusy || ignored}
                  />
                </div>
                <Tag id={`label-assoc-chip-${slug}`} tone={ORIGIN_TONE[origin]}>
                  {t(`label_association.chip.${origin}`)}
                </Tag>

                {origin === "todo" && row.suggestedFundName && (
                  <span
                    id={`label-assoc-suggestion-${slug}`}
                    className="col-start-3 mt-1 text-xs text-m3-on-surface-variant"
                  >
                    {t("label_association.suggestion", { name: row.suggestedFundName })}
                  </span>
                )}
                {ignored && (
                  <p className="col-span-full mt-2 text-xs text-m3-on-surface-variant">
                    {t("label_association.ignored_note")}
                  </p>
                )}
                {changedSinceMatching && (
                  <p
                    id={`label-assoc-changed-${slug}`}
                    className="col-span-full mt-2 text-xs text-m3-tertiary"
                  >
                    {t("label_association.changed_note", { count: row.count })}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {errorText && (
        <p id="label-assoc-error" role="alert" className="text-sm text-m3-error">
          {errorText}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-m3-outline/20 pt-4">
        <Button id="label-assoc-cancel" variant="outline" onClick={onCancel}>
          {t("label_association.cancel_all")}
        </Button>
        <Button
          id="label-assoc-continue"
          variant="primary"
          disabled={isBusy || !allDecided}
          onClick={onContinue}
        >
          {isBackFromMatching
            ? t("label_association.back_to_matching")
            : t("label_association.continue")}
        </Button>
      </div>
    </div>
  );
}

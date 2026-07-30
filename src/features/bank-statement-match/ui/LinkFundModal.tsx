import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { BankStatementCorrection, BankStatementLine, Fund } from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";
import { Button } from "@/ui/components/button";
import { SelectField } from "@/ui/components/field/SelectField";
import { ModalContainer } from "@/ui/components/modal/ModalContainer";
import { sortFundsByName } from "../shared/fundOptions";

interface LinkFundModalProps {
  line: BankStatementLine;
  isOpen: boolean;
  onSubmit: (correction: BankStatementCorrection) => void;
  onCancel: () => void;
  /** Optional fund list override; defaults to the shared cache store. */
  funds?: Fund[];
  /** Rejection message from the last correction attempt, shown inside the dialog. */
  errorText?: string | null;
}

/**
 * BAS-030/032/036/066 — link an unmatched label to a fund, or mark it rejected.
 *
 * The heuristic suggestion (BAS-032) is shown as helper text only — it is never
 * pre-selected (BAS-033); the user must make an explicit choice. Submitting a
 * fund produces a `LinkFund/Fund` correction; rejecting produces `LinkFund/Rejected`.
 */
export function LinkFundModal({
  line,
  isOpen,
  onSubmit,
  onCancel,
  funds,
  errorText,
}: LinkFundModalProps) {
  const { t } = useTranslation("bank");
  const cacheFunds = useCacheStore((state) => state.funds);
  const fundOptions = funds ?? cacheFunds;
  const [selectedFundId, setSelectedFundId] = useState("");

  const bankLabel = line.credit_line.label;

  return (
    <ModalContainer
      id="link-fund-modal"
      isOpen={isOpen}
      onClose={onCancel}
      titleId="link-fund-modal-title"
    >
      <div className="flex flex-col gap-4 p-6">
        <h2 id="link-fund-modal-title" className="text-base font-semibold text-m3-on-surface">
          {t("reconciliation.link_fund.title", { label: bankLabel })}
        </h2>

        {line.suggested_fund_id && line.suggested_fund_name && (
          <p id="link-fund-modal-suggestion" className="text-xs text-m3-on-surface-variant">
            {t("reconciliation.link_fund.suggestion", { name: line.suggested_fund_name })}
          </p>
        )}

        <SelectField
          id="link-fund-modal-fund-select"
          label={t("reconciliation.link_fund.fund_label")}
          value={selectedFundId}
          onChange={(e) => setSelectedFundId(e.target.value)}
          options={[
            { label: t("reconciliation.link_fund.select_placeholder"), value: "" },
            ...sortFundsByName(fundOptions).map((fund) => ({
              label: fund.name,
              value: fund.id,
            })),
          ]}
        />

        {errorText && (
          <p id="link-fund-modal-error" role="alert" className="text-sm text-m3-error">
            {errorText}
          </p>
        )}

        <div className="flex items-center justify-between gap-2">
          <Button
            id="link-fund-modal-reject"
            variant="danger"
            onClick={() =>
              onSubmit({
                type: "LinkFund",
                bank_label: bankLabel,
                assignment: { type: "Rejected" },
              })
            }
          >
            {t("reconciliation.link_fund.reject")}
          </Button>
          <div className="flex items-center gap-2">
            <Button id="link-fund-modal-cancel" variant="secondary" onClick={onCancel}>
              {t("reconciliation.link_fund.cancel")}
            </Button>
            <Button
              id="link-fund-modal-submit"
              variant="primary"
              disabled={selectedFundId === ""}
              onClick={() =>
                onSubmit({
                  type: "LinkFund",
                  bank_label: bankLabel,
                  assignment: { type: "Fund", fund_id: selectedFundId },
                })
              }
            >
              {t("reconciliation.link_fund.submit")}
            </Button>
          </div>
        </div>
      </div>
    </ModalContainer>
  );
}

/**
 * EditFundModal - Fund Edit Dialog
 *
 * Renders when user clicks "Edit" button in FundList.
 * On successful update:
 * 1. Calls updateFund service (sends request to Tauri backend)
 * 2. Backend publishes FundUpdated event
 * 3. useAppInit (root) listens for event and refetches funds
 * 4. Zustand store updates
 * 5. Modal closes automatically, FundList re-renders with fresh data
 * 6. Parent receives onSuccess callback to show confirmation toast
 *
 * No manual data refresh needed - event-driven.
 */

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { AffiliatedFund } from "@/bindings";
import { FundForm } from "@/features/fund/shared/FundForm";
import { logger } from "@/lib/logger";
import { Button, Dialog } from "@/ui/components";
import { useEditFundModal } from "./useEditFundModal";

interface EditFundModalProps {
  fund: AffiliatedFund | null;
  isOpen: boolean;
  onClose: () => void;
}

export function EditFundModal({ fund, isOpen, onClose }: EditFundModalProps) {
  const { t } = useTranslation("fund");
  const { t: tc } = useTranslation("common");

  // Call hook unconditionally at top level (required by React)
  // Hook returns safe defaults if fund is null
  const hookResult = useEditFundModal(fund, onClose);

  useEffect(() => {
    if (isOpen && fund) {
      logger.info("[EditFundModal] Modal opened", {
        fundId: fund.id,
        fundName: fund.name,
      });
    }
  }, [fund, isOpen]);

  if (!isOpen || !fund) return null;

  const { formData, errors, loading, handleChange, handleSubmit } = hookResult;

  const actions = (
    <>
      <Button type="button" onClick={onClose} variant="secondary" disabled={loading}>
        {tc("action.cancel")}
      </Button>
      <Button type="submit" variant="primary" loading={loading}>
        {loading ? t("action.updating") : t("action.update")}
      </Button>
    </>
  );

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={t("action.editTitle")} actions={actions}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <fieldset disabled={loading} className="disabled:opacity-50">
          <FundForm
            formData={formData}
            errors={errors}
            handleChange={handleChange}
            idPrefix="edit-fund"
          />
        </fieldset>
      </form>
    </Dialog>
  );
}

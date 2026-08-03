import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getProcedureWindowDays, setProcedureWindowDays } from "@/infra/settings/store";
import { Dialog } from "@/ui/components";
import { Button } from "@/ui/components/button";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * BAS-118B — the application settings dialog (first entry of the surface):
 * the bank-reconciliation procedure display window, in days (BAS-118).
 * Save validates inline (positive integer) and persists via the settings
 * store; an invalid value never persists and keeps the dialog open.
 */
export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { t } = useTranslation("common");
  const [windowDays, setWindowDays] = useState(() => String(getProcedureWindowDays()));
  const [isInvalid, setIsInvalid] = useState(false);

  const handleSave = () => {
    const parsed = Number(windowDays);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setIsInvalid(true);
      return;
    }
    setProcedureWindowDays(parsed);
    onClose();
  };

  return (
    <Dialog
      id="settings-modal"
      isOpen={isOpen}
      onClose={onClose}
      title={t("settings.title")}
      maxWidth="max-w-md"
    >
      <form
        className="flex flex-col gap-4 pb-2"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
      >
        <div className="flex items-center gap-3">
          <label htmlFor="settings-window-days-input" className="text-sm text-m3-on-surface flex-1">
            {t("settings.window_days_label")}
          </label>
          <input
            id="settings-window-days-input"
            type="number"
            min={1}
            step={1}
            value={windowDays}
            onChange={(e) => {
              setWindowDays(e.target.value);
              setIsInvalid(false);
            }}
            className="w-24 rounded-lg border border-m3-outline bg-m3-surface-container-high px-3 py-2 text-sm text-m3-on-surface"
          />
          <span className="text-sm text-m3-on-surface-variant">
            {t("settings.window_days_unit")}
          </span>
        </div>

        <p className="text-xs text-m3-on-surface-variant">{t("settings.window_days_help")}</p>

        {isInvalid && (
          <p id="settings-error" role="alert" className="text-sm text-m3-error">
            {t("settings.window_days_invalid")}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button id="settings-cancel" variant="secondary" onClick={onClose}>
            {t("settings.cancel")}
          </Button>
          <Button id="settings-save" variant="primary" type="submit">
            {t("settings.save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FundAssignment } from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";
import { Button, Dialog, SelectField, TextField } from "@/ui/components";
import type { BankStatementLabelRow } from "../shared/presenter";

const IGNORED = "ignored";

interface EditBankStatementLabelModalProps {
  row: BankStatementLabelRow | null;
  onSubmit: (id: string, assignment: FundAssignment) => Promise<void>;
  onClose: () => void;
}

/**
 * BAS-042 / BAS-042A — reassign a label: account and label read-only, the
 * picker offers « Ignoré » first, then the active funds in their usual order.
 */
export function EditBankStatementLabelModal({
  row,
  onSubmit,
  onClose,
}: EditBankStatementLabelModalProps) {
  const { t } = useTranslation("bank");
  const funds = useCacheStore((s) => s.funds);
  const [choice, setChoice] = useState(IGNORED);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (row) setChoice(row.fundId ?? IGNORED);
  }, [row]);

  if (!row) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const assignment: FundAssignment =
      choice === IGNORED ? { type: "Rejected" } : { type: "Fund", fund_id: choice };
    await onSubmit(row.id, assignment);
    setSaving(false);
    onClose();
  };

  const options = [
    { label: t("statement_label.edit.ignore_option"), value: IGNORED },
    ...funds.map((f) => ({ label: f.name, value: f.id })),
  ];

  return (
    <Dialog
      id="edit-bank-statement-label-modal"
      isOpen
      onClose={onClose}
      title={t("statement_label.edit.title")}
      actions={
        <>
          <Button
            id="edit-bank-statement-label-cancel"
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={saving}
          >
            {t("statement_label.edit.cancel")}
          </Button>
          <Button
            id="edit-bank-statement-label-submit"
            type="submit"
            form="edit-bank-statement-label-form"
            variant="primary"
            loading={saving}
          >
            {t("statement_label.edit.save")}
          </Button>
        </>
      }
    >
      <form
        id="edit-bank-statement-label-form"
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
      >
        <TextField
          id="edit-bank-statement-label-account"
          label={t("statement_label.columns.account")}
          value={row.accountName}
          readOnly
        />
        <TextField
          id="edit-bank-statement-label-label"
          label={t("statement_label.columns.label")}
          value={row.label}
          readOnly
        />
        <SelectField
          id="edit-bank-statement-label-fund"
          label={t("statement_label.columns.fund")}
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          options={options}
        />
      </form>
    </Dialog>
  );
}

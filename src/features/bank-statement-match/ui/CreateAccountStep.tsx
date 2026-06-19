import { useTranslation } from "react-i18next";
import { TextField } from "@/ui/components/field";

interface CreateAccountStepProps {
  iban: string | null;
  name: string;
  error: string | null;
  isCreating: boolean;
  onNameChange: (value: string) => void;
  onSubmit: () => void;
}

export function CreateAccountStep({
  iban,
  name,
  error,
  isCreating,
  onNameChange,
  onSubmit,
}: CreateAccountStepProps) {
  const { t } = useTranslation("bank");
  return (
    <form
      id="create-account-form"
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="space-y-1">
        <p className="text-lg font-medium text-m3-on-surface">
          {t("statement.modal.create_account.title")}
        </p>
        <p className="text-sm text-m3-on-surface-variant">
          {t("statement.modal.create_account.description", { iban })}
        </p>
      </div>
      <TextField
        id="create-account-iban"
        label={t("statement.modal.create_account.iban_label")}
        value={iban ?? ""}
        readOnly
        disabled
      />
      <TextField
        id="create-account-name"
        label={t("statement.modal.create_account.name_label")}
        placeholder={t("statement.modal.create_account.name_placeholder")}
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        disabled={isCreating}
        autoFocus
      />
      {error && (
        <p role="alert" className="text-sm text-m3-error">
          {error}
        </p>
      )}
    </form>
  );
}

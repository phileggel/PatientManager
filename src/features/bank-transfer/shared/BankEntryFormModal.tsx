import { X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  BankEntryType,
  DirectPaymentProcedureCandidate,
  FundGroupCandidate,
} from "@/bindings";
import {
  Button,
  ConfirmationDialog,
  DateField,
  IconButton,
  ModalContainer,
  SelectField,
} from "@/ui/components";
import { useFormatters } from "@/ui/format/formatters";
import { SelectFundGroupsPanel } from "../select_items_panel/SelectFundGroupsPanel";
import { SelectProceduresPanel } from "../select_items_panel/SelectProceduresPanel";
import type { BankEntryFieldErrorKeys } from "./errorPresenter";
import type { BankEntryKind } from "./presenter";

const PAYMENT_METHODS: { value: BankEntryType; labelKey: string }[] = [
  { value: "PATIENT_CHECK", labelKey: "transfer.type_check" },
  { value: "PATIENT_CREDIT_CARD", labelKey: "transfer.type_credit_card" },
  { value: "PATIENT_CASH", labelKey: "transfer.type_cash" },
];

interface BankEntryFormModalProps {
  /** Prefix of every id in the window (`direct-payment-add`); F25. */
  id: string;
  kind: BankEntryKind;
  mode: "add" | "edit";
  isOpen: boolean;
  /** Closes the window, once confirmed when something was entered. */
  onClose: () => void;
  isDirty: boolean;
  transferDate: string;
  onDateChange: (value: string) => void;
  transferType: BankEntryType;
  /** Absent when editing: a payment's method is fixed (R4). */
  onTypeChange?: (type: BankEntryType) => void;
  bankAccount: string;
  bankAccountOptions: { value: string; label: string }[];
  /** Absent when editing: a wire's account is shown, not changed (BSM-033). */
  onBankAccountChange?: (value: string) => void;
  selectedGroupIds: string[];
  selectedProcedureIds: string[];
  currentGroups?: FundGroupCandidate[];
  currentProcedures?: DirectPaymentProcedureCandidate[];
  onGroupsChange: (ids: string[], totalMillis: number) => void;
  onProceduresChange: (ids: string[], totalMillis: number) => void;
  totalAmountMillis: number;
  fieldErrors: BankEntryFieldErrorKeys;
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

/**
 * #642 — the window that records or edits a direct payment or a fund wire, in the
 * procedure window's frame. Its button names the amount once something is ticked and
 * is off with nothing ticked; closing after an entry asks first, as #696.
 */
export function BankEntryFormModal(props: BankEntryFormModalProps) {
  const { id, kind, mode, isOpen, onClose, isDirty, fieldErrors, submitting } = props;
  const { t } = useTranslation("bank");
  const { t: tCommon } = useTranslation("common");
  const { formatCurrency } = useFormatters();
  const [isConfirmingAbandon, setIsConfirmingAbandon] = useState(false);

  const requestClose = () => {
    if (isDirty) {
      setIsConfirmingAbandon(true);
      return;
    }
    onClose();
  };

  const isFund = kind === "fund";
  const selectionCount = isFund ? props.selectedGroupIds.length : props.selectedProcedureIds.length;
  const verb = mode === "add" ? "save" : "update";
  const submitLabel =
    selectionCount > 0
      ? t(`transfer.${kind}.${verb}_amount`, { amount: formatCurrency(props.totalAmountMillis) })
      : t(`transfer.${kind}.${verb}`);
  const formId = `${id}-form`;
  const titleId = `${id}-title`;

  return (
    <>
      <ModalContainer
        id={`${id}-modal`}
        isOpen={isOpen}
        onClose={requestClose}
        maxWidth="max-w-2xl"
        titleId={titleId}
      >
        <div className="flex items-center justify-between p-5">
          <h2 id={titleId} className="text-xl font-semibold text-m3-on-surface">
            {t(`transfer.${kind}.${mode === "add" ? "add_title" : "edit_title"}`)}
          </h2>
          <IconButton
            id={`${id}-close`}
            variant="ghost"
            shape="round"
            size="sm"
            aria-label={tCommon("action.close")}
            icon={<X size={18} />}
            onClick={requestClose}
          />
        </div>

        <form
          id={formId}
          onSubmit={props.onSubmit}
          noValidate
          className="flex-1 overflow-y-auto p-5 flex flex-col gap-4"
        >
          <DateField
            id={`${id}-date`}
            label={isFund ? t("transfer.date") : t("transfer.payment_date")}
            value={props.transferDate}
            onChange={(e) => props.onDateChange(e.target.value)}
            error={fieldErrors.transferDate && t(fieldErrors.transferDate)}
          />

          {isFund ? (
            <SelectField
              id={`${id}-account`}
              className="disabled:opacity-60 disabled:cursor-default"
              label={t("transfer.bank_account")}
              value={props.bankAccount}
              disabled={!props.onBankAccountChange}
              onChange={(e) => props.onBankAccountChange?.(e.target.value)}
              options={
                props.onBankAccountChange
                  ? [
                      { value: "", label: t("transfer.select_bank_account") },
                      ...props.bankAccountOptions,
                    ]
                  : props.bankAccountOptions
              }
              error={fieldErrors.bankAccount && t(fieldErrors.bankAccount)}
            />
          ) : (
            <SelectField
              id={`${id}-method`}
              className="disabled:opacity-60 disabled:cursor-default"
              label={t("transfer.payment_method")}
              value={props.transferType}
              disabled={!props.onTypeChange}
              onChange={(e) => props.onTypeChange?.(e.target.value as BankEntryType)}
              options={PAYMENT_METHODS.map((m) => ({ value: m.value, label: t(m.labelKey) }))}
            />
          )}

          {isFund ? (
            <SelectFundGroupsPanel
              transferDate={props.transferDate}
              selectedGroupIds={props.selectedGroupIds}
              onSelectionChange={props.onGroupsChange}
              currentGroups={props.currentGroups}
            />
          ) : (
            <SelectProceduresPanel
              transferDate={props.transferDate}
              selectedProcedureIds={props.selectedProcedureIds}
              onSelectionChange={props.onProceduresChange}
              currentProcedures={props.currentProcedures}
            />
          )}
        </form>

        <div className="flex gap-3 p-5 bg-m3-surface-container-low">
          <Button
            id={`${id}-cancel`}
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={requestClose}
          >
            {tCommon("action.cancel")}
          </Button>
          <Button
            id={`${id}-submit`}
            type="submit"
            form={formId}
            variant="primary"
            className="flex-1"
            loading={submitting}
            disabled={submitting || selectionCount === 0}
          >
            {submitLabel}
          </Button>
        </div>
      </ModalContainer>

      <ConfirmationDialog
        id={`${id}-abandon-confirmation`}
        isOpen={isConfirmingAbandon}
        title={t(`transfer.${kind}.abandon_title`)}
        message={
          mode === "add"
            ? t(`transfer.${kind}.abandon_message`)
            : t("transfer.abandon.message_edit")
        }
        confirmLabel={t("transfer.abandon.confirm")}
        cancelLabel={t("transfer.abandon.cancel")}
        variant="danger"
        onConfirm={() => {
          setIsConfirmingAbandon(false);
          onClose();
        }}
        onCancel={() => setIsConfirmingAbandon(false)}
      />
    </>
  );
}

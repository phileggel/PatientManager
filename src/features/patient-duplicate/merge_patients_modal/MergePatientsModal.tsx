import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DuplicatePair, PatientSummary } from "@/bindings";
import { Button, Dialog } from "@/ui/components";
import { PatientActivity } from "../shared/PatientSummaryText";

type Choice = "first" | "second";

interface MergePatientsModalProps {
  pair: DuplicatePair | null;
  /** Resolves to whether the merge was done. */
  onMerge: (keptPatientId: string, otherPatientId: string) => Promise<boolean>;
  onClose: () => void;
}

interface PatientChoiceProps {
  choice: Choice;
  patient: PatientSummary;
  selected: boolean;
  disabled: boolean;
  onSelect: (choice: Choice) => void;
}

function PatientChoice({ choice, patient, selected, disabled, onSelect }: PatientChoiceProps) {
  const { t } = useTranslation("patient");
  return (
    <label
      id={`patient-duplicate-merge-choice-${choice}`}
      className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-m3-primary ${
        selected
          ? "border-m3-primary bg-m3-surface"
          : "border-transparent bg-m3-surface-container-high"
      }`}
    >
      <input
        id={`patient-duplicate-merge-keep-${choice}`}
        type="radio"
        name="patient-duplicate-merge-keep"
        className="sr-only"
        checked={selected}
        disabled={disabled}
        onChange={() => onSelect(choice)}
      />
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
          selected
            ? "border-m3-primary bg-m3-primary text-m3-on-primary"
            : "border-m3-outline bg-transparent"
        }`}
      >
        {selected && <Check size={12} strokeWidth={3} />}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-m3-on-surface">
          {t(`duplicates.merge_dialog.${choice}`)}
        </span>
        <span className="font-mono text-sm text-m3-on-surface">
          {t("list.ssn")} {patient.ssn || "—"}
        </span>
        <span className="text-xs text-m3-on-surface-variant">
          <PatientActivity patient={patient} />
        </span>
      </span>
    </label>
  );
}

/**
 * PDU-020, PDU-027 — pick the patient to keep (the first of the pair by
 * default), read what the merge does, confirm. Stays open when the merge fails.
 */
export function MergePatientsModal({ pair, onMerge, onClose }: MergePatientsModalProps) {
  const { t } = useTranslation("patient");
  const [kept, setKept] = useState<Choice>("first");
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    if (pair) setKept("first");
  }, [pair]);

  if (!pair) return null;

  const other: Choice = kept === "first" ? "second" : "first";

  const handleMerge = async () => {
    setMerging(true);
    const done = await onMerge(pair[kept].id, pair[other].id);
    setMerging(false);
    if (done) onClose();
  };

  return (
    <Dialog
      id="patient-duplicate-merge-modal"
      isOpen
      onClose={merging ? () => {} : onClose}
      title={t("duplicates.merge_dialog.title", { name: pair.name })}
      actions={
        <>
          <Button
            id="patient-duplicate-merge-cancel"
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={merging}
          >
            {t("duplicates.merge_dialog.cancel")}
          </Button>
          <Button
            id="patient-duplicate-merge-confirm"
            type="button"
            variant="danger"
            loading={merging}
            onClick={handleMerge}
          >
            {t("duplicates.merge")}
          </Button>
        </>
      }
    >
      <fieldset className="flex flex-col gap-4 border-0 p-0 m-0">
        <legend className="text-sm text-m3-on-surface-variant mb-3">
          {t("duplicates.merge_dialog.question")}
        </legend>
        <PatientChoice
          choice="first"
          patient={pair.first}
          selected={kept === "first"}
          disabled={merging}
          onSelect={setKept}
        />
        <PatientChoice
          choice="second"
          patient={pair.second}
          selected={kept === "second"}
          disabled={merging}
          onSelect={setKept}
        />
        <p id="patient-duplicate-merge-consequence" className="text-sm text-m3-on-surface-variant">
          {t(`duplicates.merge_dialog.consequence_${other}`, {
            count: pair[other].procedure_count,
          })}
        </p>
      </fieldset>
    </Dialog>
  );
}

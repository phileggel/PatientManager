import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DuplicatePair, PatientSummary } from "@/bindings";
import { Button } from "@/ui/components";
import { MergePatientsModal } from "../merge_patients_modal/MergePatientsModal";
import { PatientActivity } from "../shared/PatientSummaryText";
import { filterPairs, pairId } from "../shared/presenter";
import type { usePatientDuplicateList } from "./usePatientDuplicateList";

type PatientDuplicateListProps = ReturnType<typeof usePatientDuplicateList> & {
  searchTerm: string;
};

function PatientCell({ patient }: { patient: PatientSummary }) {
  return (
    <td className="m3-td">
      <div className="font-mono text-sm text-m3-on-surface">{patient.ssn || "—"}</div>
      <div className="text-xs text-m3-on-surface-variant">
        <PatientActivity patient={patient} />
      </div>
    </td>
  );
}

/** PDU-012 to PDU-015 — one row per candidate pair, with its two actions. */
export function PatientDuplicateList({
  searchTerm,
  pairs,
  loading,
  loadFailed,
  merge,
  dismiss,
}: PatientDuplicateListProps) {
  const { t } = useTranslation("patient");
  const [merging, setMerging] = useState<DuplicatePair | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const visible = useMemo(() => filterPairs(pairs, searchTerm), [pairs, searchTerm]);

  // PDU-027 — a reload that no longer holds the pair closes its dialog.
  useEffect(() => {
    setMerging((current) =>
      current && !pairs.some((pair) => pairId(pair) === pairId(current)) ? null : current,
    );
  }, [pairs]);

  const handleDismiss = async (pair: DuplicatePair) => {
    setDismissing(pairId(pair));
    await dismiss(pair);
    setDismissing(null);
  };

  const message = loading
    ? t("duplicates.loading")
    : loadFailed
      ? t("duplicates.load_error")
      : visible.length === 0
        ? t("duplicates.empty")
        : null;

  return (
    <div id="patient-duplicate-list" className="m3-table-container flex-1">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-m3-surface-container z-10">
          <tr>
            <th className="m3-th">{t("duplicates.columns.name")}</th>
            <th className="m3-th">{t("duplicates.columns.first")}</th>
            <th className="m3-th">{t("duplicates.columns.second")}</th>
            <th className="m3-th text-right">{t("duplicates.columns.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {message ? (
            <tr>
              <td
                id="patient-duplicate-message"
                colSpan={4}
                className="m3-td text-center py-12 text-m3-on-surface-variant"
              >
                {message}
              </td>
            </tr>
          ) : (
            visible.map((pair) => {
              const id = pairId(pair);
              return (
                <tr key={id} id={`patient-duplicate-row-${id}`} className="m3-tr">
                  <td className="m3-td font-medium text-m3-on-surface">{pair.name}</td>
                  <PatientCell patient={pair.first} />
                  <PatientCell patient={pair.second} />
                  <td className="m3-td text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        id={`patient-duplicate-dismiss-${id}`}
                        type="button"
                        variant="secondary"
                        size="sm"
                        loading={dismissing === id}
                        onClick={() => handleDismiss(pair)}
                      >
                        {t("duplicates.dismiss")}
                      </Button>
                      <Button
                        id={`patient-duplicate-merge-${id}`}
                        type="button"
                        variant="primary"
                        size="sm"
                        disabled={dismissing === id}
                        onClick={() => setMerging(pair)}
                      >
                        {t("duplicates.merge")}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      <MergePatientsModal pair={merging} onMerge={merge} onClose={() => setMerging(null)} />
    </div>
  );
}

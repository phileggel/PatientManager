import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DuplicatePair, PatientDuplicatesError } from "@/bindings";
import { toastService } from "@/ui/components/snackbar";
import { dismissPatientDuplicate, listPatientDuplicates, mergePatients } from "../gateway";
import { formatDuplicateError, isStalePair } from "../shared/presenter";

/**
 * PDU-015, PDU-027, PDU-033 — loads the candidate pairs, and merges or dismisses
 * one. Success confirms and reloads; a pair that no longer exists is reported
 * and reloads; any other failure is reported and the list stays as it was.
 */
export function usePatientDuplicateList() {
  const { t } = useTranslation("patient");
  const [pairs, setPairs] = useState<DuplicatePair[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    const result = await listPatientDuplicates();
    if (result.success) {
      setPairs(result.data);
      setLoadFailed(false);
    } else {
      setLoadFailed(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reportFailure = useCallback(
    async (error: PatientDuplicatesError) => {
      toastService.show("error", t(formatDuplicateError(error).key));
      if (isStalePair(error)) await load();
    },
    [load, t],
  );

  /** Resolves to whether the merge was done, so the dialog knows to close. */
  const merge = useCallback(
    async (keptPatientId: string, otherPatientId: string): Promise<boolean> => {
      const result = await mergePatients(keptPatientId, otherPatientId);
      if (result.success) {
        toastService.show("success", t("duplicates.merged"));
        await load();
        return true;
      }
      await reportFailure(result.error);
      return false;
    },
    [load, reportFailure, t],
  );

  const dismiss = useCallback(
    async (pair: DuplicatePair) => {
      const result = await dismissPatientDuplicate(pair.first.id, pair.second.id);
      if (result.success) {
        await load();
        return;
      }
      await reportFailure(result.error);
    },
    [load, reportFailure],
  );

  return { pairs, loading, loadFailed, merge, dismiss };
}

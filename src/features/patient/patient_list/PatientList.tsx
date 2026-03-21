/**
 * PatientList - Patient Data Table with CRUD Actions
 *
 * - Data: usePatientList (reads store, applies toRow() transformation)
 * - Sorting/filtering: useSortPatientList
 * - Delete: confirmation dialog, calls deletePatient service
 * - Edit: double-click or Edit button opens EditPatientModal
 * - Updates: event-driven from useAppInit
 */

import { ArrowDown, ArrowUp, Edit2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Patient } from "@/bindings";
import { toastService } from "@/core/snackbar";

import { logger } from "@/lib/logger";
import { ConfirmationDialog } from "@/ui/components";
import { EditPatientModal } from "../edit_patient_modal/EditPatientModal";
import type { PatientRow } from "../shared/types";
import { usePatientList } from "./usePatientList";
import type { SortConfig } from "./useSortPatientList";
import { useSortPatientList } from "./useSortPatientList";

// Moved outside component to avoid recreation on every render
function SortIcon({ sortConfig, column }: { sortConfig: SortConfig; column: SortConfig["key"] }) {
  if (sortConfig.key !== column) return null;
  return sortConfig.direction === "asc" ? (
    <ArrowUp size={14} className="ml-1 text-m3-primary" />
  ) : (
    <ArrowDown size={14} className="ml-1 text-m3-primary" />
  );
}

interface PatientListProps {
  searchTerm: string;
}

export function PatientList({ searchTerm }: PatientListProps) {
  const { t } = useTranslation("patient");
  const { t: tc } = useTranslation("common");
  const { patientRows, patients, loading, deletePatient } = usePatientList();

  useEffect(() => {
    logger.info("[PatientList] Component mounted");
  }, []);

  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [lastClickTime, setLastClickTime] = useState<number>(0);
  const { sortedAndFilteredPatients, sortConfig, handleSort } = useSortPatientList(
    patientRows,
    searchTerm,
  );

  // Modals
  const [deleteData, setDeleteData] = useState<{ id: string; name: string } | null>(null);
  const [editData, setEditData] = useState<Patient | null>(null);

  const handleRowClick = (patientId: string | undefined) => {
    if (!patientId) return;

    const now = Date.now();
    const isDoubleClick = lastClickedId === patientId && now - lastClickTime < 300;

    setLastClickedId(patientId);
    setLastClickTime(now);

    if (isDoubleClick) {
      const patientObject = patients.find((p) => p.id === patientId);
      if (patientObject) {
        setEditData(patientObject);
      }
    }
  };

  return (
    <div className="m3-table-container flex-1">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-m3-surface-container z-10">
          <tr>
            <th className="m3-th" onClick={() => handleSort("name")}>
              <div className="flex items-center">
                {t("list.name")} <SortIcon sortConfig={sortConfig} column="name" />
              </div>
            </th>
            <th className="m3-th text-right" onClick={() => handleSort("ssn")}>
              <div className="flex items-center">
                {t("list.ssn")} <SortIcon sortConfig={sortConfig} column="ssn" />
              </div>
            </th>
            <th className="m3-th text-right" onClick={() => handleSort("latestFund")}>
              <div className="flex items-center">
                {t("list.latestFund")} <SortIcon sortConfig={sortConfig} column="latestFund" />
              </div>
            </th>
            <th className="m3-th text-right" onClick={() => handleSort("latestDate")}>
              <div className="flex items-center">
                {t("list.latestDate")} <SortIcon sortConfig={sortConfig} column="latestDate" />
              </div>
            </th>
            <th className="m3-th text-right">{tc("table.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={5} className="m3-td text-center py-12">
                <span className="text-m3-on-surface-variant animate-pulse">
                  {t("list.loading")}
                </span>
              </td>
            </tr>
          ) : sortedAndFilteredPatients.length === 0 ? (
            <tr>
              <td colSpan={5} className="m3-td text-center py-12 text-m3-on-surface-variant">
                {t("list.noData")}
              </td>
            </tr>
          ) : (
            sortedAndFilteredPatients.map((patient: PatientRow) => {
              const patientObject = patients.find((p) => p.id === patient.id);
              return (
                <tr
                  key={patient.rowId}
                  onClick={() => handleRowClick(patient.id)}
                  className="m3-tr cursor-pointer select-none"
                  title={tc("table.doubleClickToEdit")}
                >
                  <td className="m3-td font-medium text-m3-on-surface">{patient.name || "-"}</td>
                  <td className="m3-td text-m3-on-surface font-mono">{patient.ssn || "-"}</td>
                  <td className="m3-td text-m3-on-surface">{patient.latestFund || "-"}</td>
                  <td className="m3-td text-m3-on-surface">{patient.latestDate || "-"}</td>
                  <td className="m3-td text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        className="m3-icon-button-primary"
                        aria-label={t("action.editAriaLabel", { name: patient.name || "" })}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (patientObject) {
                            setEditData(patientObject);
                          }
                        }}
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        type="button"
                        className="m3-icon-button-error"
                        aria-label={t("action.deleteAriaLabel", { name: patient.name || "" })}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (patient.id && patient.name) {
                            setDeleteData({ id: patient.id, name: patient.name });
                          }
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {/* Edit Patient Modal */}
      <EditPatientModal isOpen={!!editData} onClose={() => setEditData(null)} patient={editData} />

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={!!deleteData}
        onCancel={() => setDeleteData(null)}
        onConfirm={async () => {
          if (deleteData) {
            try {
              await deletePatient(deleteData.id);
              setDeleteData(null);
              toastService.show("success", t("action.delete.success", { name: deleteData.name }));
            } catch (error) {
              logger.error("Delete patient failed", { error, patientId: deleteData.id });
              toastService.show("error", t("action.delete.error", { error: String(error) }));
            }
          }
        }}
        title={t("action.delete.title")}
        message={t("action.delete.message", { name: deleteData?.name })}
        confirmLabel={t("action.delete.confirm")}
        cancelLabel={tc("action.cancel")}
        variant="danger"
      />
    </div>
  );
}

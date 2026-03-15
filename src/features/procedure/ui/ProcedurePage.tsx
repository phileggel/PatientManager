import { Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Procedure } from "@/bindings";

import { toastService } from "@/core/snackbar";
import { PageContent } from "@/features/shell";
import { logger } from "@/lib/logger";
import { ConfirmationDialog } from "@/ui/components";
import * as gateway from "../api/gateway";
import { useProcedureData } from "../hooks/useProcedureData";
import { useProcedurePeriod } from "../hooks/useProcedurePeriod";
import { toProcedureRow } from "../model/procedure-row.mapper";
import type { ProcedureRow } from "../model/procedure-row.types";
import { AddProcedurePanel } from "./add_procedure_panel/AddProcedurePanel";
import { PeriodSelector } from "./PeriodSelector";
import { ProcedureUpdateModal } from "./ProcedureUpdateModal";
import { SummaryStats } from "./SummaryStats";
import { WorkflowTable } from "./WorkflowTable";

const TAG = "[ProcedurePage]";

/**
 * Production Procedure Page with backend integration
 *
 * Connects WorkflowTable to real Tauri backend via gateway.ts
 */
export default function ProcedurePage() {
  const { t } = useTranslation("procedure");

  useEffect(() => {
    logger.info(`${TAG} Component mounted`);
  }, []);

  const { initialRows, patients, funds, procedureTypes, isLoading, error, handlers } =
    useProcedureData();

  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const saved = sessionStorage.getItem("procedureSelectedMonth");
    return saved ? parseInt(saved, 10) : currentDate.getMonth() + 1;
  });
  const [selectedYear, setSelectedYear] = useState(() => {
    const saved = sessionStorage.getItem("procedureSelectedYear");
    return saved ? parseInt(saved, 10) : currentDate.getFullYear();
  });
  const [rows, setRows] = useState<ProcedureRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingProcedure, setEditingProcedure] = useState<ProcedureRow | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Persist selected month/year to session storage
  useEffect(() => {
    sessionStorage.setItem("procedureSelectedMonth", selectedMonth.toString());
    sessionStorage.setItem("procedureSelectedYear", selectedYear.toString());
  }, [selectedMonth, selectedYear]);

  // Initialize rows from backend data
  useEffect(() => {
    if (!isLoading) {
      setRows(initialRows);
    }
  }, [isLoading, initialRows]);

  // Filter local rows (includes unsaved drafts) by selected period
  const { yearRange, filteredRows: periodFilteredRows } = useProcedurePeriod(
    rows,
    selectedMonth,
    selectedYear,
  );

  // Apply search filter on top of period filter
  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return periodFilteredRows;

    return periodFilteredRows.filter(
      (row) =>
        row.isDraft ||
        (row.patientName?.toLowerCase().includes(term) ?? false) ||
        (row.status?.toLowerCase().includes(term) ?? false),
    );
  }, [periodFilteredRows, searchTerm]);

  const handleRowUiSync = useCallback((rowId: string, updateFields: Partial<ProcedureRow>) => {
    setRows((prevRows) =>
      prevRows.map((row) => (row.rowId === rowId ? { ...row, ...updateFields } : row)),
    );
  }, []);

  const handleAddNewRow = useCallback(() => {
    const draft = buildNewDraftRow();
    // Associate draft with current period for filtering (separate from actual procedureDate)
    const monthStr = selectedMonth.toString().padStart(2, "0");
    draft.draftPeriod = `${selectedYear}-${monthStr}`;
    setRows((prev) => [...prev, draft]);
  }, [selectedMonth, selectedYear]);

  const handleEdit = useCallback((row: ProcedureRow) => {
    setEditingProcedure(row);
  }, []);

  const handleCloseModal = useCallback(() => {
    setEditingProcedure(null);
  }, []);

  const handleDelete = useCallback((id: string) => {
    setPendingDeleteId(id);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDeleteId) return;
    try {
      await handlers.deleteRow(pendingDeleteId);
      toastService.show("success", t("state.deleted"));
      const updated = await gateway.readAllProcedures();
      const mappedRows = updated.map((proc) =>
        toProcedureRow(proc, { patients, funds, procedureTypes }),
      );
      setRows(mappedRows);
    } catch (error) {
      toastService.show("error", error instanceof Error ? error.message : String(error));
    } finally {
      setPendingDeleteId(null);
    }
  }, [pendingDeleteId, handlers, patients, funds, procedureTypes, t]);

  const handleCancelDelete = useCallback(() => {
    setPendingDeleteId(null);
  }, []);

  // Listen for backend procedure updates (only register once, use ref for latest values)
  const handleProcedureUpdate = useCallback(async () => {
    logger.info(TAG, "Procedure update event received, refreshing list");
    try {
      const updated = await gateway.readAllProcedures();
      const mappedRows = updated.map((proc) =>
        toProcedureRow(proc, {
          patients,
          funds,
          procedureTypes,
        }),
      );
      setRows(mappedRows);
    } catch (error) {
      logger.error(TAG, "Error refreshing procedures after update", { error });
    }
  }, [patients, funds, procedureTypes]);

  useEffect(() => {
    window.addEventListener("procedure_updated", handleProcedureUpdate);
    return () => window.removeEventListener("procedure_updated", handleProcedureUpdate);
  }, [handleProcedureUpdate]);

  if (isLoading) {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center bg-slate-50">
        <div className="text-slate-600">{t("state.loading")}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center bg-slate-50">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-900">
          <h2 className="text-lg font-semibold mb-2">{t("error.loading")}</h2>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  // Convert ProcedureRow to Procedure for modal
  const procedureForModal = editingProcedure
    ? ({
        id: editingProcedure.id || "",
        patient_id: editingProcedure.patientId || "",
        fund_id: editingProcedure.fundId || null,
        procedure_type_id: editingProcedure.procedureTypeId || "",
        procedure_date: editingProcedure.procedureDate || "",
        // Convert euros back to thousandths for domain/modal compatibility
        procedure_amount:
          editingProcedure.procedureAmount != null
            ? Math.round(editingProcedure.procedureAmount * 1000)
            : 0,
        payment_method: editingProcedure.paymentMethod,
        confirmed_payment_date: editingProcedure.confirmedPaymentDate,
        payment_status: editingProcedure.status || "NONE",
        actual_payment_amount:
          editingProcedure.actualPaymentAmount != null
            ? Math.round(editingProcedure.actualPaymentAmount * 1000)
            : null,
        awaited_amount:
          editingProcedure.awaitedAmount != null
            ? Math.round(editingProcedure.awaitedAmount * 1000)
            : null,
        created_at: "",
        is_deleted: false,
      } as Procedure)
    : null;

  return (
    <>
      {/* Header with controls and stats */}
      <div className="border-b bg-white p-4 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <PeriodSelector
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              yearRange={yearRange}
              onMonthChange={setSelectedMonth}
              onYearChange={setSelectedYear}
            />
            <div className="relative w-64">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <input
                type="text"
                placeholder={t("filter.placeholder")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="m3-input pl-10 w-full"
              />
            </div>
          </div>
          <SummaryStats rows={filteredRows} />
        </div>
      </div>

      {/* Content area with table and form */}
      <PageContent layout="row">
        {/* Left: Workflow Table */}
        <div className="flex-1 min-w-0 overflow-auto">
          <WorkflowTable
            month={selectedMonth}
            year={selectedYear}
            initialRows={filteredRows}
            allPatients={patients}
            allFunds={funds}
            allProcedureTypes={procedureTypes}
            onAddNewRow={handleAddNewRow}
            onRowUiSync={handleRowUiSync}
            persistNewRow={handlers.saveRow}
            persistUpdateRow={handlers.updateRow}
            persistNewPatient={handlers.savePatient}
            persistNewFund={handlers.saveFund}
            persistNewProcedureType={handlers.saveProcedureType}
            onEdit={handleEdit}
            onDelete={handleDelete}
            editingRowId={editingProcedure?.id}
          />
        </div>

        {/* Right: Add Procedure Form */}
        <div className="w-96 flex-shrink-0 flex flex-col bg-m3-surface-container-high rounded-4xl border border-m3-outline/10 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-m3-outline/5 bg-m3-surface-container-high/50">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-m3-primary-container text-m3-on-primary-container rounded-xl">
                <Plus size={24} strokeWidth={2.5} />
              </div>
              <h2 className="text-xl font-bold text-m3-on-surface">{t("action.add")}</h2>
            </div>
          </div>
          <div className="p-4 overflow-y-auto flex-1">
            <AddProcedurePanel
              onSuccess={() => {
                // Reload procedures after adding
                (async () => {
                  const updated = await gateway.readAllProcedures();
                  const mappedRows = updated.map((proc) =>
                    toProcedureRow(proc, {
                      patients,
                      funds,
                      procedureTypes,
                    }),
                  );
                  setRows(mappedRows);
                })();
              }}
            />
          </div>
        </div>
      </PageContent>

      {/* Delete confirmation dialog */}
      <ConfirmationDialog
        isOpen={pendingDeleteId !== null}
        onCancel={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        title={t("action.deleteTitle")}
        message={t("action.delete.confirm")}
        confirmLabel={t("action.delete.confirmLabel")}
        cancelLabel={t("action.delete.cancelLabel")}
        variant="danger"
      />

      {/* Modal */}
      {procedureForModal && (
        <ProcedureUpdateModal
          procedure={procedureForModal}
          patients={patients}
          funds={funds}
          procedureTypes={procedureTypes}
          isOpen={editingProcedure !== null}
          onClose={handleCloseModal}
          onSuccess={() => {
            // Reload procedures after update
            (async () => {
              const updated = await gateway.readAllProcedures();
              const mappedRows = updated.map((proc) =>
                toProcedureRow(proc, {
                  patients,
                  funds,
                  procedureTypes,
                }),
              );
              setRows(mappedRows);
            })();
          }}
        />
      )}
    </>
  );
}

function buildNewDraftRow(): ProcedureRow {
  return {
    rowId: crypto.randomUUID(),
    isDraft: true,
    draftPeriod: null, // Set by handleAddNewRow
    patientId: null,
    patientName: null,
    ssn: null,
    fundId: null,
    fundIdentifier: null,
    fundName: null,
    procedureTypeId: null,
    procedureName: null,
    procedureDate: null, // Set by auto-focus to latestDate
    procedureAmount: 0,
    paymentMethod: null,
    confirmedPaymentDate: null,
    actualPaymentAmount: null,
    status: "CREATED",
    awaitedAmount: null,
  };
}

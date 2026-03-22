import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Procedure, ProcedureStatus } from "@/bindings";

import { toastService } from "@/core/snackbar";
import { PageContent } from "@/features/shell";
import { logger } from "@/lib/logger";
import { ConfirmationDialog, SearchField } from "@/ui/components";
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

  const handleCancelDelete = useCallback(() => {
    setPendingDeleteId(null);
  }, []);

  // Shared reload helper — used after add, update, delete, and backend events
  const reloadRows = useCallback(async () => {
    try {
      const updated = await gateway.readAllProcedures();
      const mappedRows = updated.map((proc) =>
        toProcedureRow(proc, { patients, funds, procedureTypes }),
      );
      setRows(mappedRows);
    } catch (error) {
      logger.error(TAG, "Error refreshing procedures", { error });
      toastService.show("error", t("state.reloadFailed"));
    }
  }, [patients, funds, procedureTypes, t]);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDeleteId) return;
    try {
      await handlers.deleteRow(pendingDeleteId);
      toastService.show("success", t("state.deleted"));
      await reloadRows();
    } catch (error) {
      toastService.show("error", error instanceof Error ? error.message : String(error));
    } finally {
      setPendingDeleteId(null);
    }
  }, [pendingDeleteId, handlers, reloadRows, t]);

  const handleProcedureUpdate = useCallback(async () => {
    logger.info(TAG, "Procedure update event received, refreshing list");
    await reloadRows();
  }, [reloadRows]);

  useEffect(() => {
    window.addEventListener("procedure_updated", handleProcedureUpdate);
    return () => window.removeEventListener("procedure_updated", handleProcedureUpdate);
  }, [handleProcedureUpdate]);

  // Convert ProcedureRow to Procedure for modal (only real Procedure fields)
  const procedureForModal = useMemo<Procedure | null>(() => {
    if (!editingProcedure?.id) return null;
    return {
      id: editingProcedure.id,
      patient_id: editingProcedure.patientId || "",
      fund_id: editingProcedure.fundId || null,
      procedure_type_id: editingProcedure.procedureTypeId || "",
      procedure_date: editingProcedure.procedureDate || "",
      procedure_amount:
        editingProcedure.procedureAmount != null
          ? Math.round(editingProcedure.procedureAmount * 1000)
          : null,
      payment_method: (editingProcedure.paymentMethod ?? "NONE") as Procedure["payment_method"],
      confirmed_payment_date: editingProcedure.confirmedPaymentDate ?? "",
      payment_status: (editingProcedure.status || "NONE") as ProcedureStatus,
      actual_payment_amount:
        editingProcedure.actualPaymentAmount != null
          ? Math.round(editingProcedure.actualPaymentAmount * 1000)
          : null,
    };
  }, [editingProcedure]);

  if (isLoading) {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center bg-m3-surface">
        <div className="text-m3-on-surface-variant animate-pulse">{t("state.loading")}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center bg-m3-surface">
        <div className="rounded-xl bg-m3-error-container p-6 text-m3-on-error-container">
          <h2 className="text-lg font-semibold mb-2">{t("error.loading")}</h2>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Header with controls and stats */}
      <div className="bg-m3-surface-container-low p-4 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <PeriodSelector
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              yearRange={yearRange}
              onMonthChange={setSelectedMonth}
              onYearChange={setSelectedYear}
            />
            <div className="w-64">
              <SearchField
                id="procedure-search"
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder={t("filter.placeholder")}
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
        <div className="w-96 flex-shrink-0 flex flex-col bg-m3-surface-container-high rounded-4xl shadow-elevation-1 overflow-hidden">
          <div className="p-4 bg-m3-surface-container-highest">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-m3-primary-container text-m3-on-primary-container rounded-xl">
                <Plus size={24} strokeWidth={2.5} />
              </div>
              <h2 className="text-xl font-bold text-m3-on-surface">{t("action.add")}</h2>
            </div>
          </div>
          <div className="p-4 overflow-y-auto flex-1">
            <AddProcedurePanel onSuccess={reloadRows} />
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
          onSuccess={reloadRows}
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
    status: "NONE",
    awaitedAmount: null,
  };
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Procedure, ProcedureStatus } from "@/bindings";

import { toastService } from "@/core/snackbar";
import { PageContent } from "@/features/shell";
import { logger } from "@/lib/logger";
import { ConfirmationDialog, FAB, SearchField } from "@/ui/components";
import * as gateway from "../api/gateway";
import { useProcedureData } from "../hooks/useProcedureData";
import { useProcedurePeriod } from "../hooks/useProcedurePeriod";
import { toProcedureRow } from "../model/procedure-row.mapper";
import type { ProcedureRow } from "../model/procedure-row.types";
import { PeriodSelector } from "./PeriodSelector";
import { ProcedureFormModal } from "./procedure_form_modal/ProcedureFormModal";
import { ProcedureList } from "./procedure_list/ProcedureList";
import { SummaryStats } from "./SummaryStats";

const TAG = "[ProcedurePage]";

export default function ProcedurePage() {
  const { t } = useTranslation("procedure");

  useEffect(() => {
    logger.info(`${TAG} Component mounted`);
  }, []);

  const { patients, funds, procedureTypes, initialRows, isLoading, error, deleteRow } =
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

  // Modal state
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProcedure, setEditingProcedure] = useState<ProcedureRow | null>(null);

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Persist selected month/year to session storage (R1)
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

  // Filter rows by selected period
  const { yearRange, filteredRows: periodFilteredRows } = useProcedurePeriod(
    rows,
    selectedMonth,
    selectedYear,
  );

  // Apply search filter on top of period filter (R11)
  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return periodFilteredRows;
    return periodFilteredRows.filter(
      (row) =>
        (row.patientName?.toLowerCase().includes(term) ?? false) ||
        (row.status?.toLowerCase().includes(term) ?? false),
    );
  }, [periodFilteredRows, searchTerm]);

  const openCreateModal = useCallback(() => {
    setModalMode("create");
    setEditingProcedure(null);
    setIsModalOpen(true);
  }, []);

  const handleEdit = useCallback((row: ProcedureRow) => {
    setModalMode("edit");
    setEditingProcedure(row);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingProcedure(null);
  }, []);

  const handleDelete = useCallback((id: string) => {
    setPendingDeleteId(id);
  }, []);

  const handleCancelDelete = useCallback(() => {
    setPendingDeleteId(null);
  }, []);

  // Reload all rows from backend — used after add, update, delete and backend events (R8)
  const reloadRows = useCallback(async () => {
    try {
      const updated = await gateway.readAllProcedures();
      const mappedRows = updated.map((proc) =>
        toProcedureRow(proc, { patients, funds, procedureTypes }),
      );
      setRows(mappedRows);
    } catch (err) {
      logger.error(TAG, "Error refreshing procedures", { error: err });
      toastService.show("error", t("state.reloadFailed"));
    }
  }, [patients, funds, procedureTypes, t]);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDeleteId) return;
    try {
      await deleteRow(pendingDeleteId);
      toastService.show("success", t("state.deleted"));
      await reloadRows();
    } catch (err) {
      toastService.show("error", err instanceof Error ? err.message : String(err));
    } finally {
      setPendingDeleteId(null);
    }
  }, [pendingDeleteId, deleteRow, reloadRows, t]);

  // Backend event: procedure updated externally (R8)
  const handleProcedureUpdate = useCallback(async () => {
    logger.info(TAG, "Procedure update event received, refreshing list");
    await reloadRows();
  }, [reloadRows]);

  useEffect(() => {
    window.addEventListener("procedure_updated", handleProcedureUpdate);
    return () => window.removeEventListener("procedure_updated", handleProcedureUpdate);
  }, [handleProcedureUpdate]);

  // Convert ProcedureRow to Procedure for the edit modal
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
      {/* Header with period selector, search and stats (R1, R7, R11) */}
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

      {/* Full-width procedure list (R12) */}
      <PageContent>
        <ProcedureList rows={filteredRows} onEdit={handleEdit} onDelete={handleDelete} />
      </PageContent>

      {/* FAB — open create modal (R12) */}
      <FAB onClick={openCreateModal} label={t("action.fabAriaLabel")} />

      {/* Unified create/edit modal (R6, R12) */}
      <ProcedureFormModal
        mode={modalMode}
        procedure={modalMode === "edit" ? procedureForModal : null}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSuccess={reloadRows}
      />

      {/* Delete confirmation (R5) */}
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
    </>
  );
}

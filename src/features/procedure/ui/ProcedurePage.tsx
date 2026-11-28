import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Procedure, ProcedureStatus } from "@/bindings";
import { PageContent } from "@/features/shell";
import { logger } from "@/infra/logger";
import { ConfirmationDialog, FAB } from "@/ui/components";
import { toastService } from "@/ui/components/snackbar";
import * as gateway from "../api/gateway";
import { useProcedureData } from "../hooks/useProcedureData";
import { useProcedurePeriod } from "../hooks/useProcedurePeriod";
import {
  isBlockingStatus,
  isOverpaidStatus,
  isOverpaymentRefundStatus,
  markOverdueRows,
} from "../model";
import { toProcedureRow } from "../model/procedure-row.mapper";
import type { ProcedureRow } from "../model/procedure-row.types";
import { ProcedurePageHeader } from "./ProcedurePageHeader";
import { ProcedureFormModal } from "./procedure_form_modal/ProcedureFormModal";
import { ProcedureList } from "./procedure_list/ProcedureList";

const TAG = "[ProcedurePage]";

export default function ProcedurePage() {
  const { t } = useTranslation("procedure");

  useEffect(() => {
    logger.info(`${TAG} Component mounted`);
  }, []);

  const { patients, funds, procedureTypes, initialRows, isLoading, error, deleteRow } =
    useProcedureData();

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const saved = sessionStorage.getItem("procedureSelectedMonth");
    return saved ? parseInt(saved, 10) : new Date().getMonth() + 1;
  });
  const [selectedYear, setSelectedYear] = useState(() => {
    const saved = sessionStorage.getItem("procedureSelectedYear");
    return saved ? parseInt(saved, 10) : new Date().getFullYear();
  });
  const [rows, setRows] = useState<ProcedureRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

  // Modal state
  const [modalMode, setModalMode] = useState<"create" | "edit" | "view" | "overpaid" | "refund">(
    "create",
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProcedure, setEditingProcedure] = useState<ProcedureRow | null>(null);

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Persist selected month/year to session storage (PRO-010)
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

  // Apply search + status filters on top of period filter (PRO-100)
  const filteredRows = useMemo(() => {
    let result = periodFilteredRows;

    const term = searchTerm.trim().toLowerCase();
    if (term) {
      result = result.filter(
        (row) =>
          (row.patientName?.toLowerCase().includes(term) ?? false) ||
          (row.procedureName?.toLowerCase().includes(term) ?? false) ||
          (row.fundName?.toLowerCase().includes(term) ?? false) ||
          (row.ssn?.toLowerCase().includes(term) ?? false),
      );
    }

    if (selectedStatus) {
      result = result.filter((row) => (row.status?.toUpperCase() ?? "NONE") === selectedStatus);
    }

    return result;
  }, [periodFilteredRows, searchTerm, selectedStatus]);

  const openCreateModal = useCallback(() => {
    setModalMode("create");
    setEditingProcedure(null);
    setIsModalOpen(true);
  }, []);

  const handleEdit = useCallback((row: ProcedureRow) => {
    let mode: "create" | "edit" | "view" | "overpaid" | "refund" = "edit";
    if (isOverpaidStatus(row.status)) {
      mode = "overpaid";
    } else if (isOverpaymentRefundStatus(row.status)) {
      mode = "refund";
    } else if (isBlockingStatus(row.status)) {
      mode = "view";
    }
    setModalMode(mode);
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

  // Reload all rows from backend — used after add, update, delete and backend events (PRO-070)
  const reloadRows = useCallback(async () => {
    const result = await gateway.readAllProcedures();
    if (!result.success) {
      logger.error(TAG, "Error refreshing procedures", { error: result.error });
      toastService.show("error", t("state.reload_failed"));
      return;
    }
    const mappedRows = result.data.map((proc) =>
      toProcedureRow(proc, { patients, funds, procedureTypes }),
    );
    // PRO-310 — the overdue mark is computed over the full set, as on first load.
    setRows(markOverdueRows(mappedRows));
  }, [patients, funds, procedureTypes, t]);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDeleteId) return;
    try {
      await deleteRow(pendingDeleteId);
      toastService.show("success", t("state.deleted"));
      await reloadRows();
    } catch (err) {
      logger.error(TAG, "Error deleting procedure", { error: err });
      toastService.show("error", t("error.delete_failed"));
    } finally {
      setPendingDeleteId(null);
    }
  }, [pendingDeleteId, deleteRow, reloadRows, t]);

  // Backend event: procedure updated externally (PRO-070)
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
      billed_amount: Math.round(editingProcedure.billedAmount * 1000),
      payment_method: (editingProcedure.paymentMethod ?? "NONE") as Procedure["payment_method"],
      // confirmed_payment_date is typed string (non-null) in Procedure bindings but is actually
      // optional — send empty string here; the hook converts "" || null before the gateway call.
      fund_reconciliation_date: editingProcedure.fundReconciliationDate ?? "",
      confirmed_payment_date: editingProcedure.confirmedPaymentDate ?? "",
      payment_status: (editingProcedure.status || "NONE") as ProcedureStatus,
      paid_amount:
        editingProcedure.paidAmount != null ? Math.round(editingProcedure.paidAmount * 1000) : null,
    };
  }, [editingProcedure]);

  if (isLoading) {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center bg-m3-surface">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-m3-primary border-t-transparent animate-spin" />
          <p className="text-sm text-m3-on-surface-variant">{t("state.loading")}</p>
        </div>
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
      {/* Header with period selector, search and stats (PRO-010, PRO-060, PRO-100) */}
      <ProcedurePageHeader
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
        yearRange={yearRange}
        onMonthChange={setSelectedMonth}
        onYearChange={setSelectedYear}
        selectedStatus={selectedStatus}
        onStatusChange={setSelectedStatus}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        rows={filteredRows}
      />

      {/* Full-width procedure list (PRO-110) */}
      <PageContent>
        <ProcedureList
          rows={filteredRows}
          isFiltered={searchTerm.trim().length > 0 || selectedStatus !== ""}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </PageContent>

      {/* FAB — open create modal (PRO-110) */}
      <FAB id="fab-create-procedure" onClick={openCreateModal} label={t("action.fab_aria_label")} />

      {/* Unified create/edit modal (PRO-040, PRO-110) */}
      <ProcedureFormModal
        mode={modalMode}
        procedure={modalMode !== "create" ? procedureForModal : null}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSuccess={reloadRows}
      />

      {/* Delete confirmation (PRO-030) */}
      <ConfirmationDialog
        id="delete-procedure-confirmation"
        isOpen={pendingDeleteId !== null}
        onCancel={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        title={t("action.delete_title")}
        message={t("action.delete.confirm")}
        confirmLabel={t("action.delete.confirm_label")}
        cancelLabel={t("action.delete.cancel_label")}
        variant="danger"
      />
    </>
  );
}

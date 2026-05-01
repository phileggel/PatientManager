import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ImportExecutionResult, ParseExcelResponse } from "@/bindings";
import { useAppStore } from "@/lib/appStore";
import { logger } from "@/lib/logger";
import { FormModal } from "@/ui/components";
import { Button } from "@/ui/components/button";
import { executeExcelImport, parseExcelFile } from "../api/gateway";
import { MonthSelectionStep } from "./components/MonthSelectionStep";
import { ParsingReportModal } from "./components/ParsingReportModal";
import { ProcedureTypeMappingStep } from "./components/ProcedureTypeMappingStep";
import { ProgressIndicator } from "./components/ProgressIndicator";

interface ImportExcelPageProps {
  onClose?: () => void;
}

type Step =
  | "upload"
  | "parsing"
  | "month_selection"
  | "mapping_procedure_types"
  | "importing"
  | "complete";

// Stable no-op used as default for onClose to avoid recreating handleOpenFilePicker on every render
const noop = () => {};

export function ImportExcelPage({ onClose = noop }: ImportExcelPageProps) {
  const { t } = useTranslation("excel-import");

  const procedureTypes = useAppStore((state) => state.procedureTypes);

  const [currentStep, setCurrentStep] = useState<Step>("upload");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [showParsingReport, setShowParsingReport] = useState(false);
  // TODO: isCancelledRef is set but never read — async-after-unmount guard is incomplete.
  // Either implement fully (set true on unmount, check before each setState) or remove.
  const isCancelledRef = useRef(false);

  // Parsed data from Excel (held in state so the mapping step can use it)
  const [parsed, setParsed] = useState<ParseExcelResponse | null>(null);

  // Months selected by the user for import
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);

  // Final import result
  const [importResult, setImportResult] = useState<ImportExecutionResult | null>(null);

  // Current file being processed (for retry)
  const [currentFileData, setCurrentFileData] = useState<{ name: string; path: string } | null>(
    null,
  );

  const handleFileSelect = useCallback(
    async (fileData: { name: string; path: string }) => {
      setError(null);
      setCurrentFileData(fileData);
      setCurrentStep("parsing");
      setIsLoading(true);
      isCancelledRef.current = false;
      setLoadingStatus(t("status.parsing"));

      try {
        logger.info("[ImportExcelPage] Starting import workflow", {
          fileName: fileData.name,
          filePath: fileData.path,
        });

        const parseResult = await parseExcelFile(fileData.path);
        if (!parseResult.success || !parseResult.data) {
          throw new Error(parseResult.error || t("error.failedParseExcel"));
        }

        setParsed(parseResult.data);
        logger.info("[ImportExcelPage] Excel parsed successfully", {
          patients: parseResult.data.patients.length,
          funds: parseResult.data.funds.length,
          procedures: parseResult.data.procedures.length,
        });

        // If no procedures, skip month selection and mapping steps
        if (parseResult.data.procedures.length === 0) {
          logger.info(
            "[ImportExcelPage] No procedures to import, skipping month selection and mapping steps",
          );
          setIsLoading(false);
          setLoadingStatus("");

          setCurrentStep("importing");
          setIsLoading(true);

          const result = await executeExcelImport(parseResult.data, {}, []);
          if (!result.success || !result.data) {
            throw new Error(result.error || t("error.failedCreateProcedures"));
          }
          setImportResult(result.data);
          setCurrentStep("complete");
          return;
        }

        // Show month selection UI
        setCurrentStep("month_selection");
        setIsLoading(false);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        logger.error("[ImportExcelPage] Import workflow failed", { error: errorMessage });
        setCurrentStep("upload");
      } finally {
        setIsLoading(false);
        setLoadingStatus("");
      }
    },
    [t],
  );

  const handleOpenFilePicker = useCallback(async () => {
    logger.info("[ImportExcelPage] Opening file picker");
    try {
      const filePath = await open({
        multiple: false,
        filters: [{ name: "Excel Files", extensions: ["xlsx", "xls", "csv"] }],
      });

      if (!filePath) {
        logger.info("[ImportExcelPage] File picker cancelled; navigating back");
        onClose();
        return;
      }

      const path = Array.isArray(filePath) ? filePath[0] : filePath;
      const name = path.split(/[\\/]/).pop() || path;
      logger.info("[ImportExcelPage] File selected via dialog", { path });
      void handleFileSelect({ name, path });
    } catch (err) {
      logger.error("[ImportExcelPage] File picker error", { error: err });
    }
  }, [onClose, handleFileSelect]);

  useEffect(() => {
    logger.info("[ImportExcelPage] Component mounted; opening file picker");
    void handleOpenFilePicker();
  }, [handleOpenFilePicker]);

  const handleMonthSelectionConfirm = useCallback((months: string[]) => {
    setSelectedMonths(months);
    setCurrentStep("mapping_procedure_types");
  }, []);

  const handleMappingComplete = useCallback(
    async (mapping: Record<string, string>) => {
      if (!parsed) return;

      setIsLoading(true);
      setCurrentStep("importing");
      setLoadingStatus(t("status.parsing")); // reuse "processing" label

      logger.info("[ImportExcelPage] Procedure mapping completed, executing import", {
        mappedTypes: Object.keys(mapping).length,
        selectedMonths,
      });

      try {
        const result = await executeExcelImport(parsed, mapping, selectedMonths);

        if (!result.success || !result.data) {
          throw new Error(result.error || t("error.failedCreateProcedures"));
        }

        setImportResult(result.data);
        setCurrentStep("complete");
        logger.info("[ImportExcelPage] Import workflow completed successfully", result.data);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        logger.error("[ImportExcelPage] Import execution failed", { error: errorMessage });
        setCurrentStep("mapping_procedure_types");
      } finally {
        setIsLoading(false);
        setLoadingStatus("");
      }
    },
    [parsed, t, selectedMonths],
  );

  const handleRetry = useCallback(() => {
    if (currentFileData) {
      void handleFileSelect(currentFileData);
    }
  }, [currentFileData, handleFileSelect]);

  const handleReset = useCallback(() => {
    setParsed(null);
    setSelectedMonths([]);
    setImportResult(null);
    setError(null);
    // Closing the mapping modal or "Import Another" resets state and re-opens the file picker
    void handleOpenFilePicker();
  }, [handleOpenFilePicker]);

  const handleMappingModalClose = useCallback(() => {
    if (!isLoading) {
      handleReset();
    }
  }, [isLoading, handleReset]);

  return (
    <div className="flex flex-col h-full">
      {/* Fixed Progress Indicator */}
      <div className="sticky top-0 z-10 bg-m3-surface">
        <ProgressIndicator
          currentStep={currentStep}
          steps={[
            "upload",
            "parsing",
            "month_selection",
            "mapping_procedure_types",
            "importing",
            "complete",
          ]}
        />
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-6 gap-6 flex flex-col">
        {error && (
          <div
            className="p-4 bg-m3-error-container rounded-xl text-m3-on-error-container"
            role="alert"
            aria-live="polite"
          >
            <p className="font-medium">{t("status.importFailed")}</p>
            <p className="text-sm mt-1 opacity-90">{error}</p>
            <div className="flex gap-2 mt-3">
              {currentFileData && <Button onClick={handleRetry}>{t("status.retry")}</Button>}
              <Button
                variant="secondary"
                onClick={() => {
                  setError(null);
                  setCurrentStep("upload");
                }}
              >
                {t("action.dismiss", { ns: "common" })}
              </Button>
            </div>
          </div>
        )}

        {parsed && (
          <ParsingReportModal
            isOpen={showParsingReport}
            parsingIssues={parsed.parsing_issues}
            onClose={() => setShowParsingReport(false)}
            skippedRowsCount={parsed.parsing_issues.skipped_rows.length}
          />
        )}

        {/* Month Selection Step */}
        {currentStep === "month_selection" && parsed !== null && (
          <MonthSelectionStep
            parsedData={parsed}
            onConfirm={handleMonthSelectionConfirm}
            isLoading={isLoading}
          />
        )}

        {/* Procedure Type Mapping Modal */}
        <FormModal
          isOpen={currentStep === "mapping_procedure_types" && parsed !== null}
          title={t("mapping.modalTitle")}
          onClose={handleMappingModalClose}
          maxWidth="max-w-3xl"
          maxHeight="max-h-[80vh]"
        >
          {parsed && (
            <ProcedureTypeMappingStep
              procedureMappings={Array.from(
                new Map(
                  parsed.procedures.map((p) => [p.procedure_type_tmp_id, p.amount]),
                ).entries(),
              ).map(([tmpId, amount]) => ({ tmp_id: tmpId, amount }))}
              procedureTypes={procedureTypes}
              onMappingComplete={handleMappingComplete}
              isLoading={isLoading}
            />
          )}
        </FormModal>

        {currentStep === "complete" && importResult && (
          <div className="space-y-4">
            <div className="p-4 bg-m3-tertiary-container/20 rounded-xl">
              <p className="font-medium text-m3-on-tertiary-container">{t("result.title")}</p>
              <div className="mt-4 grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-neutral-70">{t("result.patientsProcessed")}</p>
                  <p className="text-2xl font-bold text-m3-primary">
                    {importResult.patients_created + importResult.patients_reused}
                  </p>
                  <p className="text-xs text-neutral-50">
                    {t("result.createdReused", {
                      created: importResult.patients_created,
                      reused: importResult.patients_reused,
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-neutral-70">{t("result.fundsProcessed")}</p>
                  <p className="text-2xl font-bold text-m3-primary">
                    {importResult.funds_created + importResult.funds_reused}
                  </p>
                  <p className="text-xs text-neutral-50">
                    {t("result.createdReused", {
                      created: importResult.funds_created,
                      reused: importResult.funds_reused,
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-neutral-70">{t("result.proceduresCreated")}</p>
                  <p className="text-2xl font-bold text-m3-primary">
                    {importResult.procedures_created}
                  </p>
                  {importResult.procedures_deleted > 0 && (
                    <p className="text-xs text-neutral-50">
                      {t("result.deletedBeforeReimport", {
                        count: importResult.procedures_deleted,
                      })}
                    </p>
                  )}
                  {importResult.procedures_skipped > 0 && (
                    <p className="text-xs text-neutral-50">
                      {t("result.skipped", { count: importResult.procedures_skipped })}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {importResult.blocked_months.length > 0 && (
              <div className="p-4 bg-m3-secondary-container/20 rounded-xl">
                <p className="font-medium text-m3-on-secondary-container">
                  {t("result.blockedMonthsTitle")}
                </p>
                <p className="text-sm text-m3-on-secondary-container/80 mt-1">
                  {importResult.blocked_months.join(", ")}
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={handleReset}>{t("result.importAnother")}</Button>
              {parsed && (
                <Button variant="secondary" onClick={() => setShowParsingReport(true)}>
                  {t("result.viewReport")}
                </Button>
              )}
            </div>
          </div>
        )}

        {(currentStep === "parsing" || currentStep === "importing") && isLoading && (
          <div className="rounded-xl bg-m3-primary/10 p-4 text-center">
            <p className="text-m3-primary">{loadingStatus || t("status.parsing")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

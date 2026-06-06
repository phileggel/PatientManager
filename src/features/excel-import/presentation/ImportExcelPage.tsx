import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ImportExecutionResult, ParseExcelResponse } from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";
import { logger } from "@/infra/logger";
import { FormModal } from "@/ui/components";
import { Button } from "@/ui/components/button";
import { executeExcelImport, parseExcelFile } from "../api/gateway";
import { deriveProcedureMappings } from "../shared/mappings";
import { formatExcelImportError } from "../shared/presenter";
import { ParsingReportModal } from "./components/ParsingReportModal";
import { ProcedureTypeMappingStep } from "./components/ProcedureTypeMappingStep";
import { ProgressIndicator } from "./components/ProgressIndicator";
import { SheetSelectionStep } from "./components/SheetSelectionStep";

interface ImportExcelPageProps {
  filePath: string;
  onClose: () => void;
}

type Step = "parsing" | "sheet_selection" | "mapping_procedure_types" | "importing" | "complete";

export function ImportExcelPage({ filePath, onClose }: ImportExcelPageProps) {
  const { t } = useTranslation("excel-import");

  const procedureTypes = useCacheStore((state) => state.procedureTypes);

  useEffect(() => {
    logger.info("[ImportExcelPage] mounted");
  }, []);

  const [currentStep, setCurrentStep] = useState<Step>("parsing");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [showParsingReport, setShowParsingReport] = useState(false);

  // Parsed data from Excel (held in state so the mapping step can use it)
  const [parsed, setParsed] = useState<ParseExcelResponse | null>(null);

  // Sheets selected by the user for import (canonical names: "Jan", "Fév", ...)
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);

  // Final import result
  const [importResult, setImportResult] = useState<ImportExecutionResult | null>(null);

  const handleFileSelect = useCallback(
    async (fileData: { name: string; path: string }) => {
      setError(null);
      setCurrentStep("parsing");
      setIsLoading(true);
      setLoadingStatus(t("status.parsing"));

      try {
        logger.info("[ImportExcelPage] Starting import workflow", {
          fileName: fileData.name,
          filePath: fileData.path,
        });

        const parseResult = await parseExcelFile(fileData.path);
        if (!parseResult.success) {
          // reviewer-frontend FP: storing only the translated string is the
          // terminal render form for this single-banner workflow (see PR #59).
          throw new Error(t(formatExcelImportError(parseResult.error).key));
        }

        setParsed(parseResult.data);
        logger.info("[ImportExcelPage] Excel parsed successfully", {
          patients: parseResult.data.patients.length,
          funds: parseResult.data.funds.length,
          procedures: parseResult.data.procedures.length,
        });

        // If no procedures, skip sheet selection and mapping steps
        if (parseResult.data.procedures.length === 0) {
          logger.info(
            "[ImportExcelPage] No procedures to import, skipping sheet selection and mapping steps",
          );
          setIsLoading(false);
          setLoadingStatus("");

          setCurrentStep("importing");
          setIsLoading(true);

          const result = await executeExcelImport(parseResult.data, {}, []);
          if (!result.success) {
            throw new Error(t(formatExcelImportError(result.error).key));
          }
          setImportResult(result.data);
          setCurrentStep("complete");
          return;
        }

        // Show sheet selection UI
        setCurrentStep("sheet_selection");
        setIsLoading(false);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        logger.error("[ImportExcelPage] Import workflow failed", { error: errorMessage });
        setCurrentStep("parsing");
      } finally {
        setIsLoading(false);
        setLoadingStatus("");
      }
    },
    [t],
  );

  const hasParsedRef = useRef(false);
  useEffect(() => {
    if (hasParsedRef.current) return;
    hasParsedRef.current = true;
    const name = filePath.split(/[\\/]/).pop() ?? filePath;
    logger.info("[ImportExcelPage] Starting parse", { filePath });
    void handleFileSelect({ name, path: filePath });
  }, [filePath, handleFileSelect]);

  const handleSheetSelectionConfirm = useCallback((sheets: string[]) => {
    setSelectedSheets(sheets);
    setCurrentStep("mapping_procedure_types");
  }, []);

  const handleMappingComplete = useCallback(
    async (mapping: Record<string, string>) => {
      if (!parsed) return;

      setIsLoading(true);
      setCurrentStep("importing");
      setLoadingStatus(t("progress.importing"));

      logger.info("[ImportExcelPage] Procedure mapping completed, executing import", {
        mappedTypes: Object.keys(mapping).length,
        selectedSheets,
      });

      try {
        const result = await executeExcelImport(parsed, mapping, selectedSheets);

        if (!result.success) {
          throw new Error(t(formatExcelImportError(result.error).key));
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
    [parsed, t, selectedSheets],
  );

  const handleRetry = useCallback(() => {
    const name = filePath.split(/[\\/]/).pop() ?? filePath;
    void handleFileSelect({ name, path: filePath });
  }, [filePath, handleFileSelect]);

  const handleMappingModalClose = useCallback(() => {
    if (!isLoading) {
      onClose();
    }
  }, [isLoading, onClose]);

  return (
    <div className="flex flex-col h-full">
      {/* Fixed Progress Indicator */}
      <div className="sticky top-0 z-10 bg-m3-surface">
        <ProgressIndicator
          currentStep={currentStep}
          steps={["parsing", "sheet_selection", "mapping_procedure_types", "importing", "complete"]}
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
              <Button onClick={handleRetry}>{t("status.retry")}</Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setError(null);
                  setCurrentStep("parsing");
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
            executeSkippedRows={importResult?.skipped_procedures}
            onClose={() => setShowParsingReport(false)}
            skippedRowsCount={parsed.parsing_issues.skipped_rows.length}
          />
        )}

        {/* Sheet Selection Step */}
        {currentStep === "sheet_selection" && parsed !== null && (
          <SheetSelectionStep
            parsedData={parsed}
            onConfirm={handleSheetSelectionConfirm}
            isLoading={isLoading}
          />
        )}

        {/* Procedure Type Mapping Modal */}
        <FormModal
          id="excel-mapping-procedure-types-modal"
          isOpen={currentStep === "mapping_procedure_types" && parsed !== null}
          title={t("mapping.modalTitle")}
          onClose={handleMappingModalClose}
          maxWidth="max-w-3xl"
          maxHeight="max-h-[80vh]"
        >
          {parsed && (
            <ProcedureTypeMappingStep
              procedureMappings={deriveProcedureMappings(parsed.procedures, selectedSheets)}
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

            {parsed && (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setShowParsingReport(true)}>
                  {t("result.viewReport")}
                </Button>
              </div>
            )}
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

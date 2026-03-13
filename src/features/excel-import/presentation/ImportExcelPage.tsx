import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ImportExecutionResult, ParseExcelResponse } from "@/bindings";
import { useAppStore } from "@/lib/appStore";
import { logger } from "@/lib/logger";
import { ErrorAlertLegacy, FormModal } from "@/ui/components";
import { Button } from "@/ui/components/button";
import { executeExcelImport, parseExcelFile } from "../api/gateway";
import { FileUploadSection } from "./components/FileUploadSection";
import { MonthSelectionStep } from "./components/MonthSelectionStep";
import { ParsingReportModal } from "./components/ParsingReportModal";
import { ProcedureTypeMappingStep } from "./components/ProcedureTypeMappingStep";
import { ProgressIndicator } from "./components/ProgressIndicator";

type Step =
  | "upload"
  | "parsing"
  | "month_selection"
  | "mapping_procedure_types"
  | "importing"
  | "complete";

export function ImportExcelPage() {
  const { t } = useTranslation("excel-import");

  const procedureTypes = useAppStore((state) => state.procedureTypes);

  const [currentStep, setCurrentStep] = useState<Step>("upload");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [showParsingReport, setShowParsingReport] = useState(false);
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

  useEffect(() => {
    logger.info("[ImportExcelPage] Component mounted");
  }, []);

  const handleMonthSelectionConfirm = (months: string[]) => {
    setSelectedMonths(months);
    setCurrentStep("mapping_procedure_types");
  };

  const handleMappingComplete = async (mapping: Record<string, string>) => {
    if (!parsed) return;

    setIsLoading(true);
    setCurrentStep("importing");
    setLoadingStatus(t("status.parsing")); // reuse "processing" label

    logger.info("Procedure mapping completed, executing import", {
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
      logger.info("Import workflow completed successfully", result.data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      logger.error("Import execution failed", { error: errorMessage });
      setCurrentStep("mapping_procedure_types");
    } finally {
      setIsLoading(false);
      setLoadingStatus("");
    }
  };

  const handleFileSelect = async (fileData: { name: string; path: string }) => {
    setError(null);
    setCurrentFileData(fileData);
    setCurrentStep("parsing");
    setIsLoading(true);
    isCancelledRef.current = false;
    setLoadingStatus(t("status.parsing"));

    try {
      logger.info("Starting import workflow", { fileName: fileData.name, filePath: fileData.path });

      const parseResult = await parseExcelFile(fileData.path);
      if (!parseResult.success || !parseResult.data) {
        throw new Error(parseResult.error || t("error.failedParseExcel"));
      }

      setParsed(parseResult.data);
      logger.info("Excel parsed successfully", {
        patients: parseResult.data.patients.length,
        funds: parseResult.data.funds.length,
        procedures: parseResult.data.procedures.length,
      });

      // If no procedures, skip month selection and mapping steps
      if (parseResult.data.procedures.length === 0) {
        logger.info("No procedures to import, skipping month selection and mapping steps");
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
      logger.error("Import workflow failed", { error: errorMessage });
      setCurrentStep("upload");
    } finally {
      setIsLoading(false);
      setLoadingStatus("");
    }
  };

  const handleRetry = () => {
    if (currentFileData) {
      handleFileSelect(currentFileData);
    }
  };

  const handleReset = () => {
    setCurrentStep("upload");
    setParsed(null);
    setSelectedMonths([]);
    setImportResult(null);
    setError(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Fixed Progress Indicator */}
      <div className="sticky top-0 z-10 bg-white">
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
          <ErrorAlertLegacy
            variant="error"
            message={t("status.importFailed")}
            description={error}
            onRetry={currentFileData ? handleRetry : undefined}
            retryLabel={t("status.retry")}
            onDismiss={() => {
              setError(null);
              setCurrentStep("upload");
            }}
            dismissible
          />
        )}

        {currentStep === "upload" && (
          <FileUploadSection onFileSelect={handleFileSelect} isLoading={isLoading} />
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
          onClose={() => {
            if (!isLoading) {
              handleReset();
            }
          }}
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
            <div className="p-4 bg-success-10 border border-success-30 rounded">
              <p className="font-medium text-success-70">{t("result.title")}</p>
              <div className="mt-4 grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-neutral-70">{t("result.patientsProcessed")}</p>
                  <p className="text-2xl font-bold text-primary-60">
                    {importResult.patients_created + importResult.patients_reused}
                  </p>
                  <p className="text-xs text-neutral-50">
                    {importResult.patients_created} créés · {importResult.patients_reused}{" "}
                    réutilisés
                  </p>
                </div>
                <div>
                  <p className="text-sm text-neutral-70">{t("result.fundsProcessed")}</p>
                  <p className="text-2xl font-bold text-primary-60">
                    {importResult.funds_created + importResult.funds_reused}
                  </p>
                  <p className="text-xs text-neutral-50">
                    {importResult.funds_created} créés · {importResult.funds_reused} réutilisés
                  </p>
                </div>
                <div>
                  <p className="text-sm text-neutral-70">{t("result.proceduresCreated")}</p>
                  <p className="text-2xl font-bold text-primary-60">
                    {importResult.procedures_created}
                  </p>
                  {importResult.procedures_deleted > 0 && (
                    <p className="text-xs text-neutral-50">
                      {importResult.procedures_deleted} supprimés avant réimport
                    </p>
                  )}
                  {importResult.procedures_skipped > 0 && (
                    <p className="text-xs text-neutral-50">
                      {importResult.procedures_skipped} ignorés
                    </p>
                  )}
                </div>
              </div>
            </div>

            {importResult.blocked_months.length > 0 && (
              <div className="p-4 bg-warning-10 border border-warning-30 rounded">
                <p className="font-medium text-warning-70">{t("result.blockedMonthsTitle")}</p>
                <p className="text-sm text-warning-60 mt-1">
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

        {currentStep !== "upload" &&
          currentStep !== "complete" &&
          currentStep !== "month_selection" &&
          currentStep !== "mapping_procedure_types" &&
          isLoading && (
            <div className="rounded bg-primary-10 p-4 text-center">
              <p className="text-primary-60">{loadingStatus || t("status.parsing")}</p>
            </div>
          )}
      </div>
    </div>
  );
}

/**
 * Displays validation results for a batch operation (patients, funds, or procedures).
 * Shows color-coded counts of valid, invalid, and existing records.
 */
import { useTranslation } from "react-i18next";

interface ValidationSummaryCardProps {
  /**
   * Number of valid records that passed validation or will be created
   */
  validCount: number;

  /**
   * Number of invalid records that failed validation
   */
  invalidCount: number;

  /**
   * Number of existing records found in the database
   */
  existingCount: number;

  /**
   * Type of entity being validated
   */
  entityType: "patients" | "funds" | "procedures";
}

export function ValidationSummaryCard({
  validCount,
  invalidCount,
  existingCount,
  entityType,
}: ValidationSummaryCardProps) {
  const { t } = useTranslation("excel-import");

  const total = validCount + invalidCount + existingCount;
  const percentValid = total > 0 ? Math.round((validCount / total) * 100) : 0;
  const percentExisting = total > 0 ? Math.round((existingCount / total) * 100) : 0;
  const percentInvalid = total > 0 ? Math.round((invalidCount / total) * 100) : 0;

  const displayName = {
    patients: t("validation.patients"),
    funds: t("validation.funds"),
    procedures: t("validation.procedures"),
  }[entityType];

  return (
    <section
      className="rounded border border-neutral-20 bg-neutral-5 p-4"
      aria-label={t("validation.summaryTitle", { type: displayName })}
    >
      <h3 className="mb-4 font-medium text-neutral-90">
        {t("validation.summaryTitle", { type: displayName })}
      </h3>

      <div className="grid grid-cols-3 gap-3">
        {/* Valid - Success color */}
        {validCount > 0 && (
          <div className="rounded bg-success-10 p-3">
            <p className="text-sm text-neutral-70">{t("validation.valid")}</p>
            <p className="mt-1 text-2xl font-bold text-success-70">{validCount}</p>
            {total > 0 && (
              <p className="mt-1 text-xs text-neutral-60">
                {t("validation.percentOfTotal", { percent: percentValid })}
              </p>
            )}
          </div>
        )}

        {/* Existing - Warning color */}
        {existingCount > 0 && (
          <div className="rounded bg-warning-20 p-3">
            <p className="text-sm text-neutral-70">{t("validation.existing")}</p>
            <p className="mt-1 text-2xl font-bold text-warning-90">{existingCount}</p>
            {total > 0 && (
              <p className="mt-1 text-xs text-neutral-60">
                {t("validation.percentOfTotal", { percent: percentExisting })}
              </p>
            )}
          </div>
        )}

        {/* Invalid - Error color */}
        {invalidCount > 0 && (
          <div className="rounded bg-error-20 p-3">
            <p className="text-sm text-neutral-70">{t("validation.invalid")}</p>
            <p className="mt-1 text-2xl font-bold text-error-70">{invalidCount}</p>
            {total > 0 && (
              <p className="mt-1 text-xs text-neutral-60">
                {t("validation.percentOfTotal", { percent: percentInvalid })}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Summary text */}
      <div className="mt-4 border-t border-neutral-20 pt-3 text-sm text-neutral-70">
        <p>
          {validCount > 0 && `${t("validation.willProcess", { count: validCount })} `}
          {existingCount > 0 && `${t("validation.alreadyInDb", { count: existingCount })} `}
          {invalidCount > 0 && (
            <span className="text-error-70">
              {t("validation.hasErrors", { count: invalidCount })}
            </span>
          )}
        </p>
      </div>
    </section>
  );
}

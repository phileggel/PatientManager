import { useTranslation } from "react-i18next";

type Step =
  | "upload"
  | "parsing"
  | "month_selection"
  | "mapping_procedure_types"
  | "importing"
  | "complete";

interface ProgressIndicatorProps {
  currentStep: Step;
  steps?: Step[];
}

const STEP_I18N_KEYS: Record<Step, string> = {
  upload: "progress.upload",
  parsing: "progress.parsing",
  month_selection: "progress.monthSelection",
  mapping_procedure_types: "progress.mapping",
  importing: "progress.importing",
  complete: "progress.complete",
};

export function ProgressIndicator({ currentStep, steps: customSteps }: ProgressIndicatorProps) {
  const { t } = useTranslation("excel-import");
  const stepOrder: Step[] = [
    "upload",
    "parsing",
    "month_selection",
    "mapping_procedure_types",
    "importing",
    "complete",
  ];

  const steps = (customSteps || stepOrder).map((key, index) => ({
    key,
    label: t(STEP_I18N_KEYS[key]),
    number: index + 1,
  }));

  const getCurrentStepIndex = () => {
    return steps.findIndex((s) => s.key === currentStep);
  };

  const currentIndex = getCurrentStepIndex();

  return (
    <div className="mb-8 p-6 bg-m3-surface-container-low rounded-xl">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => (
          <div key={step.key} className="flex items-center flex-1">
            {/* Step Circle */}
            <div
              className={`flex items-center justify-center w-10 h-10 rounded-full font-semibold text-sm ${
                index <= currentIndex
                  ? "bg-m3-primary text-m3-on-primary"
                  : "bg-m3-surface-container-high text-m3-on-surface-variant"
              }`}
            >
              {index < currentIndex ? (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <title>Step completed</title>
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                step.number
              )}
            </div>

            {/* Label */}
            <div className="ml-3 flex-1">
              <p
                className={`text-sm font-semibold ${
                  index <= currentIndex ? "text-m3-primary" : "text-m3-on-surface-variant"
                }`}
              >
                {step.label}
              </p>
            </div>

            {/* Connector Line */}
            {index < steps.length - 1 && (
              <div
                className={`flex-1 h-1 mx-4 ${
                  index < currentIndex ? "bg-m3-primary" : "bg-m3-outline-variant"
                }`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

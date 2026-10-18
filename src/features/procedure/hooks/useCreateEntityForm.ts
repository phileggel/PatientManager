import { useCallback, useEffect, useState } from "react";

import { logger } from "@/infra/logger";

/**
 * Options for useCreateEntityForm hook
 */
interface UseCreateEntityFormOptions<TFields, TFormData> {
  /** Entity name for logging (e.g., "patient", "fund") */
  entityName: string;
  /** Initial field values */
  initialFields: TFields;
  /** Optional initial query to pre-populate a field */
  initialQuery?: string;
  /** Field name to pre-populate with initialQuery */
  queryField?: keyof TFields;
  /** Transform fields to form data for submission */
  toFormData: (fields: TFields) => TFormData;
  /**
   * Submit handler: the backend judges the form (TODO-024) and the handler
   * returns the messages to show under the refused fields, none on success.
   */
  onSubmit: (data: TFormData) => Promise<Record<string, string>>;
  /** Callback when form is closed */
  onClose: () => void;
}

/**
 * Generic hook for create entity forms.
 * Handles field state, the backend's refusals, loading and submit workflow.
 */
export function useCreateEntityForm<TFields extends Record<string, unknown>, TFormData>({
  entityName,
  initialFields,
  initialQuery,
  queryField,
  toFormData,
  onSubmit,
  onClose,
}: UseCreateEntityFormOptions<TFields, TFormData>) {
  const [fields, setFields] = useState<TFields>(initialFields);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialQuery && queryField) {
      setFields((prev) => ({ ...prev, [queryField]: initialQuery }));
    }
  }, [initialQuery, queryField]);

  // A refused field's message clears once that field is edited (PRO-120).
  const updateField = useCallback(<K extends keyof TFields>(field: K, value: TFields[K]) => {
    setFields((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!(field in prev)) return prev;
      const { [field as string]: _cleared, ...rest } = prev;
      return rest;
    });
  }, []);

  const reset = useCallback(() => {
    logger.debug(`${entityName} form: Resetting`);
    setFields(initialFields);
    setErrors({});
    setIsSubmitting(false);
  }, [entityName, initialFields]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setErrors({});
      setIsSubmitting(true);
      try {
        const formData = toFormData(fields);
        // The form's values stay out of the log: they are a person's name and SSN (B44).
        logger.info(`${entityName} form: Submitting`);
        const refused = await onSubmit(formData);
        if (Object.keys(refused).length > 0) {
          setErrors(refused);
          return;
        }
        reset();
        onClose();
      } catch (error) {
        logger.error(`${entityName} form: Submission failed`, { error });
        setErrors({
          submit: error instanceof Error ? error.message : `Failed to create ${entityName}`,
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [entityName, fields, toFormData, onSubmit, onClose, reset],
  );

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  return { fields, updateField, errors, isSubmitting, handleSubmit, handleClose, reset };
}

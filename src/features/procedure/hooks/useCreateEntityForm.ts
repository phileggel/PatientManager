import { useCallback, useEffect, useState } from "react";

import { logger } from "@/lib/logger";

/**
 * Validation function type
 * Returns error messages keyed by field name, or empty object if valid
 */
type ValidatorFn<TFields> = (fields: TFields) => Record<string, string>;

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
  /** Validation function */
  validator: ValidatorFn<TFields>;
  /** Transform fields to form data for submission */
  toFormData: (fields: TFields) => TFormData;
  /** Submit handler (should be async) */
  onSubmit: (data: TFormData) => Promise<void>;
  /** Callback when form is closed */
  onClose: () => void;
}

/**
 * Generic hook for create entity forms
 *
 * Handles common form patterns:
 * - Field state management
 * - Validation
 * - Error handling
 * - Loading state
 * - Form reset
 * - Submit workflow
 *
 * @example
 * ```ts
 * const form = useCreateEntityForm({
 *   entityName: "patient",
 *   initialFields: { name: "", ssn: "" },
 *   validator: (fields) => {
 *     const errors: Record<string, string> = {};
 *     if (!fields.name.trim()) errors.name = "Name is required";
 *     return errors;
 *   },
 *   toFormData: (fields) => ({ name: fields.name.trim(), ssn: fields.ssn.trim() || undefined }),
 *   onSubmit: async (data) => { await createPatient(data); },
 *   onClose: () => { closeModal(); }
 * });
 * ```
 */
export function useCreateEntityForm<TFields extends Record<string, unknown>, TFormData>({
  entityName,
  initialFields,
  initialQuery,
  queryField,
  validator,
  toFormData,
  onSubmit,
  onClose,
}: UseCreateEntityFormOptions<TFields, TFormData>) {
  // Form field state
  const [fields, setFields] = useState<TFields>(initialFields);

  // Error state
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Loading state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize query field when initialQuery changes
  useEffect(() => {
    if (initialQuery && queryField) {
      setFields((prev) => ({
        ...prev,
        [queryField]: initialQuery,
      }));
    }
  }, [initialQuery, queryField]);

  /**
   * Update a single field value
   */
  const updateField = useCallback(<K extends keyof TFields>(field: K, value: TFields[K]) => {
    setFields((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  /**
   * Validate form fields
   */
  const validate = useCallback((): boolean => {
    const validationErrors = validator(fields);
    setErrors(validationErrors);
    return Object.keys(validationErrors).length === 0;
  }, [fields, validator]);

  /**
   * Reset form to initial state
   */
  const reset = useCallback(() => {
    logger.debug(`${entityName} form: Resetting`);
    setFields(initialFields);
    setErrors({});
    setIsSubmitting(false);
  }, [entityName, initialFields]);

  /**
   * Handle form submission
   */
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!validate()) {
        return;
      }

      setIsSubmitting(true);

      try {
        const formData = toFormData(fields);

        logger.info(`${entityName} form: Submitting`, formData);

        await onSubmit(formData);

        // Reset form after successful submission
        reset();
        onClose();

        logger.debug(`${entityName} form: Successfully submitted`);
      } catch (error) {
        logger.error(`${entityName} form: Submission failed`, error);
        setErrors({
          submit: error instanceof Error ? error.message : `Failed to create ${entityName}`,
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [entityName, fields, validate, toFormData, onSubmit, onClose, reset],
  );

  /**
   * Handle form close
   */
  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  return {
    fields,
    updateField,
    errors,
    isSubmitting,
    handleSubmit,
    handleClose,
    reset,
  };
}

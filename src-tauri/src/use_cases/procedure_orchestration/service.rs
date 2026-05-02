use std::sync::Arc;

use crate::context::fund::FundRepository;
use crate::context::patient::PatientRepository;
use crate::context::procedure::{
    PaymentMethod, Procedure, ProcedureCandidate, ProcedureRefundRepository,
    ProcedureService as ContextProcedureService, ProcedureStatus, ProcedureTypeRepository,
};
use crate::core::logger::BACKEND;

/// Orchestration service for healthcare procedures
///
/// Coordinates across multiple bounded contexts (Patient, Fund, ProcedureType).
/// Handles FK validation and patient tracking side effects.
/// Delegates basic CRUD operations to context/procedure/ProcedureService.
/// Does NOT publish domain events (those are published by context service).
pub struct ProcedureOrchestrationService {
    context_procedure_service: Arc<ContextProcedureService>,
    patient_repository: Arc<dyn PatientRepository>,
    procedure_type_repository: Arc<dyn ProcedureTypeRepository>,
    fund_repository: Arc<dyn FundRepository>,
    procedure_refund_repository: Arc<dyn ProcedureRefundRepository>,
}

impl ProcedureOrchestrationService {
    /// Create a new procedure orchestration service
    pub fn new(
        context_procedure_service: Arc<ContextProcedureService>,
        patient_repository: Arc<dyn PatientRepository>,
        procedure_type_repository: Arc<dyn ProcedureTypeRepository>,
        fund_repository: Arc<dyn FundRepository>,
        procedure_refund_repository: Arc<dyn ProcedureRefundRepository>,
    ) -> Self {
        ProcedureOrchestrationService {
            context_procedure_service,
            patient_repository,
            procedure_type_repository,
            fund_repository,
            procedure_refund_repository,
        }
    }

    /// Get a single healthcare procedure by ID (delegates to context service)
    pub async fn read_procedure(&self, id: &str) -> anyhow::Result<Option<Procedure>> {
        self.context_procedure_service.read_procedure(id).await
    }

    /// Get multiple healthcare procedures by their IDs (delegates to context service)
    pub async fn read_procedures_by_ids(&self, ids: Vec<String>) -> anyhow::Result<Vec<Procedure>> {
        tracing::debug!(count = ids.len(), "Fetching procedures by IDs");
        self.context_procedure_service
            .read_procedures_by_ids(ids)
            .await
    }

    /// Get all healthcare procedures (delegates to context service)
    pub async fn get_all_procedures(&self) -> anyhow::Result<Vec<Procedure>> {
        self.context_procedure_service.read_all_procedures().await
    }

    /// Add a new healthcare procedure with FK validation and patient tracking
    ///
    /// Orchestration responsibilities:
    /// 1. Validates that referenced entities (Patient, ProcedureType, optional Fund) exist
    /// 2. Updates patient tracking fields if the procedure date is newer than latest_date
    /// 3. Maps payment_method string to PaymentMethod enum
    ///
    /// IMPORTANT: awaited_amount parameter is ignored and always recalculated
    /// from (billed_amount - paid_amount) to ensure consistency.
    #[allow(clippy::too_many_arguments)]
    pub async fn create_procedure(
        &self,
        patient_id: String,
        fund_id: Option<String>,
        procedure_type_id: String,
        procedure_date: String,
        billed_amount: Option<i64>,
        payment_method: Option<String>,
        confirmed_payment_date: Option<String>,
        paid_amount: Option<i64>,
        _awaited_amount: Option<i64>,
    ) -> anyhow::Result<Procedure> {
        tracing::debug!(
            patient_id = %patient_id,
            procedure_type_id = %procedure_type_id,
            "Creating new healthcare procedure with FK validation"
        );

        // Validate: Does patient exist?
        let patient = self
            .patient_repository
            .read_patient(&patient_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Patient not found or deleted"))?;

        // Validate: Does procedure type exist?
        let _ = self
            .procedure_type_repository
            .read_procedure_type(&procedure_type_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Procedure type not found or deleted"))?;

        // Validate: Does fund exist if provided?
        let _ = if let Some(id) = &fund_id {
            Some(
                self.fund_repository
                    .read_fund(id)
                    .await?
                    .ok_or_else(|| anyhow::anyhow!("Fund {} not found or deleted", id))?,
            )
        } else {
            None
        };

        // Map payment method string to enum
        let mapped_payment_method = Self::determine_payment_method(
            payment_method.as_deref(),
            confirmed_payment_date.as_deref(),
        );

        // Determine initial status based on payment info
        let status = Self::determine_procedure_status(
            billed_amount,
            paid_amount,
            confirmed_payment_date.as_deref(),
            payment_method.as_deref(),
            fund_id.as_deref(),
        );

        // Delegate to context service for state change (which publishes event)
        let procedure = self
            .context_procedure_service
            .create_procedure(
                patient_id.clone(),
                fund_id.clone(),
                procedure_type_id.clone(),
                procedure_date.clone(),
                billed_amount,
                mapped_payment_method,
                confirmed_payment_date,
                paid_amount,
                status,
            )
            .await?;

        // Update patient tracking if date is newer (cross-context side effect)
        let mut updated_patient = patient.clone();
        let should_update_tracking = patient
            .latest_date
            .as_ref()
            .map(|latest| &procedure.procedure_date > latest)
            .unwrap_or(true); // If no latest_date, this is the first procedure

        if should_update_tracking {
            updated_patient.latest_date = Some(procedure.procedure_date);
            updated_patient.latest_procedure_type = Some(procedure_type_id.clone());
            updated_patient.latest_procedure_amount = billed_amount;
            updated_patient.latest_fund = fund_id.clone();

            self.patient_repository
                .update_patient(updated_patient)
                .await?;

            tracing::debug!(
                patient_id = %patient_id,
                "Patient tracking fields updated"
            );
        }

        Ok(procedure)
    }

    /// Update a procedure (delegates to context service).
    ///
    /// REF-170: If the updated procedure has `Overpaid` status, propagates any
    /// `procedure_type_id` change to the linked `OverpaymentRefund` procedure atomically.
    pub async fn update_procedure(&self, procedure: Procedure) -> anyhow::Result<Procedure> {
        let updated = self
            .context_procedure_service
            .update_procedure(procedure.clone())
            .await?;

        // REF-170: propagate procedure_type_id to the linked refund procedure
        if updated.payment_status == ProcedureStatus::Overpaid {
            if let Some(refund_record) = self
                .procedure_refund_repository
                .find_by_source_procedure_id(&updated.id)
                .await?
            {
                if let Some(refund_proc) = self
                    .context_procedure_service
                    .read_procedure(&refund_record.refund_procedure_id)
                    .await?
                {
                    if refund_proc.procedure_type_id != updated.procedure_type_id {
                        let updated_refund = Procedure::restore(
                            refund_proc.id,
                            refund_proc.patient_id,
                            refund_proc.fund_id,
                            updated.procedure_type_id.clone(),
                            refund_proc.procedure_date,
                            refund_proc.billed_amount,
                            refund_proc.payment_method,
                            refund_proc.confirmed_payment_date,
                            refund_proc.paid_amount,
                            refund_proc.payment_status,
                        );
                        self.context_procedure_service
                            .update_procedure(updated_refund)
                            .await?;
                        tracing::info!(
                            name: BACKEND,
                            source_procedure_id = %updated.id,
                            refund_procedure_id = %refund_record.refund_procedure_id,
                            new_procedure_type_id = %updated.procedure_type_id,
                            "REF-170: propagated procedure_type_id to refund procedure"
                        );
                    }
                }
            }
        }

        Ok(updated)
    }

    /// Delete a healthcare procedure with patient tracking cleanup
    ///
    /// Orchestration responsibilities:
    /// 1. Rejects deletion for procedures linked to a payment group or bank transaction (R5)
    /// 2. Clears patient tracking fields if the patient has no remaining procedures (R20)
    pub async fn delete_procedure(&self, id: &str) -> anyhow::Result<()> {
        tracing::debug!(procedure_id = %id, "Deleting healthcare procedure");

        // Guard: reject deletion for procedures linked to a payment (R5)
        let procedure = self
            .context_procedure_service
            .read_procedure(id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Procedure {} not found", id))?;

        if Self::is_blocking_status(&procedure.payment_status) {
            tracing::warn!(
                name = BACKEND,
                procedure_id = %id,
                status = ?procedure.payment_status,
                "Delete blocked: procedure is linked to a payment"
            );
            anyhow::bail!(
                "Cannot delete procedure with status {:?}: linked to a payment group or bank transaction",
                procedure.payment_status
            );
        }

        // Delegate to context service for state change (which publishes event)
        self.context_procedure_service.delete_procedure(id).await?;

        tracing::debug!(procedure_id = %id, "Procedure deleted successfully");

        // Recalculate patient tracking after deletion (cross-context side effect, R20)
        let remaining = self
            .context_procedure_service
            .read_procedures_by_patient_id(&procedure.patient_id)
            .await?;

        if let Some(patient) = self
            .patient_repository
            .read_patient(&procedure.patient_id)
            .await?
        {
            let mut updated = patient;
            if remaining.is_empty() {
                updated.latest_date = None;
                updated.latest_procedure_type = None;
                updated.latest_fund = None;
                updated.latest_procedure_amount = None;
            } else if let Some(new_latest) = remaining
                .iter()
                .max_by(|a, b| a.procedure_date.cmp(&b.procedure_date))
            {
                updated.latest_date = Some(new_latest.procedure_date);
                updated.latest_procedure_type = Some(new_latest.procedure_type_id.clone());
                updated.latest_fund = new_latest.fund_id.clone();
                updated.latest_procedure_amount = new_latest.billed_amount;
            }
            self.patient_repository.update_patient(updated).await?;
        }

        Ok(())
    }

    /// Clear procedure type tracking for all patients referencing a soft-deleted type
    pub async fn clear_procedure_type_tracking(&self, deleted_type_id: &str) -> anyhow::Result<()> {
        tracing::debug!(type_id = %deleted_type_id, "Clearing procedure type tracking");

        let all_patients = self.patient_repository.read_all_patients().await?;

        for patient in all_patients {
            // latest_procedure_type now stores procedure_type_id (UUID), so direct comparison
            if patient.latest_procedure_type.as_ref() == Some(&deleted_type_id.to_string()) {
                let mut updated_patient = patient.clone();
                updated_patient.latest_procedure_type = None;
                updated_patient.latest_date = None;
                self.patient_repository
                    .update_patient(updated_patient)
                    .await?;
            }
        }

        Ok(())
    }

    /// Clear fund tracking for all patients referencing a soft-deleted fund
    pub async fn clear_fund_tracking(&self, deleted_fund_id: &str) -> anyhow::Result<()> {
        tracing::debug!(fund_id = %deleted_fund_id, "Clearing fund tracking");

        let all_patients = self.patient_repository.read_all_patients().await?;

        for patient in all_patients {
            // latest_fund now stores fund_id (UUID), so direct comparison
            if patient.latest_fund.as_ref() == Some(&deleted_fund_id.to_string()) {
                let mut updated_patient = patient.clone();
                updated_patient.latest_fund = None;
                self.patient_repository
                    .update_patient(updated_patient)
                    .await?;
            }
        }

        Ok(())
    }

    /// Validate a batch of procedure candidates
    pub async fn validate_batch(
        &self,
        candidates: Vec<ProcedureCandidate>,
    ) -> anyhow::Result<Vec<super::api::ProcedureValidationResult>> {
        let mut results = Vec::new();

        for candidate in candidates {
            let mut result = super::api::ProcedureValidationResult {
                candidate: candidate.clone(),
                status: super::api::ProcedureValidationStatus::Valid,
                error: None,
            };

            // Validate required fields
            if candidate.patient_id.is_empty()
                || candidate.procedure_type_id.is_empty()
                || candidate.procedure_date.is_empty()
            {
                result.status = super::api::ProcedureValidationStatus::Invalid;
                result.error = Some(
                    "Procedure must have patient_id, procedure_type_id, and procedure_date"
                        .to_string(),
                );
                results.push(result);
                continue;
            }

            // Validate that patient exists
            match self
                .patient_repository
                .read_patient(&candidate.patient_id)
                .await
            {
                Ok(Some(_)) => {
                    // Patient exists, valid
                }
                Ok(None) => {
                    result.status = super::api::ProcedureValidationStatus::Invalid;
                    result.error = Some("Patient not found".to_string());
                    results.push(result);
                    continue;
                }
                Err(e) => {
                    result.status = super::api::ProcedureValidationStatus::Invalid;
                    result.error = Some(format!("Database error checking patient: {}", e));
                    results.push(result);
                    continue;
                }
            }

            // Validate that procedure type exists
            match self
                .procedure_type_repository
                .read_procedure_type(&candidate.procedure_type_id)
                .await
            {
                Ok(Some(_)) => {
                    // Procedure type exists, valid
                }
                Ok(None) => {
                    result.status = super::api::ProcedureValidationStatus::Invalid;
                    result.error = Some("Procedure type not found".to_string());
                    results.push(result);
                    continue;
                }
                Err(e) => {
                    result.status = super::api::ProcedureValidationStatus::Invalid;
                    result.error = Some(format!("Database error checking procedure type: {}", e));
                    results.push(result);
                    continue;
                }
            }

            // Validate fund if provided
            if let Some(fund_id) = &candidate.fund_id {
                match self.fund_repository.read_fund(fund_id).await {
                    Ok(Some(_)) => {
                        // Fund exists, valid
                    }
                    Ok(None) => {
                        result.status = super::api::ProcedureValidationStatus::Invalid;
                        result.error = Some("Fund not found".to_string());
                        results.push(result);
                        continue;
                    }
                    Err(e) => {
                        result.status = super::api::ProcedureValidationStatus::Invalid;
                        result.error = Some(format!("Database error checking fund: {}", e));
                        results.push(result);
                        continue;
                    }
                }
            }

            results.push(result);
        }

        Ok(results)
    }

    /// Create a batch of valid procedures
    ///
    /// awaited_amount is recalculated from billed_amount and paid_amount
    /// before saving to ensure consistency.
    /// Also updates patient tracking fields (latest_date, latest_procedure_type, etc.)
    /// for each patient that received new procedures.
    pub async fn create_batch(
        &self,
        candidates: Vec<ProcedureCandidate>,
    ) -> anyhow::Result<Vec<Procedure>> {
        let mut procedures_to_create = Vec::new();

        for candidate in candidates {
            // Map payment method string to enum based on confirmed_payment_date
            let payment_method = Self::determine_payment_method(
                candidate.payment_method.as_deref(),
                candidate.confirmed_payment_date.as_deref(),
            );

            // Determine status based on payment completeness
            let status = Self::determine_procedure_status(
                candidate.billed_amount,
                candidate.paid_amount,
                candidate.confirmed_payment_date.as_deref(),
                candidate.payment_method.as_deref(),
                candidate.fund_id.as_deref(),
            );

            // Create domain object (generates ID and validates)
            match Procedure::new(
                candidate.patient_id,
                candidate.fund_id,
                candidate.procedure_type_id,
                candidate.procedure_date,
                candidate.billed_amount,
                payment_method,
                candidate.confirmed_payment_date,
                candidate.paid_amount,
                status,
            ) {
                Ok(procedure) => procedures_to_create.push(procedure),
                Err(e) => {
                    tracing::warn!(error = %e, "Skipping invalid procedure candidate in batch");
                }
            }
        }

        // Use the batch creation method which uses a single transaction and emits a single event
        let created_procedures = self
            .context_procedure_service
            .create_batch(procedures_to_create)
            .await?;

        // Update patient tracking fields for patients with new procedures (cross-context side effect)
        // Same logic as create_procedure but batched: find the most recent procedure per patient
        let mut latest_per_patient: std::collections::HashMap<String, Procedure> =
            std::collections::HashMap::new();
        for procedure in &created_procedures {
            let entry = latest_per_patient
                .entry(procedure.patient_id.clone())
                .or_insert_with(|| procedure.clone());
            if procedure.procedure_date > entry.procedure_date {
                *entry = procedure.clone();
            }
        }

        for (patient_id, latest) in &latest_per_patient {
            if let Some(patient) = self.patient_repository.read_patient(patient_id).await? {
                let should_update = patient
                    .latest_date
                    .as_ref()
                    .map(|existing_latest| latest.procedure_date > *existing_latest)
                    .unwrap_or(true);

                if should_update {
                    let mut updated_patient = patient.clone();
                    updated_patient.latest_date = Some(latest.procedure_date);
                    updated_patient.latest_procedure_type = Some(latest.procedure_type_id.clone());
                    updated_patient.latest_procedure_amount = latest.billed_amount;
                    updated_patient.latest_fund = latest.fund_id.clone();
                    self.patient_repository
                        .update_patient(updated_patient)
                        .await?;
                    tracing::debug!(
                        patient_id = %patient_id,
                        "Patient tracking fields updated via batch creation"
                    );
                }
            }
        }

        Ok(created_procedures)
    }

    /// Get unpaid procedures by fund (delegates to context service)
    pub async fn get_unpaid_by_fund(&self, fund_id: &str) -> anyhow::Result<Vec<Procedure>> {
        self.context_procedure_service
            .find_unpaid_by_fund(fund_id)
            .await
    }

    /// Returns true if the procedure status prevents deletion and direct editing (R5, R6).
    ///
    /// Blocking statuses are those linked to a fund payment group or bank transaction.
    /// Import statuses (ImportDirectlyPaid, ImportFundPaid) are intentionally excluded:
    /// they represent non-blocking re-importable data and allow deletion with confirmation.
    fn is_blocking_status(status: &ProcedureStatus) -> bool {
        matches!(
            status,
            ProcedureStatus::Reconciled
                | ProcedureStatus::PartiallyReconciled
                | ProcedureStatus::FundPaid
                | ProcedureStatus::PartiallyFundPaid
                | ProcedureStatus::DirectlyPaid
                // REF-220: Overpaid source procedures cannot be deleted directly.
                // REF-230: OverpaymentRefund mirror procedures cannot be deleted directly.
                // Deletion must go through the cancel_overpayment cascade.
                | ProcedureStatus::Overpaid
                | ProcedureStatus::OverpaymentRefund
        )
    }

    /// Determine procedure status based on payment completeness and metadata.
    ///
    /// Import-specific statuses (non-blocking re-import):
    /// - ImportDirectlyPaid: payment confirmed (date + amount) AND (method is ES/CH OR no fund)
    /// - ImportFundPaid: payment confirmed AND method is not ES/CH AND fund is present
    fn determine_procedure_status(
        billed_amount: Option<i64>,
        paid_amount: Option<i64>,
        confirmed_payment_date: Option<&str>,
        payment_method: Option<&str>,
        fund_id: Option<&str>,
    ) -> ProcedureStatus {
        let is_paid = (confirmed_payment_date.is_some()
            && !confirmed_payment_date.unwrap_or("").is_empty()
            && paid_amount.unwrap_or(0) > 0)
            || Self::is_fully_paid(billed_amount, paid_amount);

        if !is_paid {
            // NEVER return None here, Created is the minimum state for a valid procedure
            return ProcedureStatus::Created;
        }

        let is_direct_method = matches!(payment_method, Some("ES") | Some("CH"));
        if is_direct_method || fund_id.is_none() {
            ProcedureStatus::ImportDirectlyPaid
        } else {
            ProcedureStatus::ImportFundPaid
        }
    }

    /// Check if a procedure is fully paid (amount >= required)
    fn is_fully_paid(required: Option<i64>, paid: Option<i64>) -> bool {
        match (required, paid) {
            (Some(req), Some(p)) => p >= req,
            _ => false,
        }
    }

    /// Determine payment method from Excel import data
    ///
    /// Rules:
    /// - If confirmed_payment_date is empty → None (no payment info)
    /// - If confirmed_payment_date exists:
    ///   - If payment_method is "ES" → Cash
    ///   - If payment_method is "CH" → Check
    ///   - Otherwise → BankEntry (inferred from presence of date)
    fn determine_payment_method(
        payment_method: Option<&str>,
        confirmed_payment_date: Option<&str>,
    ) -> PaymentMethod {
        // If no confirmed payment date, payment method is None
        if confirmed_payment_date.is_none() || confirmed_payment_date == Some("") {
            return PaymentMethod::None;
        }

        // If confirmed payment date exists, map the explicit payment method
        match payment_method {
            Some("ES") => PaymentMethod::Cash,
            Some("CH") => PaymentMethod::Check,
            _ => PaymentMethod::BankTransfer, // Infer from date
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::context::fund::{Fund, MockFundRepository};
    use crate::context::patient::{MockPatientRepository, Patient};
    use crate::context::procedure::{
        MockProcedureRepository, MockProcedureTypeRepository, Procedure,
        ProcedureService as ContextProcedureService, ProcedureStatus, ProcedureType,
    };
    use crate::core::event_bus::EventBus;
    use crate::use_cases::procedure_orchestration::ProcedureValidationStatus;
    use chrono::NaiveDate;
    use std::sync::{Arc, Mutex};

    // Manual mock kept for ProcedureRefundRepository (small, behavior varies)
    struct MockProcedureRefundRepository;

    #[async_trait::async_trait]
    impl crate::context::procedure::ProcedureRefundRepository for MockProcedureRefundRepository {
        async fn create_procedure_refund(
            &self,
            _refund: &crate::context::procedure::ProcedureRefund,
        ) -> anyhow::Result<()> {
            Ok(())
        }
        async fn find_by_source_procedure_id(
            &self,
            _source_id: &str,
        ) -> anyhow::Result<Option<crate::context::procedure::ProcedureRefund>> {
            Ok(None)
        }
        async fn find_by_refund_procedure_id(
            &self,
            _refund_procedure_id: &str,
        ) -> anyhow::Result<Option<crate::context::procedure::ProcedureRefund>> {
            Ok(None)
        }
        async fn delete_procedure_refund(&self, _id: &str) -> anyhow::Result<()> {
            Ok(())
        }
        async fn is_refund_fund_payment_group(&self, _group_id: &str) -> anyhow::Result<bool> {
            Ok(false)
        }
    }

    /// Build a MockProcedureRepository that stubs all methods as unimplemented
    /// except create_batch (pass-through) and update_procedure (pass-through).
    fn mock_proc_repo_passthrough() -> MockProcedureRepository {
        let mut mock = MockProcedureRepository::new();
        mock.expect_create_procedure()
            .returning(|_, _, _, _, _, _, _, _, _| {
                panic!("create_procedure not expected in this test")
            });
        mock.expect_read_all_procedures().returning(|| Ok(vec![]));
        mock.expect_read_procedure()
            .returning(|_| panic!("read_procedure not expected in this test"));
        mock.expect_read_procedures_by_ids()
            .returning(|_| panic!("read_procedures_by_ids not expected in this test"));
        mock.expect_read_procedures_by_patient_id()
            .returning(|_| panic!("read_procedures_by_patient_id not expected in this test"));
        mock.expect_update_procedure().returning(Ok);
        mock.expect_delete_procedure()
            .returning(|_| panic!("delete_procedure not expected in this test"));
        mock.expect_find_procedures_by_ssn_and_date_range()
            .returning(|_, _, _| panic!("not expected"));
        mock.expect_find_procedures_by_ssns_and_date_range()
            .returning(|_, _, _| panic!("not expected"));
        mock.expect_find_procedures_by_ssns_and_date_range_with_ssn()
            .returning(|_, _, _| panic!("not expected"));
        mock.expect_find_procedure_exact()
            .returning(|_, _, _, _| panic!("not expected"));
        mock.expect_create_batch().returning(Ok);
        mock.expect_update_batch()
            .returning(|_| panic!("not expected"));
        mock.expect_find_unpaid_by_fund()
            .returning(|_| panic!("not expected"));
        mock.expect_has_blocking_procedures_in_month()
            .returning(|_| panic!("not expected"));
        mock.expect_delete_procedures_by_month()
            .returning(|_| panic!("not expected"));
        mock.expect_find_unreconciled_by_date_range()
            .returning(|_, _| panic!("not expected"));
        mock.expect_find_created_in_date_range()
            .returning(|_, _| panic!("not expected"));
        mock.expect_find_created_by_fund_before_date()
            .returning(|_, _| panic!("not expected"));
        mock
    }

    /// Build a patient mock that returns `patient` from read_patient / read_all_patients
    /// and captures any update into `updated_capture`.
    fn mock_patient_repo(
        patient: Option<Patient>,
        updated_capture: Arc<Mutex<Option<Patient>>>,
    ) -> MockPatientRepository {
        let patient_for_read = patient.clone();
        let patient_for_all = patient.clone();
        let cap = updated_capture;
        let mut mock = MockPatientRepository::new();
        mock.expect_read_patient()
            .returning(move |_| Ok(patient_for_read.clone()));
        mock.expect_read_all_patients()
            .returning(move || Ok(patient_for_all.clone().map(|p| vec![p]).unwrap_or_default()));
        mock.expect_update_patient().returning(move |p| {
            *cap.lock().unwrap() = Some(p.clone());
            Ok(p)
        });
        mock.expect_create_patient()
            .returning(|_| panic!("not expected"));
        mock.expect_find_patient_by_ssn()
            .returning(|_| panic!("not expected"));
        mock.expect_create_batch()
            .returning(|_| panic!("not expected"));
        mock.expect_delete_patient()
            .returning(|_| panic!("not expected"));
        mock
    }

    /// Build a ProcedureTypeRepository mock that always returns a found type
    fn mock_type_repo_with_type() -> MockProcedureTypeRepository {
        let mut mock = MockProcedureTypeRepository::new();
        mock.expect_read_procedure_type().returning(|id| {
            Ok(Some(ProcedureType::restore(
                id.to_string(),
                "Test Type".to_string(),
                10000,
                None,
            )))
        });
        mock.expect_read_all_procedure_types()
            .returning(|| Ok(vec![]));
        mock
    }

    /// Build a ProcedureTypeRepository mock that always returns None (not found)
    fn mock_type_repo_not_found() -> MockProcedureTypeRepository {
        let mut mock = MockProcedureTypeRepository::new();
        mock.expect_read_procedure_type().returning(|_| Ok(None));
        mock.expect_read_all_procedure_types()
            .returning(|| Ok(vec![]));
        mock
    }

    /// Build a ProcedureTypeRepository stub (read_procedure_type never called)
    fn mock_type_repo_stub() -> MockProcedureTypeRepository {
        let mut mock = MockProcedureTypeRepository::new();
        mock.expect_read_all_procedure_types()
            .returning(|| Ok(vec![]));
        mock
    }

    /// Build a FundRepository mock that returns a fund on read_fund
    fn mock_fund_repo_with_fund() -> MockFundRepository {
        let mut mock = MockFundRepository::new();
        mock.expect_read_fund().returning(|id| {
            Ok(Some(Fund::restore(
                id.to_string(),
                "FND".to_string(),
                "Test Fund".to_string(),
            )))
        });
        mock.expect_read_all_funds().returning(|| Ok(vec![]));
        mock
    }

    /// Build a FundRepository mock that returns None on read_fund
    fn mock_fund_repo_not_found() -> MockFundRepository {
        let mut mock = MockFundRepository::new();
        mock.expect_read_fund().returning(|_| Ok(None));
        mock.expect_read_all_funds().returning(|| Ok(vec![]));
        mock
    }

    /// Build a FundRepository stub (read_fund never called)
    fn mock_fund_repo_stub() -> MockFundRepository {
        let mut mock = MockFundRepository::new();
        mock.expect_read_all_funds().returning(|| Ok(vec![]));
        mock
    }

    /// Build a ProcedureRepository mock that creates a procedure with id "new-proc-id"
    fn mock_proc_repo_creating() -> MockProcedureRepository {
        let mut mock = MockProcedureRepository::new();
        mock.expect_create_procedure().returning(
            |patient_id,
             fund_id,
             procedure_type_id,
             procedure_date,
             billed_amount,
             payment_method,
             confirmed_payment_date,
             paid_amount,
             payment_status| {
                Procedure::with_id(
                    "new-proc-id".to_string(),
                    patient_id,
                    fund_id,
                    procedure_type_id,
                    procedure_date,
                    billed_amount,
                    payment_method,
                    confirmed_payment_date,
                    paid_amount,
                    payment_status,
                )
                .map_err(|e| anyhow::anyhow!("{}", e))
            },
        );
        mock.expect_read_all_procedures().returning(|| Ok(vec![]));
        mock.expect_update_procedure().returning(Ok);
        mock.expect_create_batch().returning(Ok);
        mock
    }

    /// Build a ProcedureRepository mock that returns `procedure` from read_procedure,
    /// returns empty vec from read_procedures_by_patient_id.
    fn mock_proc_repo_with_procedure(procedure: Procedure) -> MockProcedureRepository {
        let proc_for_read = procedure.clone();
        let proc_for_all = procedure;
        let mut mock = MockProcedureRepository::new();
        mock.expect_read_procedure()
            .returning(move |_| Ok(Some(proc_for_read.clone())));
        mock.expect_read_all_procedures()
            .returning(move || Ok(vec![proc_for_all.clone()]));
        mock.expect_read_procedures_by_patient_id()
            .returning(|_| Ok(vec![]));
        mock.expect_update_procedure().returning(Ok);
        mock.expect_delete_procedure().returning(|_| Ok(()));
        mock.expect_create_batch().returning(Ok);
        mock
    }

    /// Build a ProcedureRepository mock for the WithRemainingAfterDelete pattern:
    /// - read_procedure returns `to_delete`
    /// - read_procedures_by_patient_id returns `remaining` filtered by patient_id
    /// - delete_procedure and update_procedure are pass-throughs
    fn mock_proc_repo_with_remaining(
        to_delete: Procedure,
        remaining: Vec<Procedure>,
    ) -> MockProcedureRepository {
        let proc_for_read = to_delete;
        let remaining_for_filter = remaining;
        let mut mock = MockProcedureRepository::new();
        mock.expect_read_procedure()
            .returning(move |_| Ok(Some(proc_for_read.clone())));
        mock.expect_read_procedures_by_patient_id()
            .returning(move |patient_id| {
                Ok(remaining_for_filter
                    .iter()
                    .filter(|p| p.patient_id == patient_id)
                    .cloned()
                    .collect())
            });
        mock.expect_update_procedure().returning(Ok);
        mock.expect_delete_procedure().returning(|_| Ok(()));
        mock.expect_read_all_procedures().returning(|| Ok(vec![]));
        mock.expect_create_batch().returning(Ok);
        mock
    }

    fn make_procedure_with_status(status: ProcedureStatus) -> Procedure {
        Procedure::with_id(
            "proc-id-1".to_string(),
            "patient-id-1".to_string(),
            None,
            "type-id-1".to_string(),
            "2024-06-15".to_string(),
            Some(100000),
            PaymentMethod::None,
            None,
            None,
            status,
        )
        .expect("valid procedure")
    }

    fn make_orchestrator_with_procedure(procedure: Procedure) -> ProcedureOrchestrationService {
        let event_bus = Arc::new(EventBus::new());
        let context_service = Arc::new(ContextProcedureService::new(
            Arc::new(mock_proc_repo_with_procedure(procedure)),
            event_bus,
        ));
        let updated_capture = Arc::new(Mutex::new(None));
        let patient_repo = Arc::new(mock_patient_repo(None, updated_capture));
        ProcedureOrchestrationService::new(
            context_service,
            patient_repo,
            Arc::new(mock_type_repo_stub()),
            Arc::new(mock_fund_repo_stub()),
            Arc::new(MockProcedureRefundRepository),
        )
    }

    fn make_orchestrator_with_repos(
        patient_repo: Arc<dyn PatientRepository>,
        type_repo: Arc<dyn ProcedureTypeRepository>,
        fund_repo: Arc<dyn FundRepository>,
    ) -> ProcedureOrchestrationService {
        let event_bus = Arc::new(EventBus::new());
        let context_service = Arc::new(ContextProcedureService::new(
            Arc::new(mock_proc_repo_passthrough()),
            event_bus,
        ));
        ProcedureOrchestrationService::new(
            context_service,
            patient_repo,
            type_repo,
            fund_repo,
            Arc::new(MockProcedureRefundRepository),
        )
    }

    fn make_valid_patient() -> Patient {
        Patient::restore(
            "patient-id-1".to_string(),
            false,
            Some("Marie Dupont".to_string()),
            None,
            None,
            None,
            None,
            None,
        )
    }

    fn make_patient_repo(patient: Option<Patient>) -> Arc<MockPatientRepository> {
        let updated_capture = Arc::new(Mutex::new(None));
        Arc::new(mock_patient_repo(patient, updated_capture))
    }

    #[tokio::test]
    async fn test_create_batch_updates_latest_xx() {
        let patient = Patient::restore(
            "patient-id-1".to_string(),
            false,
            Some("Marie Dupont".to_string()),
            None,
            None,
            None,
            None,
            None,
        );

        let updated_capture: Arc<Mutex<Option<Patient>>> = Arc::new(Mutex::new(None));
        let patient_repo = Arc::new(mock_patient_repo(Some(patient), updated_capture.clone()));

        let event_bus = Arc::new(EventBus::new());
        let context_service = Arc::new(ContextProcedureService::new(
            Arc::new(mock_proc_repo_passthrough()),
            event_bus,
        ));

        let orchestrator = ProcedureOrchestrationService::new(
            context_service,
            patient_repo,
            Arc::new(mock_type_repo_stub()),
            Arc::new(mock_fund_repo_stub()),
            Arc::new(MockProcedureRefundRepository),
        );

        let candidate = ProcedureCandidate {
            patient_id: "patient-id-1".to_string(),
            fund_id: Some("fund-id-1".to_string()),
            procedure_type_id: "type-id-1".to_string(),
            procedure_date: "2024-06-15".to_string(),
            billed_amount: Some(100000),
            payment_method: None,
            confirmed_payment_date: None,
            paid_amount: None,
            awaited_amount: None,
        };

        let result = orchestrator.create_batch(vec![candidate]).await;
        assert!(result.is_ok());

        let updated = updated_capture.lock().unwrap().clone();
        assert!(
            updated.is_some(),
            "Patient should have been updated with latest_xx fields"
        );
        let updated_patient = updated.unwrap();

        assert_eq!(
            updated_patient.latest_date,
            Some(NaiveDate::from_ymd_opt(2024, 6, 15).unwrap())
        );
        assert_eq!(
            updated_patient.latest_procedure_type,
            Some("type-id-1".to_string())
        );
        assert_eq!(updated_patient.latest_fund, Some("fund-id-1".to_string()));
        assert_eq!(updated_patient.latest_procedure_amount, Some(100000));
    }

    #[tokio::test]
    async fn test_create_batch_does_not_update_if_older_procedure() {
        // Patient already has a more recent procedure
        let existing_date = NaiveDate::from_ymd_opt(2024, 12, 1).unwrap();
        let patient = Patient::restore(
            "patient-id-1".to_string(),
            false,
            Some("Marie Dupont".to_string()),
            None,
            Some("old-type-id".to_string()),
            Some("old-fund-id".to_string()),
            Some(existing_date),
            Some(200000),
        );

        let updated_capture: Arc<Mutex<Option<Patient>>> = Arc::new(Mutex::new(None));
        let patient_repo = Arc::new(mock_patient_repo(Some(patient), updated_capture.clone()));

        let event_bus = Arc::new(EventBus::new());
        let context_service = Arc::new(ContextProcedureService::new(
            Arc::new(mock_proc_repo_passthrough()),
            event_bus,
        ));

        let orchestrator = ProcedureOrchestrationService::new(
            context_service,
            patient_repo,
            Arc::new(mock_type_repo_stub()),
            Arc::new(mock_fund_repo_stub()),
            Arc::new(MockProcedureRefundRepository),
        );

        // Older procedure date (2024-06-15 < 2024-12-01)
        let candidate = ProcedureCandidate {
            patient_id: "patient-id-1".to_string(),
            fund_id: Some("fund-id-1".to_string()),
            procedure_type_id: "type-id-1".to_string(),
            procedure_date: "2024-06-15".to_string(),
            billed_amount: Some(100000),
            payment_method: None,
            confirmed_payment_date: None,
            paid_amount: None,
            awaited_amount: None,
        };

        let result = orchestrator.create_batch(vec![candidate]).await;
        assert!(result.is_ok());

        // Patient should NOT have been updated (existing date is newer)
        let updated = updated_capture.lock().unwrap().clone();
        assert!(
            updated.is_none(),
            "Patient should NOT be updated when batch procedure is older"
        );
    }

    #[tokio::test]
    async fn test_delete_procedure_blocked_for_reconciliated() {
        let proc = make_procedure_with_status(ProcedureStatus::Reconciled);
        let orchestrator = make_orchestrator_with_procedure(proc);
        let result = orchestrator.delete_procedure("proc-id-1").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Cannot delete"));
    }

    #[tokio::test]
    async fn test_delete_procedure_blocked_for_partially_reconciliated() {
        let proc = make_procedure_with_status(ProcedureStatus::PartiallyReconciled);
        let orchestrator = make_orchestrator_with_procedure(proc);
        let result = orchestrator.delete_procedure("proc-id-1").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Cannot delete"));
    }

    #[tokio::test]
    async fn test_delete_procedure_blocked_for_fund_payed() {
        let proc = make_procedure_with_status(ProcedureStatus::FundPaid);
        let orchestrator = make_orchestrator_with_procedure(proc);
        let result = orchestrator.delete_procedure("proc-id-1").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Cannot delete"));
    }

    #[tokio::test]
    async fn test_delete_procedure_blocked_for_partially_fund_payed() {
        let proc = make_procedure_with_status(ProcedureStatus::PartiallyFundPaid);
        let orchestrator = make_orchestrator_with_procedure(proc);
        let result = orchestrator.delete_procedure("proc-id-1").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Cannot delete"));
    }

    #[tokio::test]
    async fn test_delete_procedure_blocked_for_directly_payed() {
        let proc = make_procedure_with_status(ProcedureStatus::DirectlyPaid);
        let orchestrator = make_orchestrator_with_procedure(proc);
        let result = orchestrator.delete_procedure("proc-id-1").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Cannot delete"));
    }

    #[tokio::test]
    async fn test_delete_procedure_allowed_for_created() {
        let proc = make_procedure_with_status(ProcedureStatus::Created);
        let orchestrator = make_orchestrator_with_procedure(proc);
        let result = orchestrator.delete_procedure("proc-id-1").await;
        assert!(result.is_ok(), "Created procedure should be deletable");
    }

    #[tokio::test]
    async fn test_delete_procedure_allowed_for_import_statuses() {
        for status in [
            ProcedureStatus::ImportDirectlyPaid,
            ProcedureStatus::ImportFundPaid,
            ProcedureStatus::None,
        ] {
            let proc = make_procedure_with_status(status);
            let orchestrator = make_orchestrator_with_procedure(proc);
            let result = orchestrator.delete_procedure("proc-id-1").await;
            assert!(result.is_ok(), "Status {:?} should be deletable", status);
        }
    }

    // --- R20: patient tracking recalculated when latest procedure is deleted ---

    #[tokio::test]
    async fn test_delete_procedure_recalculates_tracking_when_older_procedures_remain() {
        // Patient has two procedures: older (2024-01-15) and newer (2024-06-15, the one being deleted).
        // After deleting the newer one, tracking should reflect the older procedure.
        let newer = Procedure::with_id(
            "proc-newer".to_string(),
            "patient-id-1".to_string(),
            Some("fund-newer".to_string()),
            "type-newer".to_string(),
            "2024-06-15".to_string(),
            Some(200000),
            PaymentMethod::None,
            None,
            None,
            ProcedureStatus::Created,
        )
        .unwrap();

        let older = Procedure::with_id(
            "proc-older".to_string(),
            "patient-id-1".to_string(),
            Some("fund-older".to_string()),
            "type-older".to_string(),
            "2024-01-15".to_string(),
            Some(100000),
            PaymentMethod::None,
            None,
            None,
            ProcedureStatus::Created,
        )
        .unwrap();

        let patient = Patient::restore(
            "patient-id-1".to_string(),
            false,
            Some("Marie Dupont".to_string()),
            None,
            Some("type-newer".to_string()),
            Some("fund-newer".to_string()),
            Some(NaiveDate::from_ymd_opt(2024, 6, 15).unwrap()),
            Some(200000),
        );

        let updated_capture: Arc<Mutex<Option<Patient>>> = Arc::new(Mutex::new(None));
        let patient_repo = Arc::new(mock_patient_repo(Some(patient), updated_capture.clone()));

        let event_bus = Arc::new(EventBus::new());
        let context_service = Arc::new(ContextProcedureService::new(
            Arc::new(mock_proc_repo_with_remaining(newer, vec![older])),
            event_bus,
        ));

        let orchestrator = ProcedureOrchestrationService::new(
            context_service,
            patient_repo,
            Arc::new(mock_type_repo_stub()),
            Arc::new(mock_fund_repo_stub()),
            Arc::new(MockProcedureRefundRepository),
        );

        orchestrator.delete_procedure("proc-newer").await.unwrap();

        let updated = updated_capture.lock().unwrap().clone().unwrap();
        assert_eq!(
            updated.latest_date,
            Some(NaiveDate::from_ymd_opt(2024, 1, 15).unwrap())
        );
        assert_eq!(
            updated.latest_procedure_type,
            Some("type-older".to_string())
        );
        assert_eq!(updated.latest_fund, Some("fund-older".to_string()));
        assert_eq!(updated.latest_procedure_amount, Some(100000));
    }

    #[tokio::test]
    async fn test_delete_procedure_clears_tracking_when_no_procedures_remain() {
        let proc = Procedure::with_id(
            "proc-only".to_string(),
            "patient-id-1".to_string(),
            Some("fund-1".to_string()),
            "type-1".to_string(),
            "2024-06-15".to_string(),
            Some(100000),
            PaymentMethod::None,
            None,
            None,
            ProcedureStatus::Created,
        )
        .unwrap();

        let patient = Patient::restore(
            "patient-id-1".to_string(),
            false,
            Some("Marie Dupont".to_string()),
            None,
            Some("type-1".to_string()),
            Some("fund-1".to_string()),
            Some(NaiveDate::from_ymd_opt(2024, 6, 15).unwrap()),
            Some(100000),
        );

        let updated_capture: Arc<Mutex<Option<Patient>>> = Arc::new(Mutex::new(None));
        let patient_repo = Arc::new(mock_patient_repo(Some(patient), updated_capture.clone()));

        let event_bus = Arc::new(EventBus::new());
        let context_service = Arc::new(ContextProcedureService::new(
            Arc::new(mock_proc_repo_with_remaining(proc, vec![])),
            event_bus,
        ));

        let orchestrator = ProcedureOrchestrationService::new(
            context_service,
            patient_repo,
            Arc::new(mock_type_repo_stub()),
            Arc::new(mock_fund_repo_stub()),
            Arc::new(MockProcedureRefundRepository),
        );

        orchestrator.delete_procedure("proc-only").await.unwrap();

        let updated = updated_capture.lock().unwrap().clone().unwrap();
        assert_eq!(updated.latest_date, None);
        assert_eq!(updated.latest_procedure_type, None);
        assert_eq!(updated.latest_fund, None);
        assert_eq!(updated.latest_procedure_amount, None);
    }

    // --- R19: latest_fund cleared when newest single procedure has no fund ---

    #[tokio::test]
    async fn test_create_procedure_clears_latest_fund_when_no_fund() {
        let patient = Patient::restore(
            "patient-id-1".to_string(),
            false,
            Some("Marie Dupont".to_string()),
            None,
            Some("old-type-id".to_string()),
            Some("old-fund-id".to_string()),
            Some(NaiveDate::from_ymd_opt(2024, 1, 1).unwrap()),
            Some(50000),
        );

        let updated_capture: Arc<Mutex<Option<Patient>>> = Arc::new(Mutex::new(None));
        let patient_repo = Arc::new(mock_patient_repo(Some(patient), updated_capture.clone()));

        let event_bus = Arc::new(EventBus::new());
        let context_service = Arc::new(ContextProcedureService::new(
            Arc::new(mock_proc_repo_creating()),
            event_bus,
        ));

        let orchestrator = ProcedureOrchestrationService::new(
            context_service,
            patient_repo,
            Arc::new(mock_type_repo_with_type()),
            Arc::new(mock_fund_repo_stub()),
            Arc::new(MockProcedureRefundRepository),
        );

        orchestrator
            .create_procedure(
                "patient-id-1".to_string(),
                None, // no fund
                "new-type-id".to_string(),
                "2024-06-15".to_string(),
                Some(100000),
                None,
                None,
                None,
                None,
            )
            .await
            .unwrap();

        let updated = updated_capture.lock().unwrap().clone().unwrap();
        assert_eq!(
            updated.latest_date,
            Some(NaiveDate::from_ymd_opt(2024, 6, 15).unwrap())
        );
        assert_eq!(
            updated.latest_procedure_type,
            Some("new-type-id".to_string())
        );
        assert_eq!(
            updated.latest_fund, None,
            "latest_fund must be cleared when newest single procedure has no fund (R19)"
        );
        assert_eq!(updated.latest_procedure_amount, Some(100000));
    }

    // --- R19: latest_fund cleared when newest batch procedure has no fund ---

    #[tokio::test]
    async fn test_create_batch_clears_latest_fund_when_newest_has_no_fund() {
        let patient = Patient::restore(
            "patient-id-1".to_string(),
            false,
            Some("Marie Dupont".to_string()),
            None,
            Some("old-type-id".to_string()),
            Some("old-fund-id".to_string()),
            Some(NaiveDate::from_ymd_opt(2024, 1, 1).unwrap()),
            Some(50000),
        );

        let updated_capture: Arc<Mutex<Option<Patient>>> = Arc::new(Mutex::new(None));
        let patient_repo = Arc::new(mock_patient_repo(Some(patient), updated_capture.clone()));

        let event_bus = Arc::new(EventBus::new());
        let context_service = Arc::new(ContextProcedureService::new(
            Arc::new(mock_proc_repo_passthrough()),
            event_bus,
        ));

        let orchestrator = ProcedureOrchestrationService::new(
            context_service,
            patient_repo,
            Arc::new(mock_type_repo_stub()),
            Arc::new(mock_fund_repo_stub()),
            Arc::new(MockProcedureRefundRepository),
        );

        let candidate = ProcedureCandidate {
            patient_id: "patient-id-1".to_string(),
            fund_id: None, // no fund on this new procedure
            procedure_type_id: "new-type-id".to_string(),
            procedure_date: "2024-06-15".to_string(),
            billed_amount: Some(100000),
            payment_method: None,
            confirmed_payment_date: None,
            paid_amount: None,
            awaited_amount: None,
        };

        orchestrator.create_batch(vec![candidate]).await.unwrap();

        let updated = updated_capture.lock().unwrap().clone().unwrap();
        assert_eq!(
            updated.latest_date,
            Some(NaiveDate::from_ymd_opt(2024, 6, 15).unwrap())
        );
        assert_eq!(
            updated.latest_procedure_type,
            Some("new-type-id".to_string())
        );
        assert_eq!(
            updated.latest_fund, None,
            "latest_fund must be cleared when newest procedure has no fund"
        );
        assert_eq!(updated.latest_procedure_amount, Some(100000));
    }

    // --- determine_payment_method ---

    #[test]
    fn determine_payment_method_no_date_returns_none() {
        assert_eq!(
            ProcedureOrchestrationService::determine_payment_method(Some("ES"), None),
            PaymentMethod::None
        );
    }

    #[test]
    fn determine_payment_method_empty_date_returns_none() {
        assert_eq!(
            ProcedureOrchestrationService::determine_payment_method(None, Some("")),
            PaymentMethod::None
        );
    }

    #[test]
    fn determine_payment_method_es_returns_cash() {
        assert_eq!(
            ProcedureOrchestrationService::determine_payment_method(Some("ES"), Some("2024-01-01")),
            PaymentMethod::Cash
        );
    }

    #[test]
    fn determine_payment_method_ch_returns_check() {
        assert_eq!(
            ProcedureOrchestrationService::determine_payment_method(Some("CH"), Some("2024-01-01")),
            PaymentMethod::Check
        );
    }

    #[test]
    fn determine_payment_method_other_infers_bank_transfer() {
        assert_eq!(
            ProcedureOrchestrationService::determine_payment_method(
                Some("VIR"),
                Some("2024-01-01")
            ),
            PaymentMethod::BankTransfer
        );
    }

    // --- determine_procedure_status ---

    #[test]
    fn determine_procedure_status_no_payment_returns_created() {
        assert_eq!(
            ProcedureOrchestrationService::determine_procedure_status(
                Some(100_000),
                None,
                None,
                None,
                None
            ),
            ProcedureStatus::Created
        );
    }

    #[test]
    fn determine_procedure_status_paid_es_no_fund_returns_import_directly_paid() {
        assert_eq!(
            ProcedureOrchestrationService::determine_procedure_status(
                Some(100_000),
                Some(100_000),
                Some("2024-01-01"),
                Some("ES"),
                Some("fund-1")
            ),
            ProcedureStatus::ImportDirectlyPaid
        );
    }

    #[test]
    fn determine_procedure_status_paid_no_fund_returns_import_directly_paid() {
        assert_eq!(
            ProcedureOrchestrationService::determine_procedure_status(
                Some(100_000),
                Some(100_000),
                Some("2024-01-01"),
                Some("VIR"),
                None
            ),
            ProcedureStatus::ImportDirectlyPaid
        );
    }

    #[test]
    fn determine_procedure_status_paid_with_fund_returns_import_fund_paid() {
        assert_eq!(
            ProcedureOrchestrationService::determine_procedure_status(
                Some(100_000),
                Some(100_000),
                Some("2024-01-01"),
                Some("VIR"),
                Some("fund-1")
            ),
            ProcedureStatus::ImportFundPaid
        );
    }

    #[test]
    fn determine_procedure_status_date_present_zero_paid_returns_created() {
        assert_eq!(
            ProcedureOrchestrationService::determine_procedure_status(
                Some(100_000),
                Some(0),
                Some("2024-01-01"),
                Some("VIR"),
                Some("fund-1")
            ),
            ProcedureStatus::Created
        );
    }

    // --- is_fully_paid ---

    #[test]
    fn is_fully_paid_true_when_paid_equals_required() {
        assert!(ProcedureOrchestrationService::is_fully_paid(
            Some(100_000),
            Some(100_000)
        ));
    }

    #[test]
    fn is_fully_paid_true_when_paid_exceeds_required() {
        assert!(ProcedureOrchestrationService::is_fully_paid(
            Some(100_000),
            Some(110_000)
        ));
    }

    #[test]
    fn is_fully_paid_false_when_paid_less_than_required() {
        assert!(!ProcedureOrchestrationService::is_fully_paid(
            Some(100_000),
            Some(50_000)
        ));
    }

    #[test]
    fn is_fully_paid_false_when_amounts_are_none() {
        assert!(!ProcedureOrchestrationService::is_fully_paid(
            None,
            Some(100_000)
        ));
        assert!(!ProcedureOrchestrationService::is_fully_paid(
            Some(100_000),
            None
        ));
    }

    // --- validate_batch ---

    #[tokio::test]
    async fn validate_batch_empty_candidates_returns_empty() {
        let orchestrator = make_orchestrator_with_repos(
            make_patient_repo(None),
            Arc::new(mock_type_repo_stub()),
            Arc::new(mock_fund_repo_stub()),
        );
        let result = orchestrator.validate_batch(vec![]).await.unwrap();
        assert!(result.is_empty());
    }

    #[tokio::test]
    async fn validate_batch_missing_patient_id_returns_invalid() {
        let orchestrator = make_orchestrator_with_repos(
            make_patient_repo(None),
            Arc::new(mock_type_repo_stub()),
            Arc::new(mock_fund_repo_stub()),
        );
        let candidate = ProcedureCandidate {
            patient_id: "".to_string(),
            fund_id: None,
            procedure_type_id: "type-1".to_string(),
            procedure_date: "2024-01-01".to_string(),
            billed_amount: None,
            payment_method: None,
            confirmed_payment_date: None,
            paid_amount: None,
            awaited_amount: None,
        };
        let results = orchestrator.validate_batch(vec![candidate]).await.unwrap();
        assert_eq!(results.len(), 1);
        assert!(matches!(
            results[0].status,
            ProcedureValidationStatus::Invalid
        ));
    }

    #[tokio::test]
    async fn validate_batch_patient_not_found_returns_invalid() {
        let orchestrator = make_orchestrator_with_repos(
            make_patient_repo(None),
            Arc::new(mock_type_repo_stub()),
            Arc::new(mock_fund_repo_stub()),
        );
        let candidate = ProcedureCandidate {
            patient_id: "missing-patient".to_string(),
            fund_id: None,
            procedure_type_id: "type-1".to_string(),
            procedure_date: "2024-01-01".to_string(),
            billed_amount: None,
            payment_method: None,
            confirmed_payment_date: None,
            paid_amount: None,
            awaited_amount: None,
        };
        let results = orchestrator.validate_batch(vec![candidate]).await.unwrap();
        assert_eq!(results.len(), 1);
        assert!(matches!(
            results[0].status,
            ProcedureValidationStatus::Invalid
        ));
        assert_eq!(results[0].error, Some("Patient not found".to_string()));
    }

    #[tokio::test]
    async fn validate_batch_procedure_type_not_found_returns_invalid() {
        let orchestrator = make_orchestrator_with_repos(
            make_patient_repo(Some(make_valid_patient())),
            Arc::new(mock_type_repo_not_found()),
            Arc::new(mock_fund_repo_stub()),
        );
        let candidate = ProcedureCandidate {
            patient_id: "patient-id-1".to_string(),
            fund_id: None,
            procedure_type_id: "missing-type".to_string(),
            procedure_date: "2024-01-01".to_string(),
            billed_amount: None,
            payment_method: None,
            confirmed_payment_date: None,
            paid_amount: None,
            awaited_amount: None,
        };
        let results = orchestrator.validate_batch(vec![candidate]).await.unwrap();
        assert_eq!(results.len(), 1);
        assert!(matches!(
            results[0].status,
            ProcedureValidationStatus::Invalid
        ));
        assert_eq!(
            results[0].error,
            Some("Procedure type not found".to_string())
        );
    }

    #[tokio::test]
    async fn validate_batch_fund_not_found_returns_invalid() {
        let orchestrator = make_orchestrator_with_repos(
            make_patient_repo(Some(make_valid_patient())),
            Arc::new(mock_type_repo_with_type()),
            Arc::new(mock_fund_repo_not_found()),
        );
        let candidate = ProcedureCandidate {
            patient_id: "patient-id-1".to_string(),
            fund_id: Some("missing-fund".to_string()),
            procedure_type_id: "type-1".to_string(),
            procedure_date: "2024-01-01".to_string(),
            billed_amount: None,
            payment_method: None,
            confirmed_payment_date: None,
            paid_amount: None,
            awaited_amount: None,
        };
        let results = orchestrator.validate_batch(vec![candidate]).await.unwrap();
        assert_eq!(results.len(), 1);
        assert!(matches!(
            results[0].status,
            ProcedureValidationStatus::Invalid
        ));
        assert_eq!(results[0].error, Some("Fund not found".to_string()));
    }

    #[tokio::test]
    async fn validate_batch_valid_candidate_with_fund_returns_valid() {
        let orchestrator = make_orchestrator_with_repos(
            make_patient_repo(Some(make_valid_patient())),
            Arc::new(mock_type_repo_with_type()),
            Arc::new(mock_fund_repo_with_fund()),
        );
        let candidate = ProcedureCandidate {
            patient_id: "patient-id-1".to_string(),
            fund_id: Some("fund-1".to_string()),
            procedure_type_id: "type-1".to_string(),
            procedure_date: "2024-01-01".to_string(),
            billed_amount: Some(100_000),
            payment_method: None,
            confirmed_payment_date: None,
            paid_amount: None,
            awaited_amount: None,
        };
        let results = orchestrator.validate_batch(vec![candidate]).await.unwrap();
        assert_eq!(results.len(), 1);
        assert!(matches!(
            results[0].status,
            ProcedureValidationStatus::Valid
        ));
    }

    // --- update_procedure ---

    #[tokio::test]
    async fn update_procedure_non_overpaid_status_succeeds() {
        let proc = make_procedure_with_status(ProcedureStatus::Created);
        let orchestrator = make_orchestrator_with_procedure(proc.clone());
        let updated = orchestrator.update_procedure(proc).await.unwrap();
        assert_eq!(updated.payment_status, ProcedureStatus::Created);
    }

    #[tokio::test]
    async fn update_procedure_overpaid_no_refund_record_succeeds() {
        let proc = make_procedure_with_status(ProcedureStatus::Overpaid);
        let orchestrator = make_orchestrator_with_procedure(proc.clone());
        // MockProcedureRefundRepository returns None → no propagation path taken
        let updated = orchestrator.update_procedure(proc).await.unwrap();
        assert_eq!(updated.payment_status, ProcedureStatus::Overpaid);
    }

    // --- clear_procedure_type_tracking ---

    #[tokio::test]
    async fn clear_procedure_type_tracking_clears_matching_patient() {
        let patient = Patient::restore(
            "patient-id-1".to_string(),
            false,
            Some("Marie Dupont".to_string()),
            None,
            Some("type-to-clear".to_string()),
            None,
            Some(NaiveDate::from_ymd_opt(2024, 1, 1).unwrap()),
            None,
        );
        let updated_capture: Arc<Mutex<Option<Patient>>> = Arc::new(Mutex::new(None));
        let patient_repo = Arc::new(mock_patient_repo(Some(patient), updated_capture.clone()));
        let event_bus = Arc::new(EventBus::new());
        let context_service = Arc::new(ContextProcedureService::new(
            Arc::new(mock_proc_repo_passthrough()),
            event_bus,
        ));
        let orchestrator = ProcedureOrchestrationService::new(
            context_service,
            patient_repo,
            Arc::new(mock_type_repo_stub()),
            Arc::new(mock_fund_repo_stub()),
            Arc::new(MockProcedureRefundRepository),
        );

        orchestrator
            .clear_procedure_type_tracking("type-to-clear")
            .await
            .unwrap();

        let updated = updated_capture.lock().unwrap().clone().unwrap();
        assert_eq!(updated.latest_procedure_type, None);
        assert_eq!(updated.latest_date, None);
    }

    // --- create_procedure error paths ---

    #[tokio::test]
    async fn create_procedure_patient_not_found_returns_error() {
        let orchestrator = make_orchestrator_with_repos(
            make_patient_repo(None),
            Arc::new(mock_type_repo_stub()),
            Arc::new(mock_fund_repo_stub()),
        );
        let result = orchestrator
            .create_procedure(
                "p1".into(),
                None,
                "t1".into(),
                "2024-01-01".into(),
                None,
                None,
                None,
                None,
                None,
            )
            .await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Patient not found"));
    }

    #[tokio::test]
    async fn create_procedure_type_not_found_returns_error() {
        let orchestrator = make_orchestrator_with_repos(
            make_patient_repo(Some(make_valid_patient())),
            Arc::new(mock_type_repo_not_found()),
            Arc::new(mock_fund_repo_stub()),
        );
        let result = orchestrator
            .create_procedure(
                "patient-id-1".into(),
                None,
                "missing-type".into(),
                "2024-01-01".into(),
                None,
                None,
                None,
                None,
                None,
            )
            .await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Procedure type not found"));
    }

    #[tokio::test]
    async fn create_procedure_fund_not_found_returns_error() {
        let orchestrator = make_orchestrator_with_repos(
            make_patient_repo(Some(make_valid_patient())),
            Arc::new(mock_type_repo_with_type()),
            Arc::new(mock_fund_repo_not_found()),
        );
        let result = orchestrator
            .create_procedure(
                "patient-id-1".into(),
                Some("missing-fund".into()),
                "t1".into(),
                "2024-01-01".into(),
                None,
                None,
                None,
                None,
                None,
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    // --- delete_procedure not found ---

    fn mock_proc_repo_read_none() -> MockProcedureRepository {
        let mut mock = MockProcedureRepository::new();
        mock.expect_read_procedure().returning(|_| Ok(None));
        mock.expect_update_procedure().returning(Ok);
        mock.expect_read_all_procedures().returning(|| Ok(vec![]));
        mock.expect_create_batch().returning(Ok);
        mock
    }

    #[tokio::test]
    async fn delete_procedure_not_found_returns_error() {
        let event_bus = Arc::new(EventBus::new());
        let context_service = Arc::new(ContextProcedureService::new(
            Arc::new(mock_proc_repo_read_none()),
            event_bus,
        ));
        let orchestrator = ProcedureOrchestrationService::new(
            context_service,
            make_patient_repo(None),
            Arc::new(mock_type_repo_stub()),
            Arc::new(mock_fund_repo_stub()),
            Arc::new(MockProcedureRefundRepository),
        );
        let result = orchestrator.delete_procedure("non-existent").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    // --- validate_batch DB error paths ---

    fn mock_patient_repo_db_error() -> Arc<MockPatientRepository> {
        let mut mock = MockPatientRepository::new();
        mock.expect_read_patient()
            .returning(|_| Err(anyhow::anyhow!("DB error")));
        Arc::new(mock)
    }

    fn mock_type_repo_db_error() -> MockProcedureTypeRepository {
        let mut mock = MockProcedureTypeRepository::new();
        mock.expect_read_procedure_type()
            .returning(|_| Err(anyhow::anyhow!("DB error")));
        mock
    }

    fn mock_fund_repo_db_error() -> MockFundRepository {
        let mut mock = MockFundRepository::new();
        mock.expect_read_fund()
            .returning(|_| Err(anyhow::anyhow!("DB error")));
        mock
    }

    #[tokio::test]
    async fn validate_batch_patient_db_error_returns_invalid() {
        let orchestrator = make_orchestrator_with_repos(
            mock_patient_repo_db_error(),
            Arc::new(mock_type_repo_stub()),
            Arc::new(mock_fund_repo_stub()),
        );
        let candidate = ProcedureCandidate {
            patient_id: "p1".to_string(),
            fund_id: None,
            procedure_type_id: "t1".to_string(),
            procedure_date: "2024-01-01".to_string(),
            billed_amount: None,
            payment_method: None,
            confirmed_payment_date: None,
            paid_amount: None,
            awaited_amount: None,
        };
        let results = orchestrator.validate_batch(vec![candidate]).await.unwrap();
        assert_eq!(results.len(), 1);
        assert!(matches!(
            results[0].status,
            ProcedureValidationStatus::Invalid
        ));
        assert!(results[0]
            .error
            .as_ref()
            .unwrap()
            .contains("Database error checking patient"));
    }

    #[tokio::test]
    async fn validate_batch_type_db_error_returns_invalid() {
        let orchestrator = make_orchestrator_with_repos(
            make_patient_repo(Some(make_valid_patient())),
            Arc::new(mock_type_repo_db_error()),
            Arc::new(mock_fund_repo_stub()),
        );
        let candidate = ProcedureCandidate {
            patient_id: "patient-id-1".to_string(),
            fund_id: None,
            procedure_type_id: "t1".to_string(),
            procedure_date: "2024-01-01".to_string(),
            billed_amount: None,
            payment_method: None,
            confirmed_payment_date: None,
            paid_amount: None,
            awaited_amount: None,
        };
        let results = orchestrator.validate_batch(vec![candidate]).await.unwrap();
        assert_eq!(results.len(), 1);
        assert!(matches!(
            results[0].status,
            ProcedureValidationStatus::Invalid
        ));
        assert!(results[0]
            .error
            .as_ref()
            .unwrap()
            .contains("Database error checking procedure type"));
    }

    #[tokio::test]
    async fn validate_batch_fund_db_error_returns_invalid() {
        let orchestrator = make_orchestrator_with_repos(
            make_patient_repo(Some(make_valid_patient())),
            Arc::new(mock_type_repo_with_type()),
            Arc::new(mock_fund_repo_db_error()),
        );
        let candidate = ProcedureCandidate {
            patient_id: "patient-id-1".to_string(),
            fund_id: Some("fund-1".to_string()),
            procedure_type_id: "type-1".to_string(),
            procedure_date: "2024-01-01".to_string(),
            billed_amount: None,
            payment_method: None,
            confirmed_payment_date: None,
            paid_amount: None,
            awaited_amount: None,
        };
        let results = orchestrator.validate_batch(vec![candidate]).await.unwrap();
        assert_eq!(results.len(), 1);
        assert!(matches!(
            results[0].status,
            ProcedureValidationStatus::Invalid
        ));
        assert!(results[0]
            .error
            .as_ref()
            .unwrap()
            .contains("Database error checking fund"));
    }

    // --- create_batch skips invalid candidate (bad date format) ---

    #[tokio::test]
    async fn create_batch_skips_invalid_candidate_with_bad_date() {
        let patient = make_valid_patient();
        let updated_capture = Arc::new(Mutex::new(None));
        let patient_repo = Arc::new(mock_patient_repo(Some(patient), updated_capture));
        let event_bus = Arc::new(EventBus::new());
        let context_service = Arc::new(ContextProcedureService::new(
            Arc::new(mock_proc_repo_passthrough()),
            event_bus,
        ));
        let orchestrator = ProcedureOrchestrationService::new(
            context_service,
            patient_repo,
            Arc::new(mock_type_repo_stub()),
            Arc::new(mock_fund_repo_stub()),
            Arc::new(MockProcedureRefundRepository),
        );
        let candidate = ProcedureCandidate {
            patient_id: "p1".to_string(),
            fund_id: None,
            procedure_type_id: "t1".to_string(),
            procedure_date: "INVALID-DATE".to_string(),
            billed_amount: None,
            payment_method: None,
            confirmed_payment_date: None,
            paid_amount: None,
            awaited_amount: None,
        };
        let result = orchestrator.create_batch(vec![candidate]).await.unwrap();
        assert!(result.is_empty(), "Invalid candidate should be skipped");
    }

    // --- REF-170: update_procedure propagation paths ---

    fn make_refund_record(
        source_id: &str,
        refund_proc_id: &str,
    ) -> crate::context::procedure::ProcedureRefund {
        crate::context::procedure::ProcedureRefund::restore(
            "refund-rec-1".to_string(),
            source_id.to_string(),
            refund_proc_id.to_string(),
            "group-1".to_string(),
            "transfer-1".to_string(),
            NaiveDate::from_ymd_opt(2024, 1, 1).unwrap(),
            None,
            ProcedureStatus::FundPaid,
        )
    }

    struct ProcedureRefundRepoReturningRecord {
        record: crate::context::procedure::ProcedureRefund,
    }

    #[async_trait::async_trait]
    impl crate::context::procedure::ProcedureRefundRepository for ProcedureRefundRepoReturningRecord {
        async fn create_procedure_refund(
            &self,
            _: &crate::context::procedure::ProcedureRefund,
        ) -> anyhow::Result<()> {
            Ok(())
        }
        async fn find_by_source_procedure_id(
            &self,
            _: &str,
        ) -> anyhow::Result<Option<crate::context::procedure::ProcedureRefund>> {
            Ok(Some(self.record.clone()))
        }
        async fn find_by_refund_procedure_id(
            &self,
            _: &str,
        ) -> anyhow::Result<Option<crate::context::procedure::ProcedureRefund>> {
            Ok(None)
        }
        async fn delete_procedure_refund(&self, _: &str) -> anyhow::Result<()> {
            Ok(())
        }
        async fn is_refund_fund_payment_group(&self, _: &str) -> anyhow::Result<bool> {
            Ok(false)
        }
    }

    #[tokio::test]
    async fn update_procedure_overpaid_refund_record_found_but_proc_not_in_db() {
        let source_proc = make_procedure_with_status(ProcedureStatus::Overpaid);
        let refund_record = make_refund_record(&source_proc.id, "refund-proc-999");
        let event_bus = Arc::new(EventBus::new());
        let context_service = Arc::new(ContextProcedureService::new(
            Arc::new(mock_proc_repo_read_none()),
            event_bus,
        ));
        let orchestrator = ProcedureOrchestrationService::new(
            context_service,
            make_patient_repo(None),
            Arc::new(mock_type_repo_stub()),
            Arc::new(mock_fund_repo_stub()),
            Arc::new(ProcedureRefundRepoReturningRecord {
                record: refund_record,
            }),
        );
        let result = orchestrator.update_procedure(source_proc).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn update_procedure_overpaid_refund_proc_same_type_no_propagation() {
        let source_proc = make_procedure_with_status(ProcedureStatus::Overpaid);
        let refund_proc = Procedure::with_id(
            "refund-proc-1".to_string(),
            "patient-id-1".to_string(),
            None,
            source_proc.procedure_type_id.clone(),
            "2024-06-15".to_string(),
            Some(-50000),
            PaymentMethod::None,
            None,
            None,
            ProcedureStatus::OverpaymentRefund,
        )
        .unwrap();
        let refund_record = make_refund_record(&source_proc.id, "refund-proc-1");
        let event_bus = Arc::new(EventBus::new());
        let context_service = Arc::new(ContextProcedureService::new(
            Arc::new(mock_proc_repo_with_procedure(refund_proc)),
            event_bus,
        ));
        let orchestrator = ProcedureOrchestrationService::new(
            context_service,
            make_patient_repo(None),
            Arc::new(mock_type_repo_stub()),
            Arc::new(mock_fund_repo_stub()),
            Arc::new(ProcedureRefundRepoReturningRecord {
                record: refund_record,
            }),
        );
        let result = orchestrator.update_procedure(source_proc).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn update_procedure_overpaid_refund_proc_different_type_propagates() {
        let source_proc = make_procedure_with_status(ProcedureStatus::Overpaid);
        let refund_proc = Procedure::with_id(
            "refund-proc-1".to_string(),
            "patient-id-1".to_string(),
            None,
            "type-DIFFERENT".to_string(),
            "2024-06-15".to_string(),
            Some(-50000),
            PaymentMethod::None,
            None,
            None,
            ProcedureStatus::OverpaymentRefund,
        )
        .unwrap();
        let refund_record = make_refund_record(&source_proc.id, "refund-proc-1");
        let event_bus = Arc::new(EventBus::new());
        let context_service = Arc::new(ContextProcedureService::new(
            Arc::new(mock_proc_repo_with_procedure(refund_proc)),
            event_bus,
        ));
        let orchestrator = ProcedureOrchestrationService::new(
            context_service,
            make_patient_repo(None),
            Arc::new(mock_type_repo_stub()),
            Arc::new(mock_fund_repo_stub()),
            Arc::new(ProcedureRefundRepoReturningRecord {
                record: refund_record,
            }),
        );
        let result = orchestrator.update_procedure(source_proc).await;
        assert!(result.is_ok());
    }

    // --- clear_fund_tracking ---

    #[tokio::test]
    async fn clear_fund_tracking_clears_matching_patient() {
        let patient = Patient::restore(
            "patient-id-1".to_string(),
            false,
            Some("Marie Dupont".to_string()),
            None,
            Some("type-1".to_string()),
            Some("fund-to-clear".to_string()),
            Some(NaiveDate::from_ymd_opt(2024, 1, 1).unwrap()),
            None,
        );
        let updated_capture: Arc<Mutex<Option<Patient>>> = Arc::new(Mutex::new(None));
        let patient_repo = Arc::new(mock_patient_repo(Some(patient), updated_capture.clone()));
        let event_bus = Arc::new(EventBus::new());
        let context_service = Arc::new(ContextProcedureService::new(
            Arc::new(mock_proc_repo_passthrough()),
            event_bus,
        ));
        let orchestrator = ProcedureOrchestrationService::new(
            context_service,
            patient_repo,
            Arc::new(mock_type_repo_stub()),
            Arc::new(mock_fund_repo_stub()),
            Arc::new(MockProcedureRefundRepository),
        );

        orchestrator
            .clear_fund_tracking("fund-to-clear")
            .await
            .unwrap();

        let updated = updated_capture.lock().unwrap().clone().unwrap();
        assert_eq!(updated.latest_fund, None);
    }
}

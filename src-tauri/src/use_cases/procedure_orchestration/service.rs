use std::sync::Arc;

use crate::context::procedure::{
    PaymentMethod, Procedure, ProcedureCandidate, ProcedureService as ContextProcedureService,
    ProcedureStatus, ProcedureTypeRepository,
};
use crate::FundRepository;
use crate::PatientRepository;

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
}

impl ProcedureOrchestrationService {
    /// Create a new procedure orchestration service
    pub fn new(
        context_procedure_service: Arc<ContextProcedureService>,
        patient_repository: Arc<dyn PatientRepository>,
        procedure_type_repository: Arc<dyn ProcedureTypeRepository>,
        fund_repository: Arc<dyn FundRepository>,
    ) -> Self {
        ProcedureOrchestrationService {
            context_procedure_service,
            patient_repository,
            procedure_type_repository,
            fund_repository,
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
    /// from (procedure_amount - actual_payment_amount) to ensure consistency.
    #[allow(clippy::too_many_arguments)]
    pub async fn create_procedure(
        &self,
        patient_id: String,
        fund_id: Option<String>,
        procedure_type_id: String,
        procedure_date: String,
        procedure_amount: Option<i64>,
        payment_method: Option<String>,
        confirmed_payment_date: Option<String>,
        actual_payment_amount: Option<i64>,
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
            procedure_amount,
            actual_payment_amount,
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
                procedure_amount,
                mapped_payment_method,
                confirmed_payment_date,
                actual_payment_amount,
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
            updated_patient.latest_procedure_amount = procedure_amount;
            // Store fund_id (UUID) for direct FK lookup
            if let Some(fid) = &fund_id {
                updated_patient.latest_fund = Some(fid.clone());
            }

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

    /// Update a procedure (delegates to context service)
    ///
    /// The context service automatically recalculates awaited_amount from the procedure amounts.
    pub async fn update_procedure(&self, procedure: Procedure) -> anyhow::Result<Procedure> {
        self.context_procedure_service
            .update_procedure(procedure)
            .await
    }

    /// Delete a healthcare procedure with patient tracking cleanup
    ///
    /// Orchestration responsibility: Clears patient tracking fields if this was the "latest" procedure
    pub async fn delete_procedure(&self, id: &str) -> anyhow::Result<()> {
        tracing::debug!(procedure_id = %id, "Deleting healthcare procedure");

        // Delegate to context service for state change (which publishes event)
        self.context_procedure_service.delete_procedure(id).await?;

        tracing::debug!(procedure_id = %id, "Procedure deleted successfully");

        // Clear patient tracking if this procedure was the latest (cross-context side effect)
        let all_procedures = self.context_procedure_service.read_all_procedures().await?;
        let all_patients = self.patient_repository.read_all_patients().await?;

        // For each patient with tracking fields, check if the deleted procedure was their latest
        for patient in all_patients {
            let patient_id = &patient.id;
            {
                let patient_procedures: Vec<_> = all_procedures
                    .iter()
                    .filter(|p| p.patient_id == *patient_id)
                    .collect();

                if patient_procedures.is_empty() && patient.latest_date.is_some() {
                    // No more procedures, clear all tracking
                    let mut updated_patient = patient.clone();
                    updated_patient.latest_date = None;
                    updated_patient.latest_procedure_type = None;
                    updated_patient.latest_fund = None;
                    updated_patient.latest_procedure_amount = None;
                    self.patient_repository
                        .update_patient(updated_patient)
                        .await?;
                }
            }
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
    /// awaited_amount is recalculated from procedure_amount and actual_payment_amount
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
                candidate.procedure_amount,
                candidate.actual_payment_amount,
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
                candidate.procedure_amount,
                payment_method,
                candidate.confirmed_payment_date,
                candidate.actual_payment_amount,
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
                    updated_patient.latest_procedure_amount = latest.procedure_amount;
                    if let Some(fid) = &latest.fund_id {
                        updated_patient.latest_fund = Some(fid.clone());
                    }
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

    /// Determine procedure status based on payment completeness and metadata.
    ///
    /// Import-specific statuses (non-blocking re-import):
    /// - ImportDirectlyPayed: payment confirmed (date + amount) AND method is ES or CH
    /// - ImportFundPayed: payment confirmed AND method is not ES/CH AND fund is present
    /// - ImportDirectlyPayed: payment confirmed AND method is not ES/CH AND no fund
    fn determine_procedure_status(
        procedure_amount: Option<i64>,
        actual_payment_amount: Option<i64>,
        confirmed_payment_date: Option<&str>,
        payment_method: Option<&str>,
        fund_id: Option<&str>,
    ) -> ProcedureStatus {
        let is_paid = (confirmed_payment_date.is_some()
            && !confirmed_payment_date.unwrap_or("").is_empty()
            && actual_payment_amount.unwrap_or(0) > 0)
            || Self::is_fully_paid(procedure_amount, actual_payment_amount);

        if !is_paid {
            // NEVER return None here, Created is the minimum state for a valid procedure
            return ProcedureStatus::Created;
        }

        let is_direct_method = matches!(payment_method, Some("ES") | Some("CH"));
        if is_direct_method || fund_id.is_none() {
            ProcedureStatus::ImportDirectlyPayed
        } else {
            ProcedureStatus::ImportFundPayed
        }
    }

    /// Check if a procedure is fully paid (amount >= required)
    fn is_fully_paid(required: Option<i64>, paid: Option<i64>) -> bool {
        match (required, paid) {
            (Some(req), Some(p)) => p >= req, // Removed req > 0.0 check
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
    ///   - Otherwise → BankTransfer (inferred from presence of date)
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
    use crate::context::fund::AffiliatedFund;
    use crate::context::patient::{Patient, PatientRepository};
    use crate::context::procedure::{
        Procedure, ProcedureRepository, ProcedureService as ContextProcedureService,
        ProcedureStatus, ProcedureType, ProcedureTypeRepository,
    };
    use crate::core::event_bus::EventBus;
    use crate::FundRepository;
    use chrono::NaiveDate;
    use std::sync::{Arc, Mutex};

    struct MockProcedureRepository;

    #[async_trait::async_trait]
    impl ProcedureRepository for MockProcedureRepository {
        #[allow(clippy::too_many_arguments)]
        async fn create_procedure(
            &self,
            _patient_id: String,
            _fund_id: Option<String>,
            _procedure_type_id: String,
            _procedure_date: String,
            _procedure_amount: Option<i64>,
            _payment_method: PaymentMethod,
            _confirmed_payment_date: Option<String>,
            _actual_payment_amount: Option<i64>,
            _payment_status: ProcedureStatus,
        ) -> anyhow::Result<Procedure> {
            unimplemented!()
        }
        async fn read_all_procedures(&self) -> anyhow::Result<Vec<Procedure>> {
            Ok(vec![])
        }
        async fn read_procedure(&self, _id: &str) -> anyhow::Result<Option<Procedure>> {
            unimplemented!()
        }
        async fn read_procedures_by_ids(&self, _ids: &[String]) -> anyhow::Result<Vec<Procedure>> {
            unimplemented!()
        }
        async fn update_procedure(&self, p: Procedure) -> anyhow::Result<Procedure> {
            Ok(p)
        }
        async fn delete_procedure(&self, _id: &str) -> anyhow::Result<()> {
            unimplemented!()
        }
        async fn find_procedures_by_ssn_and_date_range(
            &self,
            _ssn: &str,
            _start_date: &str,
            _end_date: &str,
        ) -> anyhow::Result<Vec<Procedure>> {
            unimplemented!()
        }
        async fn find_procedures_by_ssns_and_date_range(
            &self,
            _ssns: &[String],
            _start_date: &str,
            _end_date: &str,
        ) -> anyhow::Result<Vec<Procedure>> {
            unimplemented!()
        }
        async fn find_procedures_by_ssns_and_date_range_with_ssn(
            &self,
            _ssns: &[String],
            _start_date: &str,
            _end_date: &str,
        ) -> anyhow::Result<Vec<(String, Procedure)>> {
            unimplemented!()
        }
        async fn find_procedure_exact(
            &self,
            _patient_id: &str,
            _fund_id: Option<&str>,
            _procedure_date: &str,
            _procedure_amount: i64,
        ) -> anyhow::Result<Option<Procedure>> {
            unimplemented!()
        }
        async fn create_batch(&self, procedures: Vec<Procedure>) -> anyhow::Result<Vec<Procedure>> {
            Ok(procedures)
        }
        async fn update_batch(
            &self,
            _procedures: Vec<Procedure>,
        ) -> anyhow::Result<Vec<Procedure>> {
            unimplemented!()
        }
        async fn find_unpaid_by_fund(&self, _fund_id: &str) -> anyhow::Result<Vec<Procedure>> {
            unimplemented!()
        }
        async fn has_blocking_procedures_in_month(&self, _month: &str) -> anyhow::Result<bool> {
            unimplemented!()
        }
        async fn delete_procedures_by_month(&self, _month: &str) -> anyhow::Result<u64> {
            unimplemented!()
        }
        async fn find_unreconciled_by_date_range(
            &self,
            _start_date: &str,
            _end_date: &str,
        ) -> anyhow::Result<Vec<crate::context::procedure::UnreconciledProcedureRow>> {
            unimplemented!()
        }
    }

    struct MockPatientRepository {
        patient: Mutex<Option<Patient>>,
        updated_patient: Mutex<Option<Patient>>,
    }

    #[async_trait::async_trait]
    impl PatientRepository for MockPatientRepository {
        async fn create_patient(&self, _p: Patient) -> anyhow::Result<Patient> {
            unimplemented!()
        }
        async fn read_all_patients(&self) -> anyhow::Result<Vec<Patient>> {
            unimplemented!()
        }
        async fn read_patient(&self, _id: &str) -> anyhow::Result<Option<Patient>> {
            Ok(self.patient.lock().unwrap().clone())
        }
        async fn update_patient(&self, patient: Patient) -> anyhow::Result<Patient> {
            *self.updated_patient.lock().unwrap() = Some(patient.clone());
            Ok(patient)
        }
        async fn find_patient_by_ssn(&self, _ssn: &str) -> anyhow::Result<Option<Patient>> {
            unimplemented!()
        }
        async fn create_batch(&self, _patients: Vec<Patient>) -> anyhow::Result<Vec<Patient>> {
            unimplemented!()
        }
        async fn delete_patient(&self, _id: &str) -> anyhow::Result<()> {
            unimplemented!()
        }
    }

    struct MockProcedureTypeRepository;

    #[async_trait::async_trait]
    impl ProcedureTypeRepository for MockProcedureTypeRepository {
        async fn create_procedure_type(
            &self,
            _name: String,
            _default_amount: i64,
            _category: Option<String>,
        ) -> anyhow::Result<ProcedureType> {
            unimplemented!()
        }
        async fn read_all_procedure_types(&self) -> anyhow::Result<Vec<ProcedureType>> {
            Ok(vec![])
        }
        async fn read_procedure_type(&self, _id: &str) -> anyhow::Result<Option<ProcedureType>> {
            unimplemented!()
        }
        async fn update_procedure_type(&self, _pt: ProcedureType) -> anyhow::Result<ProcedureType> {
            unimplemented!()
        }
        async fn delete_procedure_type(&self, _id: &str) -> anyhow::Result<()> {
            unimplemented!()
        }
        async fn find_by_name(&self, _name: &str) -> anyhow::Result<Option<ProcedureType>> {
            unimplemented!()
        }
    }

    struct MockFundRepository;

    #[async_trait::async_trait]
    impl FundRepository for MockFundRepository {
        async fn create_fund(
            &self,
            _fund_identifier: &str,
            _fund_name: &str,
        ) -> anyhow::Result<AffiliatedFund> {
            unimplemented!()
        }
        async fn read_fund(&self, _id: &str) -> anyhow::Result<Option<AffiliatedFund>> {
            unimplemented!()
        }
        async fn read_all_funds(&self) -> anyhow::Result<Vec<AffiliatedFund>> {
            Ok(vec![])
        }
        async fn update_fund(&self, _fund: AffiliatedFund) -> anyhow::Result<AffiliatedFund> {
            unimplemented!()
        }
        async fn find_fund_by_identifier(
            &self,
            _identifier: &str,
        ) -> anyhow::Result<Option<AffiliatedFund>> {
            unimplemented!()
        }
        async fn create_batch(
            &self,
            _funds: Vec<AffiliatedFund>,
        ) -> anyhow::Result<Vec<AffiliatedFund>> {
            unimplemented!()
        }
        async fn delete_fund(&self, _id: &str) -> anyhow::Result<()> {
            unimplemented!()
        }
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

        let patient_repo = Arc::new(MockPatientRepository {
            patient: Mutex::new(Some(patient)),
            updated_patient: Mutex::new(None),
        });

        let event_bus = Arc::new(EventBus::new());
        let context_service = Arc::new(ContextProcedureService::new(
            Arc::new(MockProcedureRepository),
            event_bus,
        ));

        let orchestrator = ProcedureOrchestrationService::new(
            context_service,
            patient_repo.clone(),
            Arc::new(MockProcedureTypeRepository),
            Arc::new(MockFundRepository),
        );

        let candidate = ProcedureCandidate {
            patient_id: "patient-id-1".to_string(),
            fund_id: Some("fund-id-1".to_string()),
            procedure_type_id: "type-id-1".to_string(),
            procedure_date: "2024-06-15".to_string(),
            procedure_amount: Some(100000),
            payment_method: None,
            confirmed_payment_date: None,
            actual_payment_amount: None,
            awaited_amount: None,
        };

        let result = orchestrator.create_batch(vec![candidate]).await;
        assert!(result.is_ok());

        let updated = patient_repo.updated_patient.lock().unwrap().clone();
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

        let patient_repo = Arc::new(MockPatientRepository {
            patient: Mutex::new(Some(patient)),
            updated_patient: Mutex::new(None),
        });

        let event_bus = Arc::new(EventBus::new());
        let context_service = Arc::new(ContextProcedureService::new(
            Arc::new(MockProcedureRepository),
            event_bus,
        ));

        let orchestrator = ProcedureOrchestrationService::new(
            context_service,
            patient_repo.clone(),
            Arc::new(MockProcedureTypeRepository),
            Arc::new(MockFundRepository),
        );

        // Older procedure date (2024-06-15 < 2024-12-01)
        let candidate = ProcedureCandidate {
            patient_id: "patient-id-1".to_string(),
            fund_id: Some("fund-id-1".to_string()),
            procedure_type_id: "type-id-1".to_string(),
            procedure_date: "2024-06-15".to_string(),
            procedure_amount: Some(100000),
            payment_method: None,
            confirmed_payment_date: None,
            actual_payment_amount: None,
            awaited_amount: None,
        };

        let result = orchestrator.create_batch(vec![candidate]).await;
        assert!(result.is_ok());

        // Patient should NOT have been updated (existing date is newer)
        let updated = patient_repo.updated_patient.lock().unwrap().clone();
        assert!(
            updated.is_none(),
            "Patient should NOT be updated when batch procedure is older"
        );
    }
}

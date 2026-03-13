use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use crate::context::fund::FundService;
use crate::context::patient::{PatientCandidate, PatientService};
use crate::context::procedure::{ProcedureCandidate, ProcedureService};
use crate::use_cases::excel_import::api::{ImportExecutionResult, ParseExcelResponse};
use crate::use_cases::procedure_orchestration::ProcedureOrchestrationService;

/// Orchestrates the full Excel import workflow on the backend.
///
/// Replaces the frontend orchestration logic: resolves temp_ids, finds or creates
/// patients/funds, then batch-creates procedures (which updates patient latest_xx fields).
pub struct ExcelImportOrchestrator {
    patient_service: Arc<PatientService>,
    fund_service: Arc<FundService>,
    procedure_service: Arc<ProcedureService>,
    procedure_orchestration: Arc<ProcedureOrchestrationService>,
}

impl ExcelImportOrchestrator {
    pub fn new(
        patient_service: Arc<PatientService>,
        fund_service: Arc<FundService>,
        procedure_service: Arc<ProcedureService>,
        procedure_orchestration: Arc<ProcedureOrchestrationService>,
    ) -> Self {
        Self {
            patient_service,
            fund_service,
            procedure_service,
            procedure_orchestration,
        }
    }

    /// Execute the full import: resolve patients, funds, then create procedures.
    ///
    /// `procedure_type_mapping` maps `procedure_type_tmp_id → procedure_type_id`.
    /// `selected_months` is the list of YYYY-MM months the user chose to import.
    /// For each selected month: if blocking procedures exist, the month is skipped;
    /// otherwise, existing procedures for that month are deleted before re-import.
    pub async fn execute_import(
        &self,
        parsed_data: ParseExcelResponse,
        procedure_type_mapping: HashMap<String, String>,
        selected_months: Vec<String>,
    ) -> anyhow::Result<ImportExecutionResult> {
        tracing::info!(
            patients = parsed_data.patients.len(),
            funds = parsed_data.funds.len(),
            procedures = parsed_data.procedures.len(),
            "Starting Excel import execution"
        );

        // ── Step 1: Patients ─────────────────────────────────────────────────
        let mut patients_map: HashMap<String, String> = HashMap::new();
        let mut patients_reused = 0u32;
        let mut new_patient_candidates: Vec<PatientCandidate> = Vec::new();

        for excel_patient in &parsed_data.patients {
            if !excel_patient.ssn.is_empty() {
                if let Some(existing) = self
                    .patient_service
                    .find_patient_by_ssn(&excel_patient.ssn)
                    .await?
                {
                    patients_reused += 1;
                    patients_map.insert(excel_patient.temp_id.clone(), existing.id);
                    continue;
                }
            }
            // New patient — add to batch
            new_patient_candidates.push(PatientCandidate {
                temp_id: excel_patient.temp_id.clone(),
                name: if excel_patient.name.is_empty() {
                    None
                } else {
                    Some(excel_patient.name.clone())
                },
                ssn: if excel_patient.ssn.is_empty() {
                    None
                } else {
                    Some(excel_patient.ssn.clone())
                },
            });
        }

        let patients_created = new_patient_candidates.len() as u32;
        if !new_patient_candidates.is_empty() {
            let created = self
                .patient_service
                .create_batch(new_patient_candidates)
                .await?;
            for patient in &created {
                if let Some(temp_id) = &patient.temp_id {
                    patients_map.insert(temp_id.clone(), patient.id.clone());
                }
            }
        }

        tracing::info!(
            created = patients_created,
            reused = patients_reused,
            "Patients resolved"
        );

        // ── Step 2: Funds ─────────────────────────────────────────────────────
        let mut funds_map: HashMap<String, String> = HashMap::new();
        let mut funds_reused = 0u32;
        let mut new_fund_candidates: Vec<crate::context::fund::FundCandidate> = Vec::new();

        for excel_fund in &parsed_data.funds {
            if let Some(existing) = self
                .fund_service
                .find_fund_by_identifier(&excel_fund.fund_identifier)
                .await?
            {
                funds_reused += 1;
                funds_map.insert(excel_fund.temp_id.clone(), existing.id);
            } else {
                new_fund_candidates.push(crate::context::fund::FundCandidate {
                    temp_id: excel_fund.temp_id.clone(),
                    fund_identifier: excel_fund.fund_identifier.clone(),
                    fund_name: excel_fund.fund_name.clone(),
                });
            }
        }

        let funds_created = new_fund_candidates.len() as u32;
        if !new_fund_candidates.is_empty() {
            let created = self.fund_service.create_batch(new_fund_candidates).await?;
            for fund in &created {
                if let Some(temp_id) = &fund.temp_id {
                    funds_map.insert(temp_id.clone(), fund.id.clone());
                }
            }
        }

        tracing::info!(
            created = funds_created,
            reused = funds_reused,
            "Funds resolved"
        );

        // ── Step 3: Month validation & cleanup ───────────────────────────────
        let mut blocked_months: Vec<String> = Vec::new();
        let mut allowed_months: HashSet<String> = HashSet::new();
        let mut procedures_deleted = 0u32;

        for month in &selected_months {
            if self
                .procedure_service
                .has_blocking_procedures_in_month(month)
                .await?
            {
                tracing::warn!(month = %month, "Month blocked: contains reconciliated/fund-payed procedures");
                blocked_months.push(month.clone());
            } else {
                let deleted = self
                    .procedure_service
                    .delete_procedures_by_month(month)
                    .await?;
                procedures_deleted += deleted as u32;
                tracing::info!(month = %month, deleted = deleted, "Cleared procedures for month before re-import");
                allowed_months.insert(month.clone());
            }
        }

        // ── Step 4: Procedures ────────────────────────────────────────────────
        let mut candidates: Vec<ProcedureCandidate> = Vec::new();
        let mut procedures_skipped = 0u32;

        for excel_proc in &parsed_data.procedures {
            // Skip procedures from months not selected or blocked
            let proc_month = excel_proc.procedure_date.get(..7).unwrap_or("");
            if !allowed_months.contains(proc_month) {
                procedures_skipped += 1;
                continue;
            }

            let Some(patient_id) = patients_map.get(&excel_proc.patient_temp_id).cloned() else {
                tracing::debug!(
                    patient_temp_id = %excel_proc.patient_temp_id,
                    "Skipping procedure: patient temp_id not resolved"
                );
                procedures_skipped += 1;
                continue;
            };

            let Some(procedure_type_id) = procedure_type_mapping
                .get(&excel_proc.procedure_type_tmp_id)
                .cloned()
            else {
                tracing::debug!(
                    type_tmp_id = %excel_proc.procedure_type_tmp_id,
                    "Skipping procedure: procedure type not mapped"
                );
                procedures_skipped += 1;
                continue;
            };

            let fund_id = excel_proc
                .fund_temp_id
                .as_ref()
                .and_then(|temp_id| funds_map.get(temp_id).cloned());

            candidates.push(ProcedureCandidate {
                patient_id,
                fund_id,
                procedure_type_id,
                procedure_date: excel_proc.procedure_date.clone(),
                procedure_amount: Some(excel_proc.amount),
                payment_method: excel_proc.payment_method.clone(),
                confirmed_payment_date: excel_proc.confirmed_payment_date.clone(),
                actual_payment_amount: excel_proc.actual_payment_amount,
                awaited_amount: excel_proc.awaited_amount,
            });
        }

        let procedures_created = if candidates.is_empty() {
            0u32
        } else {
            let created = self
                .procedure_orchestration
                .create_batch(candidates)
                .await?;
            created.len() as u32
        };

        tracing::info!(
            created = procedures_created,
            skipped = procedures_skipped,
            "Procedures created"
        );

        Ok(ImportExecutionResult {
            patients_created,
            patients_reused,
            funds_created,
            funds_reused,
            procedures_created,
            procedures_skipped,
            procedures_deleted,
            blocked_months,
        })
    }
}

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use chrono::{Datelike, NaiveDate};

use crate::context::fund::FundService;
use crate::context::patient::{PatientCandidate, PatientService};
use crate::context::procedure::{ProcedureCandidate, ProcedureService};
use crate::shared::logger::BACKEND;
use crate::use_cases::excel_import::api::{ImportExecutionResult, ParseExcelResponse};
use crate::use_cases::excel_import::error::ExcelImportError;
use crate::use_cases::excel_import::excel_codec::{sheet_nominal_month, SkipReason, SkippedRow};
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
    /// `selected_sheets` is the list of canonical sheet names (`"Jan"`, `"Fév"`, …)
    /// the user chose to import (EXI-270 — sheet-based selection).
    /// For each selected sheet: derive its nominal month, check blocking; if blocking
    /// procedures exist for that month the sheet is skipped, otherwise existing
    /// procedures for that month are deleted before re-import.
    /// The year of each (year, month) DB key is derived once from the first valid
    /// `procedure_date` in the parsed payload. If no valid date exists, block + delete
    /// are skipped entirely.
    pub async fn execute_import(
        &self,
        parsed_data: ParseExcelResponse,
        procedure_type_mapping: HashMap<String, String>,
        selected_sheets: Vec<String>,
    ) -> Result<ImportExecutionResult, ExcelImportError> {
        tracing::debug!(
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
            // EXI-080: prefer SSN-based lookup when an SSN is present;
            // otherwise fall back to a case-insensitive name lookup so a
            // repeated import does not stack a fresh blank-SSN row.
            let existing = if !excel_patient.ssn.is_empty() {
                self.patient_service
                    .find_patient_by_ssn(&excel_patient.ssn)
                    .await
                    .map_err(|e| {
                        // reviewer-backend FP: err = ?e carries no PII — PatientError
                        // variants hold only IDs, never SSN/name (see PR #59).
                        tracing::error!(target: BACKEND, err = ?e, "Failed to look up patient by SSN");
                        ExcelImportError::ImportFailed
                    })?
            } else if !excel_patient.name.is_empty() {
                self.patient_service
                    .find_patient_by_name(&excel_patient.name)
                    .await
                    .map_err(|e| {
                        tracing::error!(target: BACKEND, err = ?e, "Failed to look up patient by name");
                        ExcelImportError::ImportFailed
                    })?
            } else {
                None
            };

            if let Some(existing) = existing {
                patients_reused += 1;
                patients_map.insert(excel_patient.temp_id.clone(), existing.id);
                continue;
            }

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
            let (_, created_map) = self
                .patient_service
                .create_batch(new_patient_candidates)
                .await
                .map_err(|e| {
                    tracing::error!(target: BACKEND, err = ?e, "Failed to create patient batch");
                    ExcelImportError::ImportFailed
                })?;
            patients_map.extend(created_map);
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
                .await
                .map_err(|e| {
                    tracing::error!(target: BACKEND, err = ?e, "Failed to look up fund by identifier");
                    ExcelImportError::ImportFailed
                })?
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
            let (_, created_map) = self
                .fund_service
                .create_batch(new_fund_candidates)
                .await
                .map_err(|e| {
                    tracing::error!(target: BACKEND, err = ?e, "Failed to create fund batch");
                    ExcelImportError::ImportFailed
                })?;
            funds_map.extend(created_map);
        }

        tracing::info!(
            created = funds_created,
            reused = funds_reused,
            "Funds resolved"
        );

        // ── Step 3: Sheet validation & cleanup ───────────────────────────────
        //
        // Block/delete is per-month at the DB level (procedure_service keys on
        // "YYYY-MM"), but selection is per-sheet (EXI-270). Derive the workbook
        // year once from the first valid procedure_date; if none exists, skip
        // block/delete entirely — every row will fail EXI-280 in step 4 and
        // surface in skipped_procedures, so DB state is left untouched.
        let workbook_year: Option<i32> = parsed_data
            .procedures
            .iter()
            .find_map(|p| NaiveDate::parse_from_str(&p.procedure_date, "%Y-%m-%d").ok())
            .map(|d| d.year());

        let mut blocked_months: Vec<String> = Vec::new();
        let mut allowed_sheets: HashSet<String> = HashSet::new();
        let mut procedures_deleted = 0u32;

        if let Some(year) = workbook_year {
            for sheet in &selected_sheets {
                let Some(month) = sheet_nominal_month(sheet) else {
                    // Unknown sheet name — still mark allowed so rows reach step 4
                    // and EXI-281 surfaces them in the skip report. Block/delete
                    // not possible without a canonical month.
                    tracing::warn!(sheet = %sheet, "Unknown sheet name in selection — no block/delete possible");
                    allowed_sheets.insert(sheet.clone());
                    continue;
                };
                let month_key = format!("{:04}-{:02}", year, month);
                if self
                    .procedure_service
                    .has_blocking_procedures_in_month(&month_key)
                    .await
                    .map_err(|e| {
                        tracing::error!(target: BACKEND, err = ?e, month = %month_key, "Failed to check blocking procedures for month");
                        ExcelImportError::ImportFailed
                    })?
                {
                    tracing::warn!(month = %month_key, sheet = %sheet, "Month blocked: contains reconciliated/fund-payed procedures");
                    blocked_months.push(month_key);
                } else {
                    let deleted = self
                        .procedure_service
                        .delete_procedures_by_month(&month_key)
                        .await
                        .map_err(|e| {
                            tracing::error!(target: BACKEND, err = ?e, month = %month_key, "Failed to delete procedures for month");
                            ExcelImportError::ImportFailed
                        })?;
                    procedures_deleted += deleted as u32;
                    tracing::debug!(month = %month_key, sheet = %sheet, deleted = deleted, "Cleared procedures for month before re-import");
                    allowed_sheets.insert(sheet.clone());
                }
            }
        } else {
            // No valid procedure_date in the workbook — cannot derive year for
            // DB month keys. Skip block/delete entirely but still mark every
            // selected sheet as allowed so each row reaches step 4 and surfaces
            // in skipped_procedures via EXI-280 (every row will fail the date
            // gate by definition).
            allowed_sheets.extend(selected_sheets.iter().cloned());
        }

        // ── Step 4: Procedures ────────────────────────────────────────────────
        //
        // Gate ordering (EXI-180):
        //   (1) sheet filter           — EXI-270 (allowed_sheets membership)
        //   (2) patient resolution     — EXI-080 / EXI-110 implicit
        //   (3) type mapping check     — EXI-150 (R25)
        //   (4) date format gate       — EXI-280 (procedure_date + confirmed_payment_date)
        //   (5) month-match gate       — EXI-281 (procedure_date.month == sheet.month)
        //   (6) ProcedureCandidate built
        //
        // Soft-skip taxonomy: gates (1)-(3) bump `procedures_skipped` only;
        // gates (4)-(5) ALSO append to `skipped_procedures` (EXI-290) so the
        // user sees what went wrong.
        let mut candidates: Vec<ProcedureCandidate> = Vec::new();
        let mut procedures_skipped = 0u32;
        let mut skipped_procedures: Vec<SkippedRow> = Vec::new();

        for excel_proc in &parsed_data.procedures {
            // (1) EXI-270 — sheet filter.
            // sheet_month equality vs the canonicalized allowed_sheets set
            // (parser writes canonical names; FE selection passes them
            // through verbatim).
            if !allowed_sheets.contains(&excel_proc.sheet_month) {
                procedures_skipped += 1;
                continue;
            }

            // (2) Patient resolution.
            let Some(patient_id) = patients_map.get(&excel_proc.patient_temp_id).cloned() else {
                tracing::debug!(
                    patient_temp_id = %excel_proc.patient_temp_id,
                    "Skipping procedure: patient temp_id not resolved"
                );
                procedures_skipped += 1;
                continue;
            };

            // (3) EXI-150 — type mapping check.
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

            // (4) EXI-280 — procedure_date format gate.
            let procedure_date =
                match NaiveDate::parse_from_str(&excel_proc.procedure_date, "%Y-%m-%d") {
                    Ok(d) => d,
                    Err(_) => {
                        tracing::warn!(
                            sheet = %excel_proc.sheet_month,
                            row = excel_proc.source_row,
                            value = %excel_proc.procedure_date,
                            "EXI-280 procedure_date format gate failed"
                        );
                        skipped_procedures.push(SkippedRow {
                            sheet: excel_proc.sheet_month.clone(),
                            row_number: excel_proc.source_row,
                            reason: SkipReason::InvalidProcedureDate {
                                value: excel_proc.procedure_date.clone(),
                            },
                        });
                        procedures_skipped += 1;
                        continue;
                    }
                };

            // (4b) EXI-280 — confirmed_payment_date format gate (when present and non-empty).
            let confirmed_payment_date = match excel_proc
                .confirmed_payment_date
                .as_deref()
                .filter(|s| !s.is_empty())
            {
                None => None,
                Some(raw) => match NaiveDate::parse_from_str(raw, "%Y-%m-%d") {
                    Ok(d) => Some(d),
                    Err(_) => {
                        tracing::warn!(
                            sheet = %excel_proc.sheet_month,
                            row = excel_proc.source_row,
                            value = %raw,
                            "EXI-280 confirmed_payment_date format gate failed"
                        );
                        skipped_procedures.push(SkippedRow {
                            sheet: excel_proc.sheet_month.clone(),
                            row_number: excel_proc.source_row,
                            reason: SkipReason::InvalidConfirmedPaymentDate {
                                value: raw.to_string(),
                            },
                        });
                        procedures_skipped += 1;
                        continue;
                    }
                },
            };

            // (5) EXI-281 — procedure_date month must equal sheet's nominal month.
            // Soft-skip on unknown sheet name (defensive — should not occur given
            // upstream canonicalization, but never panic).
            let Some(expected_month) = sheet_nominal_month(&excel_proc.sheet_month) else {
                tracing::warn!(
                    sheet = %excel_proc.sheet_month,
                    row = excel_proc.source_row,
                    "EXI-281 unknown sheet name (defensive soft-skip)"
                );
                skipped_procedures.push(SkippedRow {
                    sheet: excel_proc.sheet_month.clone(),
                    row_number: excel_proc.source_row,
                    reason: SkipReason::UnknownSheetName,
                });
                procedures_skipped += 1;
                continue;
            };
            if procedure_date.month() != expected_month {
                tracing::warn!(
                    sheet = %excel_proc.sheet_month,
                    row = excel_proc.source_row,
                    date = %procedure_date.format("%Y-%m-%d"),
                    "EXI-281 procedure_date month does not match sheet"
                );
                skipped_procedures.push(SkippedRow {
                    sheet: excel_proc.sheet_month.clone(),
                    row_number: excel_proc.source_row,
                    reason: SkipReason::DateOutsideSheetMonth {
                        date: procedure_date.format("%Y-%m-%d").to_string(),
                    },
                });
                procedures_skipped += 1;
                continue;
            }

            // (6) Build the candidate.
            candidates.push(ProcedureCandidate {
                patient_id,
                fund_id,
                procedure_type_id,
                procedure_date,
                billed_amount: excel_proc.amount,
                payment_method: excel_proc.payment_method.clone(),
                confirmed_payment_date,
                paid_amount: excel_proc.paid_amount,
                awaited_amount: excel_proc.awaited_amount,
            });
        }

        let procedures_created = if candidates.is_empty() {
            0u32
        } else {
            let created = self
                .procedure_orchestration
                .create_batch(candidates)
                .await
                .map_err(|e| {
                    tracing::error!(target: BACKEND, err = ?e, "Failed to create procedure batch");
                    ExcelImportError::ImportFailed
                })?;
            created.len() as u32
        };

        tracing::info!(
            created = procedures_created,
            skipped = procedures_skipped,
            skip_report_entries = skipped_procedures.len(),
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
            skipped_procedures,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::context::fund::{FundService, MockFundRepository};
    use crate::context::patient::{MockPatientRepository, PatientService};
    use crate::context::procedure::{
        MockProcedureRefundRepository, MockProcedureRepository, MockProcedureTypeRepository,
        ProcedureService,
    };
    use crate::shared::event_bus::EventBus;
    use crate::use_cases::excel_import::excel_codec::{
        ExcelFund, ExcelPatient, ExcelProcedure, ParsingIssues,
    };
    use crate::use_cases::procedure_orchestration::ProcedureOrchestrationService;

    struct OrchestratorMocks {
        patient_repo: MockPatientRepository,
        fund_repo: MockFundRepository,
        proc_repo: MockProcedureRepository,
        orch_proc_repo: MockProcedureRepository,
        orch_patient_repo: MockPatientRepository,
        orch_fund_repo: MockFundRepository,
        orch_type_repo: MockProcedureTypeRepository,
        orch_refund_repo: MockProcedureRefundRepository,
    }

    impl Default for OrchestratorMocks {
        fn default() -> Self {
            Self {
                patient_repo: MockPatientRepository::new(),
                fund_repo: MockFundRepository::new(),
                proc_repo: MockProcedureRepository::new(),
                orch_proc_repo: MockProcedureRepository::new(),
                orch_patient_repo: MockPatientRepository::new(),
                orch_fund_repo: MockFundRepository::new(),
                orch_type_repo: MockProcedureTypeRepository::new(),
                orch_refund_repo: MockProcedureRefundRepository::new(),
            }
        }
    }

    fn make_orchestrator(mocks: OrchestratorMocks) -> ExcelImportOrchestrator {
        let bus = Arc::new(EventBus::new());
        let patient_svc = Arc::new(PatientService::new(
            Arc::new(mocks.patient_repo),
            bus.clone(),
        ));
        let fund_svc = Arc::new(FundService::new(Arc::new(mocks.fund_repo), bus.clone()));
        let proc_svc = Arc::new(ProcedureService::new(
            Arc::new(mocks.proc_repo),
            bus.clone(),
        ));
        let orch_proc_svc = Arc::new(ProcedureService::new(
            Arc::new(mocks.orch_proc_repo),
            bus.clone(),
        ));
        let proc_orch = Arc::new(ProcedureOrchestrationService::new(
            orch_proc_svc,
            Arc::new(mocks.orch_patient_repo),
            Arc::new(mocks.orch_type_repo),
            Arc::new(mocks.orch_fund_repo),
            Arc::new(mocks.orch_refund_repo),
        ));
        ExcelImportOrchestrator::new(patient_svc, fund_svc, proc_svc, proc_orch)
    }

    fn empty_parse_result() -> ParseExcelResponse {
        ParseExcelResponse {
            patients: vec![],
            funds: vec![],
            procedures: vec![],
            total_records: 0,
            parsing_issues: ParsingIssues {
                skipped_rows: vec![],
                missing_sheets: vec![],
            },
        }
    }

    #[tokio::test]
    async fn execute_import_empty_input_returns_all_zeros() {
        let orchestrator = make_orchestrator(OrchestratorMocks::default());

        let result = orchestrator
            .execute_import(empty_parse_result(), HashMap::new(), vec![])
            .await
            .unwrap();

        assert_eq!(result.patients_created, 0);
        assert_eq!(result.patients_reused, 0);
        assert_eq!(result.funds_created, 0);
        assert_eq!(result.funds_reused, 0);
        assert_eq!(result.procedures_created, 0);
        assert_eq!(result.procedures_skipped, 0);
        assert!(result.blocked_months.is_empty());
    }

    #[tokio::test]
    async fn execute_import_reuses_existing_patient_by_ssn() {
        let mut patient_repo = MockPatientRepository::new();
        patient_repo.expect_find_patient_by_ssn().returning(|_| {
            Ok(Some(crate::context::patient::Patient::restore(
                "existing-id".to_string(),
                false,
                Some("Marie Dupont".to_string()),
                Some("1234567890123".to_string()),
                None,
                None,
                None,
                None,
            )))
        });

        let mut parse_result = empty_parse_result();
        parse_result.patients = vec![ExcelPatient {
            temp_id: "tmp-1".to_string(),
            name: "Marie Dupont".to_string(),
            ssn: "1234567890123".to_string(),
            latest_fund: None,
        }];

        let orchestrator = make_orchestrator(OrchestratorMocks {
            patient_repo,
            ..Default::default()
        });
        let result = orchestrator
            .execute_import(parse_result, HashMap::new(), vec![])
            .await
            .unwrap();

        assert_eq!(result.patients_reused, 1);
        assert_eq!(result.patients_created, 0);
    }

    /// EXI-080 — when the excel row has no SSN, the orchestrator falls back
    /// to a case-insensitive name lookup and reuses the match instead of
    /// creating a duplicate. Regression guard for the "re-import stacks
    /// blank-SSN patients month after month" bug.
    #[tokio::test]
    async fn execute_import_with_empty_ssn_reuses_patient_by_name() {
        let mut patient_repo = MockPatientRepository::new();
        patient_repo.expect_find_patient_by_ssn().times(0); // never called: row has no SSN
        patient_repo.expect_find_patient_by_name().returning(|_| {
            Ok(Some(crate::context::patient::Patient::restore(
                "existing-id".to_string(),
                false,
                Some("Marie Dupont".to_string()),
                None,
                None,
                None,
                None,
                None,
            )))
        });
        patient_repo.expect_create_batch().times(0); // never called: reuse

        let mut parse_result = empty_parse_result();
        parse_result.patients = vec![ExcelPatient {
            temp_id: "tmp-1".to_string(),
            name: "Marie Dupont".to_string(),
            ssn: String::new(),
            latest_fund: None,
        }];

        let orchestrator = make_orchestrator(OrchestratorMocks {
            patient_repo,
            ..Default::default()
        });
        let result = orchestrator
            .execute_import(parse_result, HashMap::new(), vec![])
            .await
            .unwrap();

        assert_eq!(result.patients_reused, 1);
        assert_eq!(result.patients_created, 0);
    }

    /// EXI-080 — when the excel row has no SSN and no name match exists in
    /// the DB, a new blank-SSN patient is created.
    #[tokio::test]
    async fn execute_import_with_empty_ssn_creates_new_when_name_not_in_db() {
        let mut patient_repo = MockPatientRepository::new();
        patient_repo.expect_find_patient_by_ssn().times(0);
        patient_repo
            .expect_find_patient_by_name()
            .returning(|_| Ok(None));
        patient_repo.expect_create_batch().returning(Ok);

        let mut parse_result = empty_parse_result();
        parse_result.patients = vec![ExcelPatient {
            temp_id: "tmp-1".to_string(),
            name: "Brand New".to_string(),
            ssn: String::new(),
            latest_fund: None,
        }];

        let orchestrator = make_orchestrator(OrchestratorMocks {
            patient_repo,
            ..Default::default()
        });
        let result = orchestrator
            .execute_import(parse_result, HashMap::new(), vec![])
            .await
            .unwrap();

        assert_eq!(result.patients_created, 1);
        assert_eq!(result.patients_reused, 0);
    }

    #[tokio::test]
    async fn execute_import_creates_new_patient_when_not_found() {
        let mut patient_repo = MockPatientRepository::new();
        patient_repo
            .expect_find_patient_by_ssn()
            .returning(|_| Ok(None));
        patient_repo.expect_create_batch().returning(Ok);

        let mut parse_result = empty_parse_result();
        parse_result.patients = vec![ExcelPatient {
            temp_id: "tmp-1".to_string(),
            name: "New Patient".to_string(),
            ssn: "9876543210987".to_string(),
            latest_fund: None,
        }];

        let orchestrator = make_orchestrator(OrchestratorMocks {
            patient_repo,
            ..Default::default()
        });
        let result = orchestrator
            .execute_import(parse_result, HashMap::new(), vec![])
            .await
            .unwrap();

        assert_eq!(result.patients_created, 1);
        assert_eq!(result.patients_reused, 0);
    }

    #[tokio::test]
    async fn execute_import_reuses_existing_fund() {
        let mut fund_repo = MockFundRepository::new();
        fund_repo.expect_find_fund_by_identifier().returning(|_| {
            Ok(Some(crate::context::fund::Fund::restore(
                "existing-fund-id".to_string(),
                "75".to_string(),
                "CPAM 75".to_string(),
            )))
        });

        let mut parse_result = empty_parse_result();
        parse_result.funds = vec![ExcelFund {
            temp_id: "fund-tmp-1".to_string(),
            fund_identifier: "75".to_string(),
            fund_name: "CPAM 75".to_string(),
            fund_address: None,
        }];

        let orchestrator = make_orchestrator(OrchestratorMocks {
            fund_repo,
            ..Default::default()
        });
        let result = orchestrator
            .execute_import(parse_result, HashMap::new(), vec![])
            .await
            .unwrap();

        assert_eq!(result.funds_reused, 1);
        assert_eq!(result.funds_created, 0);
    }

    #[tokio::test]
    async fn execute_import_skips_blocked_month() {
        let mut proc_repo = MockProcedureRepository::new();
        proc_repo
            .expect_has_blocking_procedures_in_month()
            .returning(|_| Ok(true));

        // A well-formed procedure anchors workbook_year so block-check runs.
        // The procedure itself gets filtered at step 1 (Jan not in allowed_sheets
        // because blocked) — only blocked_months is asserted here.
        let mut parse_result = empty_parse_result();
        parse_result.procedures = vec![ExcelProcedure {
            patient_temp_id: "tmp-anchor".to_string(),
            fund_temp_id: None,
            procedure_type_tmp_id: "type-anchor".to_string(),
            amount: 0,
            procedure_date: "2026-01-15".to_string(),
            sheet_month: "Jan".to_string(),
            payment_method: None,
            confirmed_payment_date: None,
            paid_amount: None,
            awaited_amount: None,
            source_row: 2,
        }];

        let orchestrator = make_orchestrator(OrchestratorMocks {
            proc_repo,
            ..Default::default()
        });
        let result = orchestrator
            .execute_import(parse_result, HashMap::new(), vec!["Jan".to_string()])
            .await
            .unwrap();

        assert_eq!(result.blocked_months, vec!["2026-01"]);
    }

    #[tokio::test]
    async fn execute_import_skips_procedure_for_unresolved_patient() {
        let mut proc_repo = MockProcedureRepository::new();
        proc_repo
            .expect_has_blocking_procedures_in_month()
            .returning(|_| Ok(false));
        proc_repo
            .expect_delete_procedures_by_month()
            .returning(|_| Ok(0));

        let mut parse_result = empty_parse_result();
        parse_result.procedures = vec![ExcelProcedure {
            patient_temp_id: "unknown-patient-tmp".to_string(),
            fund_temp_id: None,
            procedure_type_tmp_id: "type-1".to_string(),
            amount: 10000,
            procedure_date: "2026-01-15".to_string(),
            sheet_month: "Jan".to_string(),
            payment_method: None,
            confirmed_payment_date: None,
            paid_amount: None,
            awaited_amount: None,
            source_row: 2,
        }];

        let mut type_mapping = HashMap::new();
        type_mapping.insert("type-1".to_string(), "real-type-id".to_string());

        let orchestrator = make_orchestrator(OrchestratorMocks {
            proc_repo,
            ..Default::default()
        });
        let result = orchestrator
            .execute_import(parse_result, type_mapping, vec!["Jan".to_string()])
            .await
            .unwrap();

        assert_eq!(result.procedures_skipped, 1);
        assert_eq!(result.procedures_created, 0);
    }

    #[tokio::test]
    async fn execute_import_creates_new_fund_when_not_found() {
        let mut fund_repo = MockFundRepository::new();
        fund_repo
            .expect_find_fund_by_identifier()
            .returning(|_| Ok(None));
        fund_repo.expect_create_batch().returning(Ok);

        let mut parse_result = empty_parse_result();
        parse_result.funds = vec![ExcelFund {
            temp_id: "fund-tmp-2".to_string(),
            fund_identifier: "59".to_string(),
            fund_name: "CPAM 59".to_string(),
            fund_address: None,
        }];

        let orchestrator = make_orchestrator(OrchestratorMocks {
            fund_repo,
            ..Default::default()
        });
        let result = orchestrator
            .execute_import(parse_result, HashMap::new(), vec![])
            .await
            .unwrap();

        assert_eq!(result.funds_created, 1);
        assert_eq!(result.funds_reused, 0);
    }

    #[tokio::test]
    async fn execute_import_allowed_month_deletes_procedures() {
        let mut proc_repo = MockProcedureRepository::new();
        proc_repo
            .expect_has_blocking_procedures_in_month()
            .returning(|_| Ok(false));
        proc_repo
            .expect_delete_procedures_by_month()
            .returning(|_| Ok(3));

        // A well-formed procedure anchors workbook_year so block + delete runs.
        // The procedure gets filtered at step 4 (no matching patient in map) —
        // only blocked_months + procedures_deleted are asserted here.
        let mut parse_result = empty_parse_result();
        parse_result.procedures = vec![ExcelProcedure {
            patient_temp_id: "tmp-anchor".to_string(),
            fund_temp_id: None,
            procedure_type_tmp_id: "type-anchor".to_string(),
            amount: 0,
            procedure_date: "2026-02-15".to_string(),
            sheet_month: "Fév".to_string(),
            payment_method: None,
            confirmed_payment_date: None,
            paid_amount: None,
            awaited_amount: None,
            source_row: 2,
        }];

        let orchestrator = make_orchestrator(OrchestratorMocks {
            proc_repo,
            ..Default::default()
        });
        let result = orchestrator
            .execute_import(parse_result, HashMap::new(), vec!["Fév".to_string()])
            .await
            .unwrap();

        assert!(result.blocked_months.is_empty());
        assert_eq!(result.procedures_deleted, 3);
    }

    #[tokio::test]
    async fn execute_import_skips_procedure_for_unmapped_type() {
        let mut patient_repo = MockPatientRepository::new();
        patient_repo.expect_find_patient_by_ssn().returning(|_| {
            Ok(Some(crate::context::patient::Patient::restore(
                "patient-1".to_string(),
                false,
                Some("Test".to_string()),
                Some("1234".to_string()),
                None,
                None,
                None,
                None,
            )))
        });

        let mut proc_repo = MockProcedureRepository::new();
        proc_repo
            .expect_has_blocking_procedures_in_month()
            .returning(|_| Ok(false));
        proc_repo
            .expect_delete_procedures_by_month()
            .returning(|_| Ok(0));

        let mut parse_result = empty_parse_result();
        parse_result.patients = vec![ExcelPatient {
            temp_id: "tmp-1".to_string(),
            name: "Test".to_string(),
            ssn: "1234".to_string(),
            latest_fund: None,
        }];
        parse_result.procedures = vec![ExcelProcedure {
            patient_temp_id: "tmp-1".to_string(),
            fund_temp_id: None,
            procedure_type_tmp_id: "unmapped-type".to_string(),
            amount: 5000,
            procedure_date: "2026-02-15".to_string(),
            sheet_month: "Fév".to_string(),
            payment_method: None,
            confirmed_payment_date: None,
            paid_amount: None,
            awaited_amount: None,
            source_row: 3,
        }];

        let orchestrator = make_orchestrator(OrchestratorMocks {
            patient_repo,
            proc_repo,
            ..Default::default()
        });
        let result = orchestrator
            .execute_import(parse_result, HashMap::new(), vec!["Fév".to_string()])
            .await
            .unwrap();

        assert_eq!(result.procedures_skipped, 1);
        assert_eq!(result.procedures_created, 0);
    }

    // ── EXI-270 — Sheet-based filter ──────────────────────────────────────────

    /// EXI-270: a procedure row whose `sheet_month` is NOT in `selected_sheets`
    /// is silently skipped — it never reaches the validation gates.
    #[tokio::test]
    async fn exi_270_row_excluded_when_sheet_not_selected() {
        let mut proc_repo = MockProcedureRepository::new();
        proc_repo
            .expect_has_blocking_procedures_in_month()
            .returning(|_| Ok(false));
        proc_repo
            .expect_delete_procedures_by_month()
            .returning(|_| Ok(0));

        let mut parse_result = empty_parse_result();
        // Row is from "Fév" but only "Jan" is selected — must be skipped.
        parse_result.procedures = vec![ExcelProcedure {
            patient_temp_id: "tmp-1".to_string(),
            fund_temp_id: None,
            procedure_type_tmp_id: "type-1".to_string(),
            amount: 10000,
            procedure_date: "2026-02-15".to_string(),
            sheet_month: "Fév".to_string(),
            payment_method: None,
            confirmed_payment_date: None,
            paid_amount: None,
            awaited_amount: None,
            source_row: 2,
        }];

        let orchestrator = make_orchestrator(OrchestratorMocks {
            proc_repo,
            ..Default::default()
        });
        let result = orchestrator
            .execute_import(parse_result, HashMap::new(), vec!["Jan".to_string()])
            .await
            .unwrap();

        assert_eq!(result.procedures_created, 0);
        assert_eq!(result.procedures_skipped, 1);
        // Sheet-filter skips are NOT execute-time gate failures — skipped_procedures
        // must remain empty (only EXI-280/281 failures populate it).
        assert!(result.skipped_procedures.is_empty());
    }

    /// EXI-270: a procedure row whose `sheet_month` IS in `selected_sheets`
    /// continues past the sheet filter to the validation gates. With a valid
    /// date and correct month it should not be silently swallowed.
    /// (The test uses a patient that doesn't resolve, so the row reaches the
    /// patient-resolution step — enough to confirm the sheet filter passed.)
    #[tokio::test]
    async fn exi_270_row_included_when_sheet_selected_continues_to_gates() {
        let mut proc_repo = MockProcedureRepository::new();
        proc_repo
            .expect_has_blocking_procedures_in_month()
            .returning(|_| Ok(false));
        proc_repo
            .expect_delete_procedures_by_month()
            .returning(|_| Ok(0));

        let mut parse_result = empty_parse_result();
        // Row is from "Jan" and "Jan" is selected — must pass the sheet filter.
        // No patient in map → procedures_skipped bumped by patient-resolution,
        // but the row was NOT skipped by EXI-270 (skipped_procedures stays empty).
        parse_result.procedures = vec![ExcelProcedure {
            patient_temp_id: "unknown-tmp".to_string(),
            fund_temp_id: None,
            procedure_type_tmp_id: "type-1".to_string(),
            amount: 10000,
            procedure_date: "2026-01-15".to_string(),
            sheet_month: "Jan".to_string(),
            payment_method: None,
            confirmed_payment_date: None,
            paid_amount: None,
            awaited_amount: None,
            source_row: 2,
        }];

        let orchestrator = make_orchestrator(OrchestratorMocks {
            proc_repo,
            ..Default::default()
        });
        let result = orchestrator
            .execute_import(parse_result, HashMap::new(), vec!["Jan".to_string()])
            .await
            .unwrap();

        // Row passed the sheet filter; patient resolution skipped it — that is
        // a procedures_skipped increment, not a skipped_procedures entry.
        assert_eq!(result.procedures_skipped, 1);
        assert!(result.skipped_procedures.is_empty());
    }

    // ── EXI-280 — Execute-time date format validation ─────────────────────────

    /// EXI-280: a malformed `procedure_date` (DD/MM/YYYY instead of YYYY-MM-DD)
    /// causes the row to be skipped; a `SkippedRow` entry is pushed with the
    /// raw cell text in the reason.
    #[tokio::test]
    async fn exi_280_malformed_procedure_date_skips_row_with_raw_text_in_reason() {
        let mut proc_repo = MockProcedureRepository::new();
        proc_repo
            .expect_has_blocking_procedures_in_month()
            .returning(|_| Ok(false));
        proc_repo
            .expect_delete_procedures_by_month()
            .returning(|_| Ok(0));

        let mut patient_repo = MockPatientRepository::new();
        patient_repo.expect_find_patient_by_ssn().returning(|_| {
            Ok(Some(crate::context::patient::Patient::restore(
                "patient-1".to_string(),
                false,
                Some("Test".to_string()),
                Some("1234".to_string()),
                None,
                None,
                None,
                None,
            )))
        });

        let mut parse_result = empty_parse_result();
        parse_result.patients = vec![ExcelPatient {
            temp_id: "tmp-1".to_string(),
            name: "Test".to_string(),
            ssn: "1234".to_string(),
            latest_fund: None,
        }];
        // Malformed: DD/MM/YYYY is not the expected YYYY-MM-DD codec format.
        parse_result.procedures = vec![ExcelProcedure {
            patient_temp_id: "tmp-1".to_string(),
            fund_temp_id: None,
            procedure_type_tmp_id: "type-1".to_string(),
            amount: 10000,
            procedure_date: "31/12/2026".to_string(),
            sheet_month: "Jan".to_string(),
            payment_method: None,
            confirmed_payment_date: None,
            paid_amount: None,
            awaited_amount: None,
            source_row: 5,
        }];

        let mut type_mapping = HashMap::new();
        type_mapping.insert("type-1".to_string(), "real-type-id".to_string());

        let orchestrator = make_orchestrator(OrchestratorMocks {
            patient_repo,
            proc_repo,
            ..Default::default()
        });
        let result = orchestrator
            .execute_import(parse_result, type_mapping, vec!["Jan".to_string()])
            .await
            .unwrap();

        assert_eq!(result.procedures_created, 0);
        assert_eq!(result.skipped_procedures.len(), 1);
        let entry = &result.skipped_procedures[0];
        assert_eq!(entry.sheet, "Jan");
        assert_eq!(entry.row_number, 5);
        // EXI-290: the raw cell text travels as the variant's payload.
        assert_eq!(
            entry.reason,
            SkipReason::InvalidProcedureDate {
                value: "31/12/2026".to_string()
            }
        );
    }

    /// EXI-280: a malformed `confirmed_payment_date` on an otherwise-valid row
    /// also causes the row to be skipped and reported.
    #[tokio::test]
    async fn exi_280_malformed_confirmed_payment_date_skips_row_with_raw_text_in_reason() {
        let mut proc_repo = MockProcedureRepository::new();
        proc_repo
            .expect_has_blocking_procedures_in_month()
            .returning(|_| Ok(false));
        proc_repo
            .expect_delete_procedures_by_month()
            .returning(|_| Ok(0));

        let mut patient_repo = MockPatientRepository::new();
        patient_repo.expect_find_patient_by_ssn().returning(|_| {
            Ok(Some(crate::context::patient::Patient::restore(
                "patient-1".to_string(),
                false,
                Some("Test".to_string()),
                Some("1234".to_string()),
                None,
                None,
                None,
                None,
            )))
        });

        let mut parse_result = empty_parse_result();
        parse_result.patients = vec![ExcelPatient {
            temp_id: "tmp-1".to_string(),
            name: "Test".to_string(),
            ssn: "1234".to_string(),
            latest_fund: None,
        }];
        parse_result.procedures = vec![ExcelProcedure {
            patient_temp_id: "tmp-1".to_string(),
            fund_temp_id: None,
            procedure_type_tmp_id: "type-1".to_string(),
            amount: 10000,
            procedure_date: "2026-01-15".to_string(),
            sheet_month: "Jan".to_string(),
            payment_method: None,
            // Valid procedure_date but garbage confirmed_payment_date.
            confirmed_payment_date: Some("garbage".to_string()),
            paid_amount: None,
            awaited_amount: None,
            source_row: 7,
        }];

        let mut type_mapping = HashMap::new();
        type_mapping.insert("type-1".to_string(), "real-type-id".to_string());

        let orchestrator = make_orchestrator(OrchestratorMocks {
            patient_repo,
            proc_repo,
            ..Default::default()
        });
        let result = orchestrator
            .execute_import(parse_result, type_mapping, vec!["Jan".to_string()])
            .await
            .unwrap();

        assert_eq!(result.procedures_created, 0);
        assert_eq!(result.skipped_procedures.len(), 1);
        let entry = &result.skipped_procedures[0];
        assert_eq!(entry.sheet, "Jan");
        assert_eq!(entry.row_number, 7);
        // EXI-290: the raw cell text travels as the variant's payload.
        assert_eq!(
            entry.reason,
            SkipReason::InvalidConfirmedPaymentDate {
                value: "garbage".to_string()
            }
        );
    }

    /// EXI-280: `confirmed_payment_date = None` is NOT a gate failure — the
    /// row must be accepted normally (no entry in skipped_procedures).
    #[tokio::test]
    async fn exi_280_absent_confirmed_payment_date_is_not_a_failure() {
        let mut proc_repo = MockProcedureRepository::new();
        proc_repo
            .expect_has_blocking_procedures_in_month()
            .returning(|_| Ok(false));
        proc_repo
            .expect_delete_procedures_by_month()
            .returning(|_| Ok(0));

        let mut patient_repo = MockPatientRepository::new();
        patient_repo.expect_find_patient_by_ssn().returning(|_| {
            Ok(Some(crate::context::patient::Patient::restore(
                "patient-1".to_string(),
                false,
                Some("Test".to_string()),
                Some("1234".to_string()),
                None,
                None,
                None,
                None,
            )))
        });

        let mut orch_proc_repo = MockProcedureRepository::new();
        orch_proc_repo.expect_create_batch().returning(Ok);

        let mut orch_patient_repo = MockPatientRepository::new();
        orch_patient_repo.expect_read_patient().returning(|_| {
            Ok(Some(crate::context::patient::Patient::restore(
                "patient-1".to_string(),
                false,
                Some("Test".to_string()),
                Some("1234".to_string()),
                None,
                None,
                None,
                None,
            )))
        });
        orch_patient_repo.expect_update_patient().returning(Ok);

        let mut parse_result = empty_parse_result();
        parse_result.patients = vec![ExcelPatient {
            temp_id: "tmp-1".to_string(),
            name: "Test".to_string(),
            ssn: "1234".to_string(),
            latest_fund: None,
        }];
        parse_result.procedures = vec![ExcelProcedure {
            patient_temp_id: "tmp-1".to_string(),
            fund_temp_id: None,
            procedure_type_tmp_id: "type-1".to_string(),
            amount: 10000,
            procedure_date: "2026-01-15".to_string(),
            sheet_month: "Jan".to_string(),
            payment_method: None,
            confirmed_payment_date: None,
            paid_amount: None,
            awaited_amount: None,
            source_row: 2,
        }];

        let mut type_mapping = HashMap::new();
        type_mapping.insert("type-1".to_string(), "real-type-id".to_string());

        let orchestrator = make_orchestrator(OrchestratorMocks {
            patient_repo,
            proc_repo,
            orch_proc_repo,
            orch_patient_repo,
            ..Default::default()
        });
        let result = orchestrator
            .execute_import(parse_result, type_mapping, vec!["Jan".to_string()])
            .await
            .unwrap();

        assert!(
            result.skipped_procedures.is_empty(),
            "confirmed_payment_date=None must not produce a skipped_procedures entry"
        );
    }

    // ── EXI-281 — Procedure date must match sheet's nominal month ─────────────

    /// EXI-281: `procedure_date` in a different month from the sheet's nominal
    /// month causes the row to be skipped; the parsed date appears in the reason.
    #[tokio::test]
    async fn exi_281_procedure_date_in_wrong_month_skips_row_with_parsed_date_in_reason() {
        let mut proc_repo = MockProcedureRepository::new();
        proc_repo
            .expect_has_blocking_procedures_in_month()
            .returning(|_| Ok(false));
        proc_repo
            .expect_delete_procedures_by_month()
            .returning(|_| Ok(0));

        let mut patient_repo = MockPatientRepository::new();
        patient_repo.expect_find_patient_by_ssn().returning(|_| {
            Ok(Some(crate::context::patient::Patient::restore(
                "patient-1".to_string(),
                false,
                Some("Test".to_string()),
                Some("1234".to_string()),
                None,
                None,
                None,
                None,
            )))
        });

        let mut parse_result = empty_parse_result();
        parse_result.patients = vec![ExcelPatient {
            temp_id: "tmp-1".to_string(),
            name: "Test".to_string(),
            ssn: "1234".to_string(),
            latest_fund: None,
        }];
        // February date in a January sheet → EXI-281 mismatch.
        parse_result.procedures = vec![ExcelProcedure {
            patient_temp_id: "tmp-1".to_string(),
            fund_temp_id: None,
            procedure_type_tmp_id: "type-1".to_string(),
            amount: 10000,
            procedure_date: "2026-02-15".to_string(),
            sheet_month: "Jan".to_string(),
            payment_method: None,
            confirmed_payment_date: None,
            paid_amount: None,
            awaited_amount: None,
            source_row: 4,
        }];

        let mut type_mapping = HashMap::new();
        type_mapping.insert("type-1".to_string(), "real-type-id".to_string());

        let orchestrator = make_orchestrator(OrchestratorMocks {
            patient_repo,
            proc_repo,
            ..Default::default()
        });
        let result = orchestrator
            .execute_import(parse_result, type_mapping, vec!["Jan".to_string()])
            .await
            .unwrap();

        assert_eq!(result.procedures_created, 0);
        assert_eq!(result.skipped_procedures.len(), 1);
        let entry = &result.skipped_procedures[0];
        assert_eq!(entry.sheet, "Jan");
        assert_eq!(entry.row_number, 4);
        // EXI-290: the parsed date travels as the variant's payload.
        assert_eq!(
            entry.reason,
            SkipReason::DateOutsideSheetMonth {
                date: "2026-02-15".to_string()
            }
        );
    }

    /// EXI-281: `procedure_date` in the CORRECT month for the sheet is accepted
    /// (no entry in skipped_procedures).
    #[tokio::test]
    async fn exi_281_procedure_date_in_correct_month_is_accepted() {
        let mut proc_repo = MockProcedureRepository::new();
        proc_repo
            .expect_has_blocking_procedures_in_month()
            .returning(|_| Ok(false));
        proc_repo
            .expect_delete_procedures_by_month()
            .returning(|_| Ok(0));

        let mut patient_repo = MockPatientRepository::new();
        patient_repo.expect_find_patient_by_ssn().returning(|_| {
            Ok(Some(crate::context::patient::Patient::restore(
                "patient-1".to_string(),
                false,
                Some("Test".to_string()),
                Some("1234".to_string()),
                None,
                None,
                None,
                None,
            )))
        });

        let mut orch_proc_repo = MockProcedureRepository::new();
        orch_proc_repo.expect_create_batch().returning(Ok);

        let mut orch_patient_repo = MockPatientRepository::new();
        orch_patient_repo.expect_read_patient().returning(|_| {
            Ok(Some(crate::context::patient::Patient::restore(
                "patient-1".to_string(),
                false,
                Some("Test".to_string()),
                Some("1234".to_string()),
                None,
                None,
                None,
                None,
            )))
        });
        orch_patient_repo.expect_update_patient().returning(Ok);

        let mut parse_result = empty_parse_result();
        parse_result.patients = vec![ExcelPatient {
            temp_id: "tmp-1".to_string(),
            name: "Test".to_string(),
            ssn: "1234".to_string(),
            latest_fund: None,
        }];
        // January date in a January sheet → EXI-281 passes.
        parse_result.procedures = vec![ExcelProcedure {
            patient_temp_id: "tmp-1".to_string(),
            fund_temp_id: None,
            procedure_type_tmp_id: "type-1".to_string(),
            amount: 10000,
            procedure_date: "2026-01-15".to_string(),
            sheet_month: "Jan".to_string(),
            payment_method: None,
            confirmed_payment_date: None,
            paid_amount: None,
            awaited_amount: None,
            source_row: 2,
        }];

        let mut type_mapping = HashMap::new();
        type_mapping.insert("type-1".to_string(), "real-type-id".to_string());

        let orchestrator = make_orchestrator(OrchestratorMocks {
            patient_repo,
            proc_repo,
            orch_proc_repo,
            orch_patient_repo,
            ..Default::default()
        });
        let result = orchestrator
            .execute_import(parse_result, type_mapping, vec!["Jan".to_string()])
            .await
            .unwrap();

        assert!(
            result.skipped_procedures.is_empty(),
            "correctly-dated row must not produce a skipped_procedures entry"
        );
        assert_eq!(result.procedures_created, 1);
    }

    /// EXI-281: `confirmed_payment_date` in a different month from the sheet is
    /// NOT subject to the month-match constraint — the row must be accepted.
    #[tokio::test]
    async fn exi_281_confirmed_payment_date_different_month_is_still_accepted() {
        let mut proc_repo = MockProcedureRepository::new();
        proc_repo
            .expect_has_blocking_procedures_in_month()
            .returning(|_| Ok(false));
        proc_repo
            .expect_delete_procedures_by_month()
            .returning(|_| Ok(0));

        let mut patient_repo = MockPatientRepository::new();
        patient_repo.expect_find_patient_by_ssn().returning(|_| {
            Ok(Some(crate::context::patient::Patient::restore(
                "patient-1".to_string(),
                false,
                Some("Test".to_string()),
                Some("1234".to_string()),
                None,
                None,
                None,
                None,
            )))
        });

        let mut orch_proc_repo = MockProcedureRepository::new();
        orch_proc_repo.expect_create_batch().returning(Ok);

        let mut orch_patient_repo = MockPatientRepository::new();
        orch_patient_repo.expect_read_patient().returning(|_| {
            Ok(Some(crate::context::patient::Patient::restore(
                "patient-1".to_string(),
                false,
                Some("Test".to_string()),
                Some("1234".to_string()),
                None,
                None,
                None,
                None,
            )))
        });
        orch_patient_repo.expect_update_patient().returning(Ok);

        let mut parse_result = empty_parse_result();
        parse_result.patients = vec![ExcelPatient {
            temp_id: "tmp-1".to_string(),
            name: "Test".to_string(),
            ssn: "1234".to_string(),
            latest_fund: None,
        }];
        // procedure_date is January (matches "Jan" sheet), confirmed_payment_date
        // is March — different month, but EXI-281 must NOT apply to it.
        parse_result.procedures = vec![ExcelProcedure {
            patient_temp_id: "tmp-1".to_string(),
            fund_temp_id: None,
            procedure_type_tmp_id: "type-1".to_string(),
            amount: 10000,
            procedure_date: "2026-01-15".to_string(),
            sheet_month: "Jan".to_string(),
            payment_method: None,
            confirmed_payment_date: Some("2026-03-20".to_string()),
            paid_amount: None,
            awaited_amount: None,
            source_row: 2,
        }];

        let mut type_mapping = HashMap::new();
        type_mapping.insert("type-1".to_string(), "real-type-id".to_string());

        let orchestrator = make_orchestrator(OrchestratorMocks {
            patient_repo,
            proc_repo,
            orch_proc_repo,
            orch_patient_repo,
            ..Default::default()
        });
        let result = orchestrator
            .execute_import(parse_result, type_mapping, vec!["Jan".to_string()])
            .await
            .unwrap();

        assert!(
            result.skipped_procedures.is_empty(),
            "confirmed_payment_date in a different month must not trigger EXI-281"
        );
        assert_eq!(result.procedures_created, 1);
    }

    /// EXI-281 edge case: unknown sheet name (not in the canonical mapping)
    /// must produce a soft skip — not a panic — with the sheet name in the reason.
    #[tokio::test]
    async fn exi_281_unknown_sheet_name_soft_skips_row_without_panic() {
        let mut proc_repo = MockProcedureRepository::new();
        proc_repo
            .expect_has_blocking_procedures_in_month()
            .returning(|_| Ok(false));
        proc_repo
            .expect_delete_procedures_by_month()
            .returning(|_| Ok(0));

        let mut patient_repo = MockPatientRepository::new();
        patient_repo.expect_find_patient_by_ssn().returning(|_| {
            Ok(Some(crate::context::patient::Patient::restore(
                "patient-1".to_string(),
                false,
                Some("Test".to_string()),
                Some("1234".to_string()),
                None,
                None,
                None,
                None,
            )))
        });

        let mut parse_result = empty_parse_result();
        parse_result.patients = vec![ExcelPatient {
            temp_id: "tmp-1".to_string(),
            name: "Test".to_string(),
            ssn: "1234".to_string(),
            latest_fund: None,
        }];
        // Sheet name not in CANONICAL_SHEET_MONTH — must soft-skip, never panic.
        parse_result.procedures = vec![ExcelProcedure {
            patient_temp_id: "tmp-1".to_string(),
            fund_temp_id: None,
            procedure_type_tmp_id: "type-1".to_string(),
            amount: 10000,
            procedure_date: "2026-01-15".to_string(),
            sheet_month: "UnknownSheet".to_string(),
            payment_method: None,
            confirmed_payment_date: None,
            paid_amount: None,
            awaited_amount: None,
            source_row: 3,
        }];

        let mut type_mapping = HashMap::new();
        type_mapping.insert("type-1".to_string(), "real-type-id".to_string());

        // selected_sheets must include the unknown sheet name so the sheet-filter
        // (EXI-270) passes and the row reaches the EXI-281 gate.
        let orchestrator = make_orchestrator(OrchestratorMocks {
            patient_repo,
            proc_repo,
            ..Default::default()
        });
        let result = orchestrator
            .execute_import(parse_result, type_mapping, vec!["UnknownSheet".to_string()])
            .await
            .unwrap();

        assert_eq!(result.procedures_created, 0);
        assert_eq!(result.skipped_procedures.len(), 1);
        let entry = &result.skipped_procedures[0];
        assert_eq!(entry.sheet, "UnknownSheet");
        assert_eq!(entry.row_number, 3);
        // The sheet name is carried by `entry.sheet` (asserted above); the
        // reason itself is the bare code.
        assert_eq!(entry.reason, SkipReason::UnknownSheetName);
    }

    // ── EXI-290 — Skip report shape ───────────────────────────────────────────

    /// EXI-290: `skipped_procedures` is empty when every row passes all gates.
    #[tokio::test]
    async fn exi_290_skipped_procedures_empty_when_all_rows_pass() {
        let orchestrator = make_orchestrator(OrchestratorMocks::default());

        let result = orchestrator
            .execute_import(empty_parse_result(), HashMap::new(), vec![])
            .await
            .unwrap();

        assert!(
            result.skipped_procedures.is_empty(),
            "skipped_procedures must be empty when no rows fail any gate"
        );
    }

    /// EXI-290: `skipped_procedures` count equals the total number of execute-time
    /// gate failures — each failing row contributes exactly one entry, and the
    /// count covers ALL EXI-280/281 failures in a single import.
    #[tokio::test]
    async fn exi_290_skipped_procedures_count_covers_all_gate_failures() {
        let mut proc_repo = MockProcedureRepository::new();
        proc_repo
            .expect_has_blocking_procedures_in_month()
            .returning(|_| Ok(false));
        proc_repo
            .expect_delete_procedures_by_month()
            .returning(|_| Ok(0));

        let mut patient_repo = MockPatientRepository::new();
        patient_repo.expect_find_patient_by_ssn().returning(|_| {
            Ok(Some(crate::context::patient::Patient::restore(
                "patient-1".to_string(),
                false,
                Some("Test".to_string()),
                Some("1234".to_string()),
                None,
                None,
                None,
                None,
            )))
        });

        let mut parse_result = empty_parse_result();
        parse_result.patients = vec![ExcelPatient {
            temp_id: "tmp-1".to_string(),
            name: "Test".to_string(),
            ssn: "1234".to_string(),
            latest_fund: None,
        }];
        // Two rows that both fail: one EXI-280 (bad date), one EXI-281 (wrong month).
        parse_result.procedures = vec![
            ExcelProcedure {
                patient_temp_id: "tmp-1".to_string(),
                fund_temp_id: None,
                procedure_type_tmp_id: "type-1".to_string(),
                amount: 10000,
                procedure_date: "31/12/2026".to_string(), // EXI-280 failure
                sheet_month: "Jan".to_string(),
                payment_method: None,
                confirmed_payment_date: None,
                paid_amount: None,
                awaited_amount: None,
                source_row: 2,
            },
            ExcelProcedure {
                patient_temp_id: "tmp-1".to_string(),
                fund_temp_id: None,
                procedure_type_tmp_id: "type-1".to_string(),
                amount: 10000,
                procedure_date: "2026-02-15".to_string(), // EXI-281 failure (Feb in Jan sheet)
                sheet_month: "Jan".to_string(),
                payment_method: None,
                confirmed_payment_date: None,
                paid_amount: None,
                awaited_amount: None,
                source_row: 3,
            },
        ];

        let mut type_mapping = HashMap::new();
        type_mapping.insert("type-1".to_string(), "real-type-id".to_string());

        let orchestrator = make_orchestrator(OrchestratorMocks {
            patient_repo,
            proc_repo,
            ..Default::default()
        });
        let result = orchestrator
            .execute_import(parse_result, type_mapping, vec!["Jan".to_string()])
            .await
            .unwrap();

        assert_eq!(
            result.skipped_procedures.len(),
            2,
            "skipped_procedures must contain one entry per execute-time gate failure"
        );
        assert_eq!(result.procedures_created, 0);
        // procedures_skipped counter must also reflect the two gate failures.
        assert_eq!(result.procedures_skipped, 2);
    }

    // ── Empty-workbook year-derivation edge case (plan §5 step 3) ────────────

    /// When every row's `procedure_date` is malformed the orchestrator cannot
    /// derive a workbook year. Block + delete steps must be entirely skipped
    /// (no calls to `has_blocking_procedures_in_month` / `delete_procedures_by_month`),
    /// the import must return successfully with `procedures_created = 0` and
    /// `blocked_months = []`, and every row must appear in `skipped_procedures`.
    #[tokio::test]
    async fn empty_workbook_all_dates_malformed_skips_block_delete_returns_skip_report() {
        let mut patient_repo = MockPatientRepository::new();
        patient_repo.expect_find_patient_by_ssn().returning(|_| {
            Ok(Some(crate::context::patient::Patient::restore(
                "patient-1".to_string(),
                false,
                Some("Test".to_string()),
                Some("1234".to_string()),
                None,
                None,
                None,
                None,
            )))
        });

        // Strict mock: has_blocking_procedures_in_month and delete_procedures_by_month
        // must NEVER be called when workbook_year cannot be derived.
        let mut proc_repo = MockProcedureRepository::new();
        proc_repo.expect_has_blocking_procedures_in_month().times(0);
        proc_repo.expect_delete_procedures_by_month().times(0);

        let mut parse_result = empty_parse_result();
        parse_result.patients = vec![ExcelPatient {
            temp_id: "tmp-1".to_string(),
            name: "Test".to_string(),
            ssn: "1234".to_string(),
            latest_fund: None,
        }];
        // Every procedure has a malformed date — workbook_year cannot be derived.
        parse_result.procedures = vec![
            ExcelProcedure {
                patient_temp_id: "tmp-1".to_string(),
                fund_temp_id: None,
                procedure_type_tmp_id: "type-1".to_string(),
                amount: 10000,
                procedure_date: "not-a-date".to_string(),
                sheet_month: "Jan".to_string(),
                payment_method: None,
                confirmed_payment_date: None,
                paid_amount: None,
                awaited_amount: None,
                source_row: 2,
            },
            ExcelProcedure {
                patient_temp_id: "tmp-1".to_string(),
                fund_temp_id: None,
                procedure_type_tmp_id: "type-1".to_string(),
                amount: 20000,
                procedure_date: "also-bad".to_string(),
                sheet_month: "Jan".to_string(),
                payment_method: None,
                confirmed_payment_date: None,
                paid_amount: None,
                awaited_amount: None,
                source_row: 3,
            },
        ];

        let mut type_mapping = HashMap::new();
        type_mapping.insert("type-1".to_string(), "real-type-id".to_string());

        let orchestrator = make_orchestrator(OrchestratorMocks {
            patient_repo,
            proc_repo,
            ..Default::default()
        });
        let result = orchestrator
            .execute_import(parse_result, type_mapping, vec!["Jan".to_string()])
            .await
            .unwrap();

        assert_eq!(result.procedures_created, 0);
        assert!(result.blocked_months.is_empty());
        // All rows must be in skipped_procedures (EXI-280 date parse failures).
        assert_eq!(result.skipped_procedures.len(), 2);
    }

    /// Edge case: empty `parsed_data.procedures` (no procedures at all) — the
    /// block + delete steps must be skipped and the import returns with all-zero
    /// procedure counters and an empty `skipped_procedures`.
    #[tokio::test]
    async fn empty_workbook_no_procedures_skips_block_delete_returns_zeros() {
        // Strict mock: block/delete must never be called on an empty procedures list.
        let mut proc_repo = MockProcedureRepository::new();
        proc_repo.expect_has_blocking_procedures_in_month().times(0);
        proc_repo.expect_delete_procedures_by_month().times(0);

        let orchestrator = make_orchestrator(OrchestratorMocks {
            proc_repo,
            ..Default::default()
        });
        let result = orchestrator
            .execute_import(
                empty_parse_result(),
                HashMap::new(),
                vec!["Jan".to_string()],
            )
            .await
            .unwrap();

        assert_eq!(result.procedures_created, 0);
        assert!(result.blocked_months.is_empty());
        assert!(result.skipped_procedures.is_empty());
    }

    // --- Error paths: infrastructure failures collapse to ImportFailed ---

    #[tokio::test]
    async fn execute_import_patient_ssn_lookup_db_error_returns_import_failed() {
        let mut patient_repo = MockPatientRepository::new();
        patient_repo
            .expect_find_patient_by_ssn()
            .returning(|_| Err(anyhow::anyhow!("db down")));

        let mut parse_result = empty_parse_result();
        parse_result.patients = vec![ExcelPatient {
            temp_id: "tmp-1".to_string(),
            name: "Marie Dupont".to_string(),
            ssn: "1234567890123".to_string(),
            latest_fund: None,
        }];

        let orchestrator = make_orchestrator(OrchestratorMocks {
            patient_repo,
            ..Default::default()
        });
        let err = orchestrator
            .execute_import(parse_result, HashMap::new(), vec![])
            .await
            .unwrap_err();
        assert_eq!(err, ExcelImportError::ImportFailed);
    }

    #[tokio::test]
    async fn execute_import_patient_name_lookup_db_error_returns_import_failed() {
        let mut patient_repo = MockPatientRepository::new();
        patient_repo.expect_find_patient_by_ssn().times(0); // row has no SSN
        patient_repo
            .expect_find_patient_by_name()
            .returning(|_| Err(anyhow::anyhow!("db down")));

        let mut parse_result = empty_parse_result();
        parse_result.patients = vec![ExcelPatient {
            temp_id: "tmp-1".to_string(),
            name: "Marie Dupont".to_string(),
            ssn: String::new(),
            latest_fund: None,
        }];

        let orchestrator = make_orchestrator(OrchestratorMocks {
            patient_repo,
            ..Default::default()
        });
        let err = orchestrator
            .execute_import(parse_result, HashMap::new(), vec![])
            .await
            .unwrap_err();
        assert_eq!(err, ExcelImportError::ImportFailed);
    }

    #[tokio::test]
    async fn execute_import_fund_lookup_db_error_returns_import_failed() {
        let mut fund_repo = MockFundRepository::new();
        fund_repo
            .expect_find_fund_by_identifier()
            .returning(|_| Err(anyhow::anyhow!("db down")));

        let mut parse_result = empty_parse_result();
        parse_result.funds = vec![ExcelFund {
            temp_id: "fund-tmp-1".to_string(),
            fund_identifier: "CPAM".to_string(),
            fund_name: "CPAM France".to_string(),
            fund_address: None,
        }];

        let orchestrator = make_orchestrator(OrchestratorMocks {
            fund_repo,
            ..Default::default()
        });
        let err = orchestrator
            .execute_import(parse_result, HashMap::new(), vec![])
            .await
            .unwrap_err();
        assert_eq!(err, ExcelImportError::ImportFailed);
    }

    #[tokio::test]
    async fn execute_import_patient_create_batch_db_error_returns_import_failed() {
        let mut patient_repo = MockPatientRepository::new();
        patient_repo
            .expect_find_patient_by_ssn()
            .returning(|_| Ok(None));
        patient_repo
            .expect_create_batch()
            .returning(|_| Err(anyhow::anyhow!("db down")));

        let mut parse_result = empty_parse_result();
        parse_result.patients = vec![ExcelPatient {
            temp_id: "tmp-1".to_string(),
            name: "Marie Dupont".to_string(),
            ssn: "1234567890123".to_string(),
            latest_fund: None,
        }];

        let orchestrator = make_orchestrator(OrchestratorMocks {
            patient_repo,
            ..Default::default()
        });
        let err = orchestrator
            .execute_import(parse_result, HashMap::new(), vec![])
            .await
            .unwrap_err();
        assert_eq!(err, ExcelImportError::ImportFailed);
    }

    #[tokio::test]
    async fn execute_import_fund_create_batch_db_error_returns_import_failed() {
        let mut fund_repo = MockFundRepository::new();
        fund_repo
            .expect_find_fund_by_identifier()
            .returning(|_| Ok(None));
        fund_repo
            .expect_create_batch()
            .returning(|_| Err(anyhow::anyhow!("db down")));

        let mut parse_result = empty_parse_result();
        parse_result.funds = vec![ExcelFund {
            temp_id: "fund-tmp-1".to_string(),
            fund_identifier: "CPAM".to_string(),
            fund_name: "CPAM France".to_string(),
            fund_address: None,
        }];

        let orchestrator = make_orchestrator(OrchestratorMocks {
            fund_repo,
            ..Default::default()
        });
        let err = orchestrator
            .execute_import(parse_result, HashMap::new(), vec![])
            .await
            .unwrap_err();
        assert_eq!(err, ExcelImportError::ImportFailed);
    }

    /// A well-formed procedure row anchors `workbook_year`, so the sheet-level
    /// block check runs. The repo erroring there collapses to ImportFailed.
    fn parse_result_with_january_anchor() -> ParseExcelResponse {
        let mut parse_result = empty_parse_result();
        parse_result.procedures = vec![ExcelProcedure {
            patient_temp_id: "tmp-anchor".to_string(),
            fund_temp_id: None,
            procedure_type_tmp_id: "type-anchor".to_string(),
            amount: 0,
            procedure_date: "2026-01-15".to_string(),
            sheet_month: "Jan".to_string(),
            payment_method: None,
            confirmed_payment_date: None,
            paid_amount: None,
            awaited_amount: None,
            source_row: 2,
        }];
        parse_result
    }

    #[tokio::test]
    async fn execute_import_has_blocking_db_error_returns_import_failed() {
        let mut proc_repo = MockProcedureRepository::new();
        proc_repo
            .expect_has_blocking_procedures_in_month()
            .returning(|_| Err(anyhow::anyhow!("db down")));

        let orchestrator = make_orchestrator(OrchestratorMocks {
            proc_repo,
            ..Default::default()
        });
        let err = orchestrator
            .execute_import(
                parse_result_with_january_anchor(),
                HashMap::new(),
                vec!["Jan".to_string()],
            )
            .await
            .unwrap_err();
        assert_eq!(err, ExcelImportError::ImportFailed);
    }

    #[tokio::test]
    async fn execute_import_delete_procedures_db_error_returns_import_failed() {
        let mut proc_repo = MockProcedureRepository::new();
        proc_repo
            .expect_has_blocking_procedures_in_month()
            .returning(|_| Ok(false));
        proc_repo
            .expect_delete_procedures_by_month()
            .returning(|_| Err(anyhow::anyhow!("db down")));

        let orchestrator = make_orchestrator(OrchestratorMocks {
            proc_repo,
            ..Default::default()
        });
        let err = orchestrator
            .execute_import(
                parse_result_with_january_anchor(),
                HashMap::new(),
                vec!["Jan".to_string()],
            )
            .await
            .unwrap_err();
        assert_eq!(err, ExcelImportError::ImportFailed);
    }
}

use chrono::NaiveDate;
use regex::Regex;
use std::sync::Arc;

use super::api::AutoCorrection;
use crate::context::fund::{
    FundPaymentGroup, FundPaymentGroupCandidate, FundPaymentService, FundService,
};
use crate::context::patient::PatientService;
use crate::context::procedure::{Procedure, ProcedureService, ProcedureStatus};
use crate::core::event_bus::{EventBus, FundPaymentGroupUpdated, ProcedureUpdated};

/// Statistics from correction processing
#[derive(Default, Debug)]
struct CorrectionStats {
    amount_corrections: usize,
    fund_corrections: usize,
    date_corrections: usize,
    contest_corrections: usize,
    procedure_count: usize,
}

/// Orchestrator for creating fund payment groups from reconciliation candidates
///
/// Coordinates between contexts to:
/// 1. Resolve fund labels (e.g., "CPAM n° 931") to fund IDs
/// 2. Create FundPaymentGroups
/// 3. Update procedures with reconciliation status
pub struct FundPaymentReconciliationOrchestrator {
    fund_service: Arc<FundService>,
    procedure_service: Arc<ProcedureService>,
    fund_payment_service: Arc<FundPaymentService>,
    event_bus: Arc<EventBus>,
}

impl FundPaymentReconciliationOrchestrator {
    pub fn new(
        fund_service: Arc<FundService>,
        procedure_service: Arc<ProcedureService>,
        fund_payment_service: Arc<FundPaymentService>,
        event_bus: Arc<EventBus>,
    ) -> Self {
        Self {
            fund_service,
            procedure_service,
            fund_payment_service,
            event_bus,
        }
    }

    /// Resolve fund label (e.g., "CPAM n° 931") to fund ID, creating the fund if not found
    ///
    /// Strategy: Extract the fund number from the label and match it against fund identifiers.
    /// If no fund exists, create one automatically.
    async fn resolve_fund_id(&self, fund_label: &str) -> anyhow::Result<String> {
        // Extract fund number: look for pattern "n° XXX" or similar
        let regex = Regex::new(r"n°\s*(\d+)")?;

        let fund_identifier = if let Some(caps) = regex.captures(fund_label) {
            caps[1].to_string()
        } else {
            // No number found, use the full label as identifier (e.g., "MGEN")
            fund_label.trim().to_string()
        };

        // Search for existing fund by identifier
        if let Some(fund) = self
            .fund_service
            .find_fund_by_identifier(&fund_identifier)
            .await?
        {
            tracing::debug!(fund_label = %fund_label, fund_identifier = %fund_identifier, fund_id = %fund.id, "Resolved fund label to fund ID");
            return Ok(fund.id);
        }

        // Fund not found, create it
        tracing::info!(
            fund_label = %fund_label,
            fund_identifier = %fund_identifier,
            "Fund not found by identifier, creating new fund"
        );
        let fund = self
            .fund_service
            .create_fund(fund_identifier, fund_label.to_string())
            .await?;
        Ok(fund.id)
    }

    /// Check if a candidate would create a duplicate fund payment group
    pub async fn is_duplicate_candidate(
        &self,
        fund_label: &str,
        payment_date: NaiveDate,
        total_amount: i64,
    ) -> anyhow::Result<bool> {
        // Resolve fund label to fund ID (without creating if missing)
        let fund_id = match self.try_resolve_fund_id(fund_label).await? {
            Some(id) => id,
            None => return Ok(false), // Fund doesn't exist yet, so no duplicate possible
        };

        self.fund_payment_service
            .exists_group(
                &fund_id,
                &payment_date.format("%Y-%m-%d").to_string(),
                total_amount,
            )
            .await
    }

    /// Try to resolve fund label to fund ID without creating a new fund
    async fn try_resolve_fund_id(&self, fund_label: &str) -> anyhow::Result<Option<String>> {
        let regex = Regex::new(r"n°\s*(\d+)")?;

        let fund_identifier = if let Some(caps) = regex.captures(fund_label) {
            caps[1].to_string()
        } else {
            fund_label.trim().to_string()
        };

        if let Some(fund) = self
            .fund_service
            .find_fund_by_identifier(&fund_identifier)
            .await?
        {
            return Ok(Some(fund.id));
        }

        Ok(None)
    }

    /// Create fund payment group and update procedures with reconciliation data
    ///
    /// This method is called by batch reconciliation operations that manage event publishing.
    /// Events are suppressed during processing and published once by the orchestrator at the end.
    pub async fn create_fund_payment_from_candidate(
        &self,
        fund_label: String,
        payment_date: NaiveDate,
        total_amount: i64,
        procedure_ids: Vec<String>,
        actual_payment_amount: Option<i64>,
    ) -> anyhow::Result<FundPaymentGroup> {
        let payment_date_iso = payment_date.format("%Y-%m-%d").to_string();

        tracing::info!(
            fund_label = %fund_label,
            payment_date = %payment_date_iso,
            procedure_count = procedure_ids.len(),
            "Creating fund payment group from reconciliation candidate"
        );

        // Step 1: Resolve fund label to fund ID
        let fund_id = self.resolve_fund_id(&fund_label).await?;

        // Step 2: Create fund payment group (silent - orchestrator will batch publish)
        let group = self
            .fund_payment_service
            .create_group(
                fund_id.clone(),
                payment_date_iso.clone(),
                total_amount,
                procedure_ids.clone(),
                true,
            )
            .await?;

        tracing::info!(group_id = %group.id, "Fund payment group created");

        // Step 3: Update procedures with reconciliation status (silent - orchestrator will batch publish)
        let procedures_to_update = self
            .procedure_service
            .read_procedures_by_ids(procedure_ids.clone())
            .await?;

        let updated_procedures: Vec<_> = procedures_to_update
            .into_iter()
            .map(|mut procedure| {
                procedure.payment_status = ProcedureStatus::Reconciliated;
                procedure.actual_payment_amount = actual_payment_amount;
                procedure
            })
            .collect();

        self.procedure_service
            .update_procedures_batch(updated_procedures, true)
            .await?;

        tracing::info!(
            group_id = %group.id,
            procedure_count = procedure_ids.len(),
            "Updated procedures with reconciliation status (batch)"
        );

        tracing::info!(
            group_id = %group.id,
            procedure_count = group.lines.len(),
            "Reconciliation orchestration complete"
        );

        Ok(group)
    }

    /// Create multiple fund payment groups from reconciliation candidates (batch operation)
    ///
    /// This method handles the complete batch workflow:
    /// 1. Checks for duplicates
    /// 2. Resolves all fund labels to fund IDs
    /// 3. Creates all fund payment groups atomically (single transaction)
    /// 4. Updates all procedures with reconciliation status (single batch)
    /// 5. Publishes events once at the end
    pub async fn create_multiple_from_candidates(
        &self,
        candidates: Vec<FundPaymentGroupCandidate>,
    ) -> anyhow::Result<Vec<FundPaymentGroup>> {
        // Step 1: Check for duplicates
        let mut duplicate_count = 0u32;
        for candidate in &candidates {
            let is_duplicate = self
                .is_duplicate_candidate(
                    &candidate.fund_label,
                    candidate.payment_date,
                    candidate.total_amount,
                )
                .await?;

            if is_duplicate {
                duplicate_count += 1;
            }
        }

        if duplicate_count == candidates.len() as u32 {
            anyhow::bail!(
                "All {} payment groups already exist. PDF was likely already processed.",
                duplicate_count
            );
        }

        // Step 2: Filter non-duplicates and resolve fund IDs
        let mut batch_data = Vec::new();
        let mut all_procedure_ids = Vec::new();

        for candidate in candidates {
            let is_duplicate = self
                .is_duplicate_candidate(
                    &candidate.fund_label,
                    candidate.payment_date,
                    candidate.total_amount,
                )
                .await?;

            if is_duplicate {
                continue;
            }

            // Resolve fund label to fund ID
            let fund_id = self.resolve_fund_id(&candidate.fund_label).await?;

            let iso_date = candidate.payment_date.format("%Y-%m-%d").to_string();

            // Collect batch data for atomic creation
            batch_data.push((
                fund_id,
                iso_date,
                candidate.total_amount,
                candidate.procedure_ids.clone(),
            ));

            // Track all procedures for status update
            all_procedure_ids.extend(candidate.procedure_ids);
        }

        if batch_data.is_empty() {
            anyhow::bail!("No valid candidates to process");
        }

        // Step 3: Create all groups atomically (single transaction)
        let created_groups = self
            .fund_payment_service
            .create_groups_batch(batch_data, true) // is_silent=true, orchestrator will emit event
            .await?;

        tracing::info!(
            count = created_groups.len(),
            "Fund payment groups created atomically (batch)"
        );

        // Step 4: Update all procedures with reconciliation status (single batch)
        let procedures_to_update = self
            .procedure_service
            .read_procedures_by_ids(all_procedure_ids)
            .await?;

        let updated_procedures: Vec<_> = procedures_to_update
            .into_iter()
            .map(|mut procedure| {
                procedure.payment_status = ProcedureStatus::Reconciliated;
                procedure.actual_payment_amount = procedure.procedure_amount;
                procedure
            })
            .collect();

        self.procedure_service
            .update_procedures_batch(updated_procedures, true)
            .await?;

        tracing::info!(
            count = created_groups.len(),
            procedure_count = created_groups.iter().map(|g| g.lines.len()).sum::<usize>(),
            "Updated all procedures with reconciliation status (batch)"
        );

        // Step 5: Publish events (data already persisted to database)
        if !created_groups.is_empty() {
            let _ = self.event_bus.publish::<ProcedureUpdated>(ProcedureUpdated);
            let _ = self
                .event_bus
                .publish::<FundPaymentGroupUpdated>(FundPaymentGroupUpdated);
        }

        // Step 6: Verify integrity of all created groups (SINGLE POINT OF TRUTH)
        // Verification happens AFTER events are published, since data is already persisted
        self.verify_created_groups(&created_groups).await;

        Ok(created_groups)
    }

    /// Create multiple fund payment groups with auto-corrections (batch operation)
    ///
    /// This method handles the complete batch workflow with corrections:
    /// 1. Applies auto-corrections to procedures
    /// 2. Integrates newly created procedures into candidates
    /// 3. Checks for duplicate groups
    /// 4. Creates all fund payment groups atomically (single transaction)
    /// 5. Updates procedures with reconciliation status (single batch)
    /// 6. Publishes events once at the end
    pub async fn create_multiple_with_auto_corrections(
        &self,
        candidates: Vec<FundPaymentGroupCandidate>,
        auto_corrections: Vec<super::api::AutoCorrection>,
        patient_service: Arc<PatientService>,
    ) -> anyhow::Result<Vec<FundPaymentGroup>> {
        // Step 1: Apply auto-corrections first
        let created_procs = self
            .apply_auto_corrections(auto_corrections, patient_service)
            .await?;

        // Step 2: Integrate newly created procedures into candidates
        let mut candidates = candidates;
        for (fund_label, payment_date, proc_id) in created_procs {
            if let Some(candidate) = candidates
                .iter_mut()
                .find(|c| c.fund_label == fund_label && c.payment_date == payment_date)
            {
                candidate.procedure_ids.push(proc_id);
            } else {
                tracing::warn!(
                    fund_label = %fund_label,
                    payment_date = %payment_date,
                    "Created procedure has no matching candidate group"
                );
            }
        }

        // Step 3: Check for duplicates
        let mut duplicate_count = 0u32;
        for candidate in &candidates {
            let is_duplicate = self
                .is_duplicate_candidate(
                    &candidate.fund_label,
                    candidate.payment_date,
                    candidate.total_amount,
                )
                .await?;

            if is_duplicate {
                duplicate_count += 1;
            }
        }

        if duplicate_count == candidates.len() as u32 {
            anyhow::bail!(
                "All {} payment groups already exist. PDF was likely already processed.",
                duplicate_count
            );
        }

        // Step 4: Filter non-duplicates and resolve fund IDs (build batch data)
        let mut batch_data = Vec::new();
        let mut all_procedure_ids = Vec::new();

        for candidate in candidates {
            let is_duplicate = self
                .is_duplicate_candidate(
                    &candidate.fund_label,
                    candidate.payment_date,
                    candidate.total_amount,
                )
                .await?;

            if is_duplicate {
                continue;
            }

            // Resolve fund label to fund ID
            let fund_id = self.resolve_fund_id(&candidate.fund_label).await?;

            let iso_date = candidate.payment_date.format("%Y-%m-%d").to_string();

            // Collect batch data for atomic creation
            batch_data.push((
                fund_id,
                iso_date,
                candidate.total_amount,
                candidate.procedure_ids.clone(),
            ));

            // Track all procedures for status update
            all_procedure_ids.extend(candidate.procedure_ids);
        }

        if batch_data.is_empty() {
            anyhow::bail!("No valid candidates to process after applying corrections");
        }

        // Step 5: Create all groups atomically (single transaction)
        let created_groups = self
            .fund_payment_service
            .create_groups_batch(batch_data, true) // is_silent=true, orchestrator will emit event
            .await?;

        tracing::info!(
            count = created_groups.len(),
            "Fund payment groups created atomically (batch) after auto-corrections"
        );

        // Step 6: Update all procedures with reconciliation status (single batch)
        // Contested procedures (PartiallyReconciled) already have status + actual_payment_amount
        // set by apply_update_corrections — preserve them; update all others normally.
        let procedures_to_update = self
            .procedure_service
            .read_procedures_by_ids(all_procedure_ids)
            .await?;

        let updated_procedures: Vec<_> = procedures_to_update
            .into_iter()
            .map(|mut procedure| {
                if procedure.payment_status == ProcedureStatus::PartiallyReconciled {
                    // Contest correction already set actual_payment_amount and status — keep them
                } else {
                    procedure.payment_status = ProcedureStatus::Reconciliated;
                    procedure.actual_payment_amount = procedure.procedure_amount;
                }
                procedure
            })
            .collect();

        self.procedure_service
            .update_procedures_batch(updated_procedures, true)
            .await?;

        tracing::info!(
            count = created_groups.len(),
            procedure_count = created_groups.iter().map(|g| g.lines.len()).sum::<usize>(),
            "Updated all procedures with reconciliation status (batch)"
        );

        // Step 7: Publish events (data already persisted to database)
        if !created_groups.is_empty() {
            let _ = self.event_bus.publish::<ProcedureUpdated>(ProcedureUpdated);
            let _ = self
                .event_bus
                .publish::<FundPaymentGroupUpdated>(FundPaymentGroupUpdated);
        }

        // Step 8: Verify integrity of all created groups (SINGLE POINT OF TRUTH)
        // Verification happens AFTER events are published, since data is already persisted
        self.verify_created_groups(&created_groups).await;

        Ok(created_groups)
    }

    /// Verify integrity of created fund payment groups (non-blocking)
    ///
    /// This is the SINGLE POINT OF TRUTH for post-persistence integrity verification.
    /// Called once at the very end of the reconciliation process.
    ///
    /// Verifies for each group:
    /// - Sum of procedure amounts matches group.total_amount
    /// - All procedures exist in database
    ///
    /// Logs warnings on failure but never returns an error (data already persisted).
    pub async fn verify_created_groups(&self, groups: &[FundPaymentGroup]) {
        for group in groups {
            if let Err(e) = self.verify_group_integrity(group).await {
                tracing::warn!(
                    group_id = %group.id,
                    error = %e,
                    "Post-persistence integrity check failed for fund payment group (data persisted, manual review needed)"
                );
            }
        }

        tracing::info!(
            count = groups.len(),
            "Post-persistence integrity verification complete"
        );
    }

    /// Delete a fund payment group and clean up associated procedures
    ///
    /// Steps:
    /// 1. Read the group to get its lines (procedure IDs)
    /// 2. Soft-delete the lines
    /// 3. Reset each procedure: status → Created, clear confirmed_payment_date, clear actual_payment_amount
    /// 4. Soft-delete the group
    pub async fn delete_fund_payment_group_with_cleanup(
        &self,
        group_id: &str,
    ) -> anyhow::Result<()> {
        tracing::info!(group_id = %group_id, "Deleting fund payment group with procedure cleanup");

        // Step 1: Read group to get procedure IDs from lines
        let group = self
            .fund_payment_service
            .read_group(group_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Fund payment group not found: {}", group_id))?;

        let procedure_ids: Vec<String> =
            group.lines.iter().map(|l| l.procedure_id.clone()).collect();

        // Step 2: Reset each procedure's reconciliation data
        for procedure_id in &procedure_ids {
            if let Some(mut procedure) = self.procedure_service.read_procedure(procedure_id).await?
            {
                procedure.payment_status = ProcedureStatus::Created;
                procedure.confirmed_payment_date = None;
                procedure.actual_payment_amount = None;

                self.procedure_service.update_procedure(procedure).await?;

                tracing::trace!(
                    procedure_id = %procedure_id,
                    "Reset procedure reconciliation data"
                );
            } else {
                tracing::warn!(procedure_id = %procedure_id, "Procedure not found during cleanup");
            }
        }

        // Step 3: Soft-delete lines and group
        self.fund_payment_service
            .delete_lines_by_group(group_id)
            .await?;
        self.fund_payment_service
            .delete_group(group_id.to_string())
            .await?;

        tracing::info!(
            group_id = %group_id,
            procedure_count = procedure_ids.len(),
            "Fund payment group deleted with procedure cleanup complete"
        );

        Ok(())
    }

    /// Verify data integrity AFTER persistence
    ///
    /// This check runs AFTER creating the fund-payment group to ensure the sum of
    /// actual_payment_amount across all procedures equals the group's total_amount.
    /// Uses actual_payment_amount (not procedure_amount) because contested procedures
    /// keep their original procedure_amount while actual_payment_amount reflects what
    /// the fund actually paid.
    /// If verification fails, the issue is reported for manual review, but the persisted
    /// data is NOT rolled back.
    async fn verify_group_integrity(&self, group: &FundPaymentGroup) -> anyhow::Result<()> {
        let mut payments_total: i64 = 0;
        let mut payment_amounts = Vec::new();

        // Fetch all persisted procedures in the group and sum their actual_payment_amount
        for line in &group.lines {
            if let Some(procedure) = self
                .procedure_service
                .read_procedure(&line.procedure_id)
                .await?
            {
                let amount = procedure.actual_payment_amount.unwrap_or(0);
                payments_total += amount;
                payment_amounts.push((line.procedure_id.clone(), amount));
            } else {
                tracing::warn!(
                    procedure_id = %line.procedure_id,
                    "Procedure not found during post-persistence integrity check"
                );
                anyhow::bail!(
                    "Procedure {} not found in database after persistence",
                    line.procedure_id
                );
            }
        }

        // Verify the sum of actual_payment_amount matches the group total
        if payments_total != group.total_amount {
            let amounts_str = payment_amounts
                .iter()
                .map(|(id, amt)| {
                    format!(
                        "{}={:.2}€",
                        id.chars().take(8).collect::<String>(),
                        *amt as f64 / 1000.0
                    )
                })
                .collect::<Vec<_>>()
                .join(", ");

            tracing::warn!(
                group_id = %group.id,
                expected_total = group.total_amount,
                actual_total = payments_total,
                difference = payments_total - group.total_amount,
                procedure_count = group.lines.len(),
                payment_breakdown = %amounts_str,
                "Post-persistence integrity check: sum of actual_payment_amount does not match group total"
            );
            anyhow::bail!(
                "Integrity mismatch in group {}: expected {:.2}€, got {:.2}€. Breakdown: {}.",
                group.id,
                group.total_amount as f64 / 1000.0,
                payments_total as f64 / 1000.0,
                amounts_str
            );
        }

        tracing::info!(
            group_id = %group.id,
            total_amount = group.total_amount,
            procedure_count = group.lines.len(),
            "Post-persistence integrity check passed: sum of actual_payment_amount matches group total"
        );

        Ok(())
    }

    /// Apply auto-corrections for reconciliation anomalies (batched)
    ///
    /// Orchestrates the application of all correction types:
    /// 1. Apply update corrections (amount/fund/date) in a single batch
    /// 2. Apply creation corrections (new procedures)
    /// 3. Apply link corrections (existing procedures + SSN update)
    /// 4. Log summary statistics
    ///
    /// Returns a list of (fund_label, payment_date, procedure_id) for newly created/linked procedures
    pub async fn apply_auto_corrections(
        &self,
        auto_corrections: Vec<AutoCorrection>,
        patient_service: Arc<PatientService>,
    ) -> anyhow::Result<Vec<(String, NaiveDate, String)>> {
        let total_corrections = auto_corrections.len();
        tracing::info!(
            correction_count = total_corrections,
            "Starting to apply auto-corrections for anomalies"
        );

        // Step 1: Apply update corrections (amount/fund/date) in batch
        let update_stats = self
            .apply_update_corrections(auto_corrections.clone())
            .await?;

        // Step 2: Apply creation corrections (new procedures)
        let created_procedures = self
            .apply_create_corrections(auto_corrections.clone(), patient_service.clone())
            .await?;

        // Step 3: Apply link corrections (existing procedures + SSN update)
        let linked_procedures = self
            .apply_link_corrections(auto_corrections, patient_service)
            .await?;

        // Step 4: Log summary
        tracing::info!(
            total_corrections = total_corrections,
            amount_corrections = update_stats.amount_corrections,
            fund_corrections = update_stats.fund_corrections,
            date_corrections = update_stats.date_corrections,
            contest_corrections = update_stats.contest_corrections,
            created_procedures = created_procedures.len(),
            linked_procedures = linked_procedures.len(),
            "Auto-corrections completed"
        );

        let mut all_results = created_procedures;
        all_results.extend(linked_procedures);
        Ok(all_results)
    }

    /// Apply update corrections (amount, fund, date) in a single batch
    ///
    /// Strategy:
    /// 1. Collect all procedure IDs that need updating
    /// 2. Batch load all procedures with read_procedures_by_ids() (single DB call)
    /// 3. Iterate corrections once, applying them directly to cached procedures
    /// 4. Batch update procedures once with is_silent=true (no events emitted)
    ///
    /// Returns: Correction statistics
    async fn apply_update_corrections(
        &self,
        auto_corrections: Vec<AutoCorrection>,
    ) -> anyhow::Result<CorrectionStats> {
        use std::collections::HashSet;

        // Step 1: Collect all procedure IDs that need updating
        let mut procedure_ids_to_load = HashSet::new();

        for correction in &auto_corrections {
            match correction {
                AutoCorrection::AmountMismatch { procedure_id, .. }
                | AutoCorrection::FundMismatch { procedure_id, .. }
                | AutoCorrection::DateMismatch { procedure_id, .. }
                | AutoCorrection::ContestAmount { procedure_id, .. } => {
                    procedure_ids_to_load.insert(procedure_id.clone());
                }
                _ => {} // Skip other correction types
            }
        }

        // Return early if no update corrections
        if procedure_ids_to_load.is_empty() {
            return Ok(CorrectionStats::default());
        }

        // Step 2: Batch load all procedures (single DB call)
        let procedure_ids: Vec<String> = procedure_ids_to_load.into_iter().collect();
        let mut procedures_to_update = self
            .procedure_service
            .read_procedures_by_ids(procedure_ids)
            .await?
            .into_iter()
            .map(|proc| (proc.id.clone(), proc))
            .collect::<std::collections::HashMap<_, _>>();

        let mut stats = CorrectionStats::default();

        // Step 3: Iterate corrections once and apply them directly to cached procedures
        for correction in auto_corrections {
            match correction {
                AutoCorrection::AmountMismatch {
                    procedure_id,
                    pdf_amount,
                } => {
                    if let Some(procedure) = procedures_to_update.get_mut(&procedure_id) {
                        procedure.procedure_amount = Some(pdf_amount);
                        stats.amount_corrections += 1;
                    }
                }

                AutoCorrection::FundMismatch {
                    procedure_id,
                    pdf_fund_label,
                } => {
                    let fund_id = self.resolve_fund_id(&pdf_fund_label).await?;
                    if let Some(procedure) = procedures_to_update.get_mut(&procedure_id) {
                        procedure.fund_id = Some(fund_id);
                        stats.fund_corrections += 1;
                    }
                }

                AutoCorrection::DateMismatch {
                    procedure_id,
                    pdf_date,
                } => {
                    if let Some(procedure) = procedures_to_update.get_mut(&procedure_id) {
                        procedure.procedure_date = pdf_date;
                        stats.date_corrections += 1;
                    }
                }

                AutoCorrection::ContestAmount {
                    procedure_id,
                    actual_payment_amount,
                } => {
                    if let Some(procedure) = procedures_to_update.get_mut(&procedure_id) {
                        procedure.actual_payment_amount = Some(actual_payment_amount);
                        procedure.payment_status = ProcedureStatus::PartiallyReconciled;
                        stats.contest_corrections += 1;
                    }
                }

                _ => {} // Skip other correction types
            }
        }

        // Step 4: Batch update all procedures (silent mode - no events emitted)
        if !procedures_to_update.is_empty() {
            stats.procedure_count = procedures_to_update.len();
            let procedures: Vec<Procedure> = procedures_to_update.into_values().collect();
            self.procedure_service
                .update_procedures_batch(procedures, true)
                .await?;
            tracing::info!(
                amount_corrections = stats.amount_corrections,
                fund_corrections = stats.fund_corrections,
                date_corrections = stats.date_corrections,
                contest_corrections = stats.contest_corrections,
                procedure_count = stats.procedure_count,
                "Procedure corrections applied (batched, silent)"
            );
        }

        Ok(stats)
    }

    /// Apply link corrections (link existing procedure + update patient SSN)
    ///
    /// Returns: List of (fund_label, payment_date, procedure_id) for linked procedures
    async fn apply_link_corrections(
        &self,
        auto_corrections: Vec<AutoCorrection>,
        patient_service: Arc<PatientService>,
    ) -> anyhow::Result<Vec<(String, NaiveDate, String)>> {
        let mut result = Vec::new();

        for correction in auto_corrections {
            if let AutoCorrection::LinkProcedure {
                procedure_id,
                pdf_ssn,
                pdf_fund_label,
                payment_date,
            } = correction
            {
                // Update patient SSN to PDF SSN (PDF is always right)
                let procedures = self
                    .procedure_service
                    .read_procedures_by_ids(vec![procedure_id.clone()])
                    .await?;

                if let Some(procedure) = procedures.into_iter().next() {
                    if let Some(mut patient) =
                        patient_service.read_patient(&procedure.patient_id).await?
                    {
                        patient.ssn = Some(pdf_ssn);
                        patient_service.update_patient(patient).await?;
                        tracing::info!(
                            procedure_id = %procedure_id,
                            "Patient SSN updated from PDF during LinkProcedure correction"
                        );
                    }
                }

                result.push((pdf_fund_label, payment_date, procedure_id));
            }
        }

        Ok(result)
    }

    /// Apply creation corrections (new procedures)
    ///
    /// Strategy:
    /// 1. Collect procedure data for each CreateProcedure correction
    /// 2. Handle patient resolution (find or create)
    /// 3. Handle fund resolution
    /// 4. Build ProcedureCandidate objects
    /// 5. Batch create all procedures silently (no events until orchestrator publishes)
    ///
    /// Returns: List of (fund_label, payment_date, procedure_id) for newly created procedures
    async fn apply_create_corrections(
        &self,
        auto_corrections: Vec<AutoCorrection>,
        patient_service: Arc<PatientService>,
    ) -> anyhow::Result<Vec<(String, NaiveDate, String)>> {
        use crate::context::procedure::ProcedureCandidate;

        let mut candidates = Vec::new();
        let mut created_info = Vec::new();

        // Step 1: Collect procedure candidates and resolve patients/funds
        for correction in auto_corrections {
            if let AutoCorrection::CreateProcedure {
                ssn,
                patient_name,
                procedure_date,
                payment_date,
                procedure_amount,
                pdf_fund_label,
            } = correction
            {
                let procedure_date_iso = procedure_date.format("%Y-%m-%d").to_string();

                // Find patient by SSN, or create if not found
                let patient = match patient_service.find_patient_by_ssn(&ssn).await? {
                    Some(p) => p,
                    None => {
                        tracing::info!(
                            ssn = %ssn,
                            patient_name = %patient_name,
                            "Patient not found by SSN, creating new patient"
                        );
                        patient_service
                            .create_patient(Some(patient_name), Some(ssn.clone()))
                            .await?
                    }
                };

                // Resolve fund label to fund ID
                let fund_id = self.resolve_fund_id(&pdf_fund_label).await?;

                // Build candidate for batch creation
                let candidate = ProcedureCandidate {
                    patient_id: patient.id.clone(),
                    fund_id: Some(fund_id),
                    procedure_type_id: "import-pdf".to_string(),
                    procedure_date: procedure_date_iso,
                    procedure_amount: Some(procedure_amount),
                    payment_method: None,
                    confirmed_payment_date: None,
                    actual_payment_amount: None,
                    awaited_amount: None,
                };

                // Remember the fund label and payment date for the result
                created_info.push((pdf_fund_label, payment_date));
                candidates.push(candidate);
            }
        }

        // Step 2: Batch create all procedures silently (no events)
        let created_procedures = if !candidates.is_empty() {
            self.procedure_service
                .create_procedures_batch_from_candidates(candidates, true)
                .await?
        } else {
            Vec::new()
        };

        // Step 3: Build result tuples with procedure IDs
        let mut result = Vec::new();
        for (i, (fund_label, payment_date)) in created_info.into_iter().enumerate() {
            if let Some(procedure) = created_procedures.get(i) {
                result.push((fund_label, payment_date, procedure.id.clone()));
            }
        }

        Ok(result)
    }
}

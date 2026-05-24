use chrono::NaiveDate;
use regex::Regex;
use std::collections::HashMap;
use std::sync::Arc;

use super::api::AutoCorrection;
use crate::context::fund::{
    FundPaymentGroup, FundPaymentGroupCandidate, FundPaymentService, FundService,
};
use crate::context::patient::PatientService;
use crate::context::procedure::{Procedure, ProcedureService, ProcedureStatus};
use crate::shared::event_bus::{EventBus, FundPaymentGroupUpdated, ProcedureUpdated};

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

    /// Return `true` iff every supplied candidate corresponds to an existing
    /// fund-payment group (same `fund_label` + `payment_date` + `total_amount`).
    /// An empty input returns `false` — there's nothing to be a duplicate of.
    ///
    /// Used by `reconcile_and_create_candidates_fn` to short-circuit a PDF
    /// re-import before the user is shown the anomaly UI.
    pub async fn all_candidates_are_duplicates(
        &self,
        candidates: &[super::api::FundPaymentCandidateFromPdf],
    ) -> anyhow::Result<bool> {
        if candidates.is_empty() {
            return Ok(false);
        }
        for candidate in candidates {
            if !self
                .is_duplicate_candidate(
                    &candidate.fund_label,
                    candidate.payment_date,
                    candidate.total_amount,
                )
                .await?
            {
                return Ok(false);
            }
        }
        Ok(true)
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
        paid_amount: Option<i64>,
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

        // FPA-300 — auto-reconciliation sets Stage 1 fund_reconciliation_date.
        let updated_procedures: Vec<_> = procedures_to_update
            .into_iter()
            .map(|mut procedure| {
                procedure.payment_status = ProcedureStatus::Reconciled;
                procedure.paid_amount = paid_amount;
                procedure.fund_reconciliation_date = Some(payment_date);
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
        // Step 1: Check for duplicates (single pass — results reused in Step 2)
        let mut duplicate_flags = Vec::with_capacity(candidates.len());
        for candidate in &candidates {
            duplicate_flags.push(
                self.is_duplicate_candidate(
                    &candidate.fund_label,
                    candidate.payment_date,
                    candidate.total_amount,
                )
                .await?,
            );
        }

        let duplicate_count = duplicate_flags.iter().filter(|&&d| d).count();
        if !candidates.is_empty() && duplicate_count == candidates.len() {
            anyhow::bail!(
                "All {} payment groups already exist. PDF was likely already processed.",
                duplicate_count
            );
        }

        // Step 2: Filter non-duplicates and resolve fund IDs
        // duplicate_flags[i] corresponds to candidates[i] — both built in the same loop order above
        let mut batch_data = Vec::new();
        let mut all_procedure_ids = Vec::new();

        for (candidate, is_duplicate) in candidates.into_iter().zip(duplicate_flags) {
            if is_duplicate {
                continue;
            }

            // Resolve fund label to fund ID
            let fund_id = self.resolve_fund_id(&candidate.fund_label).await?;

            let iso_date = candidate.payment_date.format("%Y-%m-%d").to_string();

            // Track all procedures for status update
            all_procedure_ids.extend(candidate.procedure_ids.iter().cloned());

            // Collect batch data for atomic creation
            batch_data.push((
                fund_id,
                iso_date,
                candidate.total_amount,
                candidate.procedure_ids,
            ));
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
        let procedure_date_map: HashMap<String, NaiveDate> = created_groups
            .iter()
            .flat_map(|g| {
                g.lines
                    .iter()
                    .map(move |l| (l.procedure_id.clone(), g.payment_date))
            })
            .collect();

        let procedures_to_update = self
            .procedure_service
            .read_procedures_by_ids(all_procedure_ids)
            .await?;

        let updated_procedures: Vec<_> = procedures_to_update
            .into_iter()
            .map(|mut procedure| {
                procedure.payment_status = ProcedureStatus::Reconciled;
                // TODO: when billed_amount is None the procedure relies on its procedure type's
                // default_amount, but we have no ProcedureTypeService here to resolve it.
                // Add ProcedureTypeService to this orchestrator and use
                // billed_amount.unwrap_or(default_amount) so paid_amount is never left null
                // for reconciled procedures.
                procedure.paid_amount = procedure.billed_amount;
                // FPA-300 — Stage 1 reconciliation sets fund_reconciliation_date
                // (the group's payment_date), not the bank-side confirmed date.
                procedure.fund_reconciliation_date = procedure_date_map.get(&procedure.id).copied();
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
    /// 1. Checks for duplicate groups — bails with no DB writes if every
    ///    candidate is a duplicate. Order matters: this runs BEFORE
    ///    `apply_auto_corrections` so a re-imported PDF cannot silently
    ///    mutate procedure rows (or create new patients/procedures) on its
    ///    way to a guaranteed rejection.
    /// 2. Applies auto-corrections to procedures
    /// 3. Integrates newly created procedures into candidates
    /// 4. Creates all fund payment groups atomically (single transaction)
    /// 5. Updates procedures with reconciliation status (single batch)
    /// 6. Publishes events once at the end
    ///
    /// Long-term, steps 2–5 should commit or roll back as a single Unit of
    /// Work (per ADR-003 / the UoW item in `docs/todo.md` DDD Convergence),
    /// closing the mixed-case + step-3-to-5 partial-failure surface.
    pub async fn create_multiple_with_auto_corrections(
        &self,
        candidates: Vec<FundPaymentGroupCandidate>,
        auto_corrections: Vec<super::api::AutoCorrection>,
        patient_service: Arc<PatientService>,
    ) -> anyhow::Result<Vec<FundPaymentGroup>> {
        // Step 1: Check for duplicates BEFORE any DB writes
        let mut duplicate_flags = Vec::with_capacity(candidates.len());
        for candidate in &candidates {
            duplicate_flags.push(
                self.is_duplicate_candidate(
                    &candidate.fund_label,
                    candidate.payment_date,
                    candidate.total_amount,
                )
                .await?,
            );
        }

        let duplicate_count = duplicate_flags.iter().filter(|&&d| d).count();
        if !candidates.is_empty() && duplicate_count == candidates.len() {
            anyhow::bail!(
                "All {} payment groups already exist. PDF was likely already processed.",
                duplicate_count
            );
        }

        // Step 2: Apply auto-corrections (only reachable when at least one
        // non-duplicate candidate exists, so no writes happen on a fully
        // duplicate batch).
        let created_procs = self
            .apply_auto_corrections(auto_corrections, patient_service)
            .await?;

        // Step 3: Integrate newly created procedures into candidates
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

        // Step 4: Filter non-duplicates and resolve fund IDs (build batch data)
        // duplicate_flags[i] corresponds to candidates[i] — both built in the same loop order above
        let mut batch_data = Vec::new();
        let mut all_procedure_ids = Vec::new();

        for (candidate, is_duplicate) in candidates.into_iter().zip(duplicate_flags) {
            if is_duplicate {
                continue;
            }

            // Resolve fund label to fund ID
            let fund_id = self.resolve_fund_id(&candidate.fund_label).await?;

            let iso_date = candidate.payment_date.format("%Y-%m-%d").to_string();

            // Track all procedures for status update
            all_procedure_ids.extend(candidate.procedure_ids.iter().cloned());

            // Collect batch data for atomic creation
            batch_data.push((
                fund_id,
                iso_date,
                candidate.total_amount,
                candidate.procedure_ids,
            ));
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
        // Contested procedures (PartiallyReconciled) already have status + paid_amount
        // set by apply_update_corrections — preserve them; update all others normally.
        let procedure_date_map: HashMap<String, NaiveDate> = created_groups
            .iter()
            .flat_map(|g| {
                g.lines
                    .iter()
                    .map(move |l| (l.procedure_id.clone(), g.payment_date))
            })
            .collect();

        let procedures_to_update = self
            .procedure_service
            .read_procedures_by_ids(all_procedure_ids)
            .await?;

        let updated_procedures: Vec<_> = procedures_to_update
            .into_iter()
            .map(|mut procedure| {
                // FPA-300 — Stage 1 reconciliation sets fund_reconciliation_date.
                procedure.fund_reconciliation_date = procedure_date_map.get(&procedure.id).copied();
                if procedure.payment_status != ProcedureStatus::PartiallyReconciled {
                    // Contest correction already set paid_amount and status — keep them
                    procedure.payment_status = ProcedureStatus::Reconciled;
                    // TODO: same as above — billed_amount may be None for procedures using
                    // procedure type default_amount; add ProcedureTypeService to resolve it.
                    procedure.paid_amount = procedure.billed_amount;
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

    /// Verify data integrity AFTER persistence
    ///
    /// This check runs AFTER creating the fund-payment group to ensure the sum of
    /// paid_amount across all procedures equals the group's total_amount.
    /// Uses paid_amount (not billed_amount) because contested procedures
    /// keep their original billed_amount while paid_amount reflects what
    /// the fund actually paid.
    /// If verification fails, the issue is reported for manual review, but the persisted
    /// data is NOT rolled back.
    async fn verify_group_integrity(&self, group: &FundPaymentGroup) -> anyhow::Result<()> {
        let mut payments_total: i64 = 0;
        let mut payment_amounts = Vec::new();

        // Fetch all persisted procedures in the group and sum their paid_amount
        for line in &group.lines {
            if let Some(procedure) = self
                .procedure_service
                .read_procedure(&line.procedure_id)
                .await?
            {
                let amount = procedure.paid_amount.unwrap_or(0);
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

        // Verify the sum of paid_amount matches the group total
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
                "Post-persistence integrity check: sum of paid_amount does not match group total"
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
            "Post-persistence integrity check passed: sum of paid_amount matches group total"
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
                        procedure.billed_amount = Some(pdf_amount);
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
                    paid_amount,
                } => {
                    if let Some(procedure) = procedures_to_update.get_mut(&procedure_id) {
                        procedure.paid_amount = Some(paid_amount);
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
                billed_amount,
                pdf_fund_label,
            } = correction
            {
                // Find patient by SSN, or create if not found
                let patient = match patient_service.find_patient_by_ssn(&ssn).await? {
                    Some(p) => p,
                    None => {
                        tracing::info!("Patient not found by SSN, creating new patient");
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
                    procedure_date,
                    billed_amount: Some(billed_amount),
                    payment_method: None,
                    confirmed_payment_date: None,
                    paid_amount: None,
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    use crate::context::fund::{
        Fund, FundPaymentGroupStatus, FundPaymentLine, FundRepository, FundService,
        MockFundPaymentRepository, MockFundRepository,
    };
    use crate::context::procedure::{
        MockProcedureRepository, PaymentMethod, Procedure, ProcedureRepository,
    };
    use crate::shared::event_bus::EventBus;

    /// Build an orchestrator wired with the three repository mocks. Each test
    /// configures only the methods it expects to hit — mockall panics on any
    /// unconfigured call, which keeps the contract between orchestrator and
    /// repositories explicit.
    fn make_orchestrator(
        fund_repo: MockFundRepository,
        fund_payment_repo: MockFundPaymentRepository,
        procedure_repo: MockProcedureRepository,
    ) -> FundPaymentReconciliationOrchestrator {
        let bus = Arc::new(EventBus::new());
        let fund_repo_arc: Arc<dyn FundRepository> = Arc::new(fund_repo);
        let fund_service = Arc::new(FundService::new(fund_repo_arc, bus.clone()));
        let fund_payment_service = Arc::new(FundPaymentService::new(
            Arc::new(fund_payment_repo),
            bus.clone(),
        ));
        let procedure_repo_arc: Arc<dyn ProcedureRepository> = Arc::new(procedure_repo);
        let procedure_service = Arc::new(ProcedureService::new(procedure_repo_arc, bus.clone()));
        FundPaymentReconciliationOrchestrator::new(
            fund_service,
            procedure_service,
            fund_payment_service,
            bus,
        )
    }

    /// FPA-260 (R17) — when `fund_label` resolves to an already-existing fund
    /// (no `n°` extraction needed, exact identifier match), the orchestrator
    /// reuses the fund and persists the group + reconciliation update.
    #[tokio::test]
    async fn create_fund_payment_from_candidate_resolves_existing_fund() -> anyhow::Result<()> {
        let mut fund_repo = MockFundRepository::new();
        fund_repo
            .expect_find_fund_by_identifier()
            .returning(|identifier| {
                Ok(Some(Fund::restore(
                    "fund-1".to_string(),
                    identifier.to_string(),
                    "CPAM 93".to_string(),
                )))
            });

        let mut fund_payment_repo = MockFundPaymentRepository::new();
        fund_payment_repo.expect_create_group().returning(
            |fund_id, payment_date, total_amount, procedure_ids| {
                let lines: Vec<FundPaymentLine> = procedure_ids
                    .into_iter()
                    .map(|pid| {
                        FundPaymentLine::restore("line-1".to_string(), "group-1".to_string(), pid)
                    })
                    .collect();
                Ok(FundPaymentGroup::restore(
                    "group-1".to_string(),
                    fund_id,
                    NaiveDate::parse_from_str(&payment_date, "%Y-%m-%d").unwrap(),
                    total_amount,
                    lines,
                    FundPaymentGroupStatus::Active,
                ))
            },
        );

        let mut procedure_repo = MockProcedureRepository::new();
        procedure_repo
            .expect_read_procedures_by_ids()
            .returning(|_| {
                Ok(vec![Procedure::restore(
                    "proc-1".to_string(),
                    "patient-1".to_string(),
                    Some("fund-1".to_string()),
                    "type-1".to_string(),
                    NaiveDate::from_ymd_opt(2026, 2, 1).unwrap(),
                    Some(50_000),
                    PaymentMethod::None,
                    None,
                    None,
                    None,
                    ProcedureStatus::Created,
                )])
            });
        procedure_repo
            .expect_update_batch()
            .withf(|procs| {
                procs
                    .iter()
                    .all(|p| matches!(p.payment_status, ProcedureStatus::Reconciled))
            })
            .returning(Ok);

        let orchestrator = make_orchestrator(fund_repo, fund_payment_repo, procedure_repo);
        let group = orchestrator
            .create_fund_payment_from_candidate(
                "CPAM93".to_string(),
                NaiveDate::from_ymd_opt(2026, 2, 1).unwrap(),
                50_000,
                vec!["proc-1".to_string()],
                None,
            )
            .await?;

        assert_eq!(group.total_amount, 50_000);
        assert_eq!(group.fund_id, "fund-1");
        Ok(())
    }

    /// FPA-050 (R3) edge — `is_duplicate_candidate` returns false (not Err)
    /// when the fund label cannot be resolved to an existing fund. Avoids a
    /// false-positive duplicate flag for a brand-new PDF.
    #[tokio::test]
    async fn is_duplicate_candidate_returns_false_when_fund_not_found() -> anyhow::Result<()> {
        let mut fund_repo = MockFundRepository::new();
        fund_repo
            .expect_find_fund_by_identifier()
            .returning(|_| Ok(None));

        let orchestrator = make_orchestrator(
            fund_repo,
            MockFundPaymentRepository::new(),
            MockProcedureRepository::new(),
        );

        let result = orchestrator
            .is_duplicate_candidate(
                "UNKNOWN FUND",
                NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
                50_000,
            )
            .await?;

        assert!(!result);
        Ok(())
    }

    fn make_candidate(
        fund_label: &str,
        payment_date: NaiveDate,
        total_amount: i64,
    ) -> super::super::api::FundPaymentCandidateFromPdf {
        super::super::api::FundPaymentCandidateFromPdf {
            fund_label: fund_label.to_string(),
            payment_date,
            total_amount,
            procedure_ids: vec![],
            matched_amount: total_amount,
            is_fully_covered: true,
        }
    }

    /// Empty candidate list is treated as "nothing to be a duplicate of" —
    /// the helper returns `false` so the frontend never enters the
    /// already-imported empty-state for a parse that yielded no groups.
    #[tokio::test]
    async fn all_candidates_are_duplicates_empty_returns_false() -> anyhow::Result<()> {
        let orchestrator = make_orchestrator(
            MockFundRepository::new(),
            MockFundPaymentRepository::new(),
            MockProcedureRepository::new(),
        );

        let result = orchestrator.all_candidates_are_duplicates(&[]).await?;

        assert!(!result);
        Ok(())
    }

    /// A single non-duplicate candidate short-circuits the helper to `false`,
    /// even when the rest of the list is duplicate — the frontend keeps the
    /// anomaly UI open so the new candidate can still be validated.
    #[tokio::test]
    async fn all_candidates_are_duplicates_mixed_returns_false() -> anyhow::Result<()> {
        let mut fund_repo = MockFundRepository::new();
        fund_repo
            .expect_find_fund_by_identifier()
            .returning(|identifier| {
                if identifier == "EXISTING" {
                    Ok(Some(Fund::restore(
                        "fund-1".to_string(),
                        "EXISTING".to_string(),
                        "Existing".to_string(),
                    )))
                } else {
                    Ok(None)
                }
            });

        let mut fund_payment_repo = MockFundPaymentRepository::new();
        fund_payment_repo
            .expect_exists_group()
            .returning(|_, _, _| Ok(true));

        let orchestrator =
            make_orchestrator(fund_repo, fund_payment_repo, MockProcedureRepository::new());

        let candidates = vec![
            make_candidate(
                "EXISTING",
                NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
                50_000,
            ),
            make_candidate(
                "BRAND NEW FUND",
                NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
                30_000,
            ),
        ];

        let result = orchestrator
            .all_candidates_are_duplicates(&candidates)
            .await?;

        assert!(!result);
        Ok(())
    }

    /// Every candidate maps to an existing fund-payment group → the helper
    /// returns `true` so the frontend renders the already-imported empty
    /// state without dispatching any downstream command.
    #[tokio::test]
    async fn all_candidates_are_duplicates_all_match_returns_true() -> anyhow::Result<()> {
        let mut fund_repo = MockFundRepository::new();
        fund_repo
            .expect_find_fund_by_identifier()
            .returning(|identifier| {
                Ok(Some(Fund::restore(
                    "fund-1".to_string(),
                    identifier.to_string(),
                    identifier.to_string(),
                )))
            });

        let mut fund_payment_repo = MockFundPaymentRepository::new();
        fund_payment_repo
            .expect_exists_group()
            .returning(|_, _, _| Ok(true));

        let orchestrator =
            make_orchestrator(fund_repo, fund_payment_repo, MockProcedureRepository::new());

        let candidates = vec![
            make_candidate(
                "FUND A",
                NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
                50_000,
            ),
            make_candidate(
                "FUND B",
                NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
                30_000,
            ),
        ];

        let result = orchestrator
            .all_candidates_are_duplicates(&candidates)
            .await?;

        assert!(result);
        Ok(())
    }

    /// Batch happy path — `create_multiple_from_candidates` with one
    /// non-duplicate candidate creates a group, sets the procedure to
    /// `Reconciled`, and returns the persisted group.
    #[tokio::test]
    async fn create_multiple_from_candidates_creates_groups() -> anyhow::Result<()> {
        let mut fund_repo = MockFundRepository::new();
        fund_repo
            .expect_find_fund_by_identifier()
            .returning(|_| Ok(None));
        fund_repo
            .expect_create_fund()
            .returning(|identifier, name| {
                Ok(Fund::restore(
                    "fund-1".to_string(),
                    identifier.to_string(),
                    name.to_string(),
                ))
            });

        let mut fund_payment_repo = MockFundPaymentRepository::new();
        fund_payment_repo
            .expect_create_batch_groups()
            .withf(|groups| groups.len() == 1 && groups[0].fund_id == "fund-1")
            .returning(Ok);

        let mut procedure_repo = MockProcedureRepository::new();
        procedure_repo
            .expect_read_procedures_by_ids()
            .returning(|_| {
                Ok(vec![Procedure::restore(
                    "proc-1".to_string(),
                    "patient-1".to_string(),
                    Some("fund-1".to_string()),
                    "type-1".to_string(),
                    NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
                    Some(75_000),
                    PaymentMethod::None,
                    None,
                    None,
                    None,
                    ProcedureStatus::Created,
                )])
            });
        // The orchestrator captures the updated batch via update_procedures_batch
        // and returns it from verify_group_integrity's per-line read_procedure.
        // Returning a Reconciled procedure here lets the integrity check pass
        // (paid_amount sum equals group total).
        procedure_repo
            .expect_update_batch()
            .withf(|procs| {
                procs
                    .iter()
                    .all(|p| matches!(p.payment_status, ProcedureStatus::Reconciled))
            })
            .returning(Ok);
        procedure_repo.expect_read_procedure().returning(|_| {
            Ok(Some(Procedure::restore(
                "proc-1".to_string(),
                "patient-1".to_string(),
                Some("fund-1".to_string()),
                "type-1".to_string(),
                NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
                Some(75_000),
                PaymentMethod::None,
                Some(NaiveDate::from_ymd_opt(2026, 1, 15).unwrap()),
                None,
                Some(75_000),
                ProcedureStatus::Reconciled,
            )))
        });

        let orchestrator = make_orchestrator(fund_repo, fund_payment_repo, procedure_repo);
        let groups = orchestrator
            .create_multiple_from_candidates(vec![FundPaymentGroupCandidate {
                fund_label: "CPAM n° 75".to_string(),
                payment_date: NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
                total_amount: 75_000,
                procedure_ids: vec!["proc-1".to_string()],
                matched_amount: 75_000,
                is_fully_covered: true,
            }])
            .await?;

        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].total_amount, 75_000);
        assert_eq!(groups[0].fund_id, "fund-1");
        Ok(())
    }

    /// Regression — `create_multiple_with_auto_corrections` MUST NOT mutate
    /// procedure rows (or create new patients / procedures) when every
    /// candidate is a duplicate of an existing fund-payment group. The
    /// duplicate check runs FIRST; if it fires, `apply_auto_corrections`
    /// never gets invoked. Mockall enforces the assertion via panic-on-
    /// unexpected-call: the procedure-repo and patient-repo mocks have
    /// zero expectations, so any DB-write attempt would crash the test.
    #[tokio::test]
    async fn create_multiple_with_auto_corrections_bails_before_writes_on_duplicates(
    ) -> anyhow::Result<()> {
        use crate::context::patient::{MockPatientRepository, PatientService};

        let mut fund_repo = MockFundRepository::new();
        fund_repo
            .expect_find_fund_by_identifier()
            .returning(|identifier| {
                Ok(Some(Fund::restore(
                    "fund-1".to_string(),
                    identifier.to_string(),
                    identifier.to_string(),
                )))
            });

        let mut fund_payment_repo = MockFundPaymentRepository::new();
        fund_payment_repo
            .expect_exists_group()
            .returning(|_, _, _| Ok(true));

        let procedure_repo = MockProcedureRepository::new();
        let patient_repo = MockPatientRepository::new();

        let orchestrator = make_orchestrator(fund_repo, fund_payment_repo, procedure_repo);
        let bus = Arc::new(EventBus::new());
        let patient_service = Arc::new(PatientService::new(Arc::new(patient_repo), bus));

        let result = orchestrator
            .create_multiple_with_auto_corrections(
                vec![FundPaymentGroupCandidate {
                    fund_label: "CPAM n° 75".to_string(),
                    payment_date: NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
                    total_amount: 75_000,
                    procedure_ids: vec!["proc-1".to_string()],
                    matched_amount: 75_000,
                    is_fully_covered: true,
                }],
                vec![AutoCorrection::AmountMismatch {
                    procedure_id: "proc-1".to_string(),
                    pdf_amount: 12_345,
                }],
                patient_service,
            )
            .await;

        assert!(
            result.is_err(),
            "all-duplicate batch must error, got: {:?}",
            result.as_ref().ok()
        );
        Ok(())
    }

    /// `verify_created_groups` short-circuits on an empty slice without
    /// touching any repository — important because the orchestrator emits
    /// the integrity check unconditionally at the end of the batch flow.
    #[tokio::test]
    async fn verify_created_groups_empty_list_is_noop() {
        let orchestrator = make_orchestrator(
            MockFundRepository::new(),
            MockFundPaymentRepository::new(),
            MockProcedureRepository::new(),
        );
        orchestrator.verify_created_groups(&[]).await;
    }
}

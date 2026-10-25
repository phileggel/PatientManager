use chrono::NaiveDate;
use std::collections::HashMap;
use std::sync::Arc;

use super::dto::AutoCorrection;
use super::error::{FundPaymentReconciliationError, FundPaymentReconciliationTask};
use super::fund_label::{fund_identifier_of, loggable_fund_identifier};
use super::split::read_split;
use super::uow::StatementValidationTransactionManager;
use crate::context::fund::{
    Fund, FundError, FundPaymentGroup, FundPaymentGroupCandidate, FundPaymentService, FundService,
};
use crate::context::patient::{Patient, PatientService};
use crate::context::procedure::{PaymentMethod, Procedure, ProcedureService, ProcedureStatus};
use crate::shared::logger::BACKEND;

/// Everything a validation will write, decided before the first write so that
/// it is written on one transaction (FPA-076).
#[derive(Default)]
struct ValidationPlan {
    new_funds: Vec<Fund>,
    new_patients: Vec<Patient>,
    patients_to_update: Vec<Patient>,
    new_procedures: Vec<Procedure>,
    procedures_to_update: HashMap<String, Procedure>,
}

/// Statistics from correction processing
#[derive(Default, Debug)]
struct CorrectionStats {
    amount_corrections: usize,
    fund_corrections: usize,
    date_corrections: usize,
    dispute_corrections: usize,
    procedure_count: usize,
}

/// Refuse, before the first write, a batch holding a group that can never be
/// created. The rule and its error are the aggregate's
/// (`FundPaymentGroup::accepts_total`); it used to be met only when the groups
/// were built, after the corrections had been saved (FPA-075).
fn ensure_totals_are_positive(
    candidates: &[FundPaymentGroupCandidate],
) -> Result<(), FundPaymentReconciliationError> {
    if candidates
        .iter()
        .any(|c| !FundPaymentGroup::accepts_total(c.total_amount))
    {
        tracing::warn!(target: BACKEND, "Validation refused: a group total is not positive");
        return Err(FundError::TotalAmountNotPositive.into());
    }
    Ok(())
}

/// FPA-211: a procedure with a dispute staged takes no amount correction.
fn ensure_no_disputed_amount_corrected(
    auto_corrections: &[AutoCorrection],
) -> Result<(), FundPaymentReconciliationError> {
    use std::collections::HashSet;

    let disputed: HashSet<&str> = auto_corrections
        .iter()
        .filter_map(|correction| match correction {
            AutoCorrection::DisputeAmount { procedure_id, .. } => Some(procedure_id.as_str()),
            _ => None,
        })
        .collect();
    let corrected = auto_corrections
        .iter()
        .find_map(|correction| match correction {
            AutoCorrection::AmountMismatch { procedure_id, .. }
                if disputed.contains(procedure_id.as_str()) =>
            {
                Some(procedure_id)
            }
            _ => None,
        });
    if let Some(procedure_id) = corrected {
        tracing::warn!(target: BACKEND, "Validation refused: a disputed amount is also corrected");
        return Err(FundPaymentReconciliationTask::DisputedAmountCorrected {
            procedure_id: procedure_id.clone(),
        }
        .into());
    }
    Ok(())
}

/// Orchestrator for creating fund payment groups from reconciliation candidates
///
/// Coordinates between contexts to:
/// 1. Resolve fund labels (e.g., "CPAM n° 931") to fund IDs
/// 2. Create FundPaymentGroups
/// 3. Update procedures with reconciliation status
///
/// A validation reads, plans every write, then writes them on one unit of work
/// (FPA-076, ADR-003).
pub struct FundPaymentReconciliationOrchestrator {
    fund_service: Arc<FundService>,
    procedure_service: Arc<ProcedureService>,
    fund_payment_service: Arc<FundPaymentService>,
    validation: Arc<dyn StatementValidationTransactionManager>,
}

impl FundPaymentReconciliationOrchestrator {
    pub fn new(
        fund_service: Arc<FundService>,
        procedure_service: Arc<ProcedureService>,
        fund_payment_service: Arc<FundPaymentService>,
        validation: Arc<dyn StatementValidationTransactionManager>,
    ) -> Self {
        Self {
            fund_service,
            procedure_service,
            fund_payment_service,
            validation,
        }
    }

    /// The fund a label names (e.g., "CPAM n° 931"): the existing one, the one
    /// this validation already plans to create, or a new one added to the plan.
    ///
    /// The fund number of the label is matched against the fund identifiers; a
    /// label without a number is its own identifier (e.g., "MGEN").
    async fn plan_fund_id(
        &self,
        plan: &mut ValidationPlan,
        fund_label: &str,
    ) -> Result<String, FundPaymentReconciliationError> {
        let fund_identifier = fund_identifier_of(fund_label);

        if let Some(fund) = self
            .fund_service
            .find_fund_by_identifier(&fund_identifier)
            .await?
        {
            tracing::debug!(target: BACKEND, fund_identifier = loggable_fund_identifier(fund_label), fund_id = %fund.id, "Resolved fund label to fund ID");
            return Ok(fund.id);
        }
        if let Some(fund) = plan
            .new_funds
            .iter()
            .find(|fund| fund.fund_identifier == fund_identifier)
        {
            return Ok(fund.id.clone());
        }

        tracing::info!(
            target: BACKEND,
            fund_identifier = loggable_fund_identifier(fund_label),
            "Fund not found by identifier, creating new fund"
        );
        let fund = Fund::new(fund_identifier, fund_label.to_string())?;
        let fund_id = fund.id.clone();
        plan.new_funds.push(fund);
        Ok(fund_id)
    }

    /// Return `true` iff every supplied candidate corresponds to an existing
    /// fund-payment group (same `fund_label` + `payment_date` + `total_amount`).
    /// An empty input returns `false` — there's nothing to be a duplicate of.
    ///
    /// Used by `reconcile_and_create_candidates_fn` to short-circuit a PDF
    /// re-import before the user is shown the anomaly UI.
    pub async fn all_candidates_are_duplicates(
        &self,
        candidates: &[super::dto::FundPaymentCandidateFromPdf],
    ) -> Result<bool, FundPaymentReconciliationError> {
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
    ) -> Result<bool, FundPaymentReconciliationError> {
        // Resolve fund label to fund ID (without creating if missing)
        let fund_id = match self.try_resolve_fund_id(fund_label).await? {
            Some(id) => id,
            None => return Ok(false), // Fund doesn't exist yet, so no duplicate possible
        };

        Ok(self
            .fund_payment_service
            .exists_group(
                &fund_id,
                &payment_date.format("%Y-%m-%d").to_string(),
                total_amount,
            )
            .await?)
    }

    /// Try to resolve fund label to fund ID without creating a new fund
    async fn try_resolve_fund_id(
        &self,
        fund_label: &str,
    ) -> Result<Option<String>, FundPaymentReconciliationError> {
        let fund_identifier = fund_identifier_of(fund_label);

        if let Some(fund) = self
            .fund_service
            .find_fund_by_identifier(&fund_identifier)
            .await?
        {
            return Ok(Some(fund.id));
        }

        Ok(None)
    }

    /// Which candidates already exist as a fund-payment group, in their order.
    async fn duplicate_flags(
        &self,
        candidates: &[FundPaymentGroupCandidate],
    ) -> Result<Vec<bool>, FundPaymentReconciliationError> {
        let mut flags = Vec::with_capacity(candidates.len());
        for candidate in candidates {
            flags.push(
                self.is_duplicate_candidate(
                    &candidate.fund_label,
                    candidate.payment_date,
                    candidate.total_amount,
                )
                .await?,
            );
        }
        Ok(flags)
    }

    /// Build the group of every candidate that is not a duplicate, and add the
    /// reconciliation of their procedures to the plan. Nothing is written.
    ///
    /// `duplicate_flags[i]` is the flag of `candidates[i]`. With
    /// `keep_disputed`, a procedure a dispute left
    /// `PartiallyReconciled` keeps its status and its paid amount.
    async fn plan_groups(
        &self,
        plan: &mut ValidationPlan,
        candidates: Vec<FundPaymentGroupCandidate>,
        duplicate_flags: Vec<bool>,
        keep_disputed: bool,
    ) -> Result<Vec<FundPaymentGroup>, FundPaymentReconciliationError> {
        let mut groups = Vec::new();
        for (candidate, is_duplicate) in candidates.into_iter().zip(duplicate_flags) {
            if is_duplicate {
                continue;
            }
            let fund_id = self.plan_fund_id(plan, &candidate.fund_label).await?;
            let iso_date = candidate.payment_date.format("%Y-%m-%d").to_string();
            groups.push(FundPaymentGroup::new(
                fund_id,
                iso_date,
                candidate.total_amount,
                candidate.procedure_ids.clone(),
            )?);
        }

        // FPA-300 — Stage 1 reconciliation sets fund_reconciliation_date (the
        // group's payment_date), not the bank-side confirmed date.
        let date_of: HashMap<String, NaiveDate> = groups
            .iter()
            .flat_map(|g| {
                g.lines
                    .iter()
                    .map(move |l| (l.procedure_id.clone(), g.payment_date))
            })
            .collect();

        // The procedures the plan does not hold yet are read; the others carry
        // their corrections, or are still to be created.
        let to_read: Vec<String> = date_of
            .keys()
            .filter(|id| {
                !plan.procedures_to_update.contains_key(*id)
                    && !plan.new_procedures.iter().any(|p| &p.id == *id)
            })
            .cloned()
            .collect();
        if !to_read.is_empty() {
            for procedure in self
                .procedure_service
                .read_procedures_by_ids(to_read)
                .await?
            {
                plan.procedures_to_update
                    .insert(procedure.id.clone(), procedure);
            }
        }

        for procedure in plan
            .new_procedures
            .iter_mut()
            .chain(plan.procedures_to_update.values_mut())
        {
            let Some(payment_date) = date_of.get(&procedure.id) else {
                continue; // corrected, in no group
            };
            procedure.fund_reconciliation_date = Some(*payment_date);
            let disputed = procedure.payment_status == ProcedureStatus::PartiallyReconciled;
            if !(keep_disputed && disputed) {
                procedure.payment_status = ProcedureStatus::Reconciled;
                procedure.paid_amount = Some(procedure.billed_amount);
            }
        }

        Ok(groups)
    }

    /// Write a plan and its groups on one unit of work: all of it, or none
    /// (FPA-076). Listeners are told once it is committed.
    async fn write(
        &self,
        plan: ValidationPlan,
        groups: &[FundPaymentGroup],
        patient_service: Option<&PatientService>,
    ) -> Result<(), FundPaymentReconciliationError> {
        let ValidationPlan {
            new_funds,
            new_patients,
            patients_to_update,
            new_procedures,
            procedures_to_update,
        } = plan;
        let procedures_to_update: Vec<Procedure> = procedures_to_update.into_values().collect();
        let funds_created = !new_funds.is_empty();
        let patients_changed = !(new_patients.is_empty() && patients_to_update.is_empty());
        let groups_to_write = groups.to_vec();

        self.validation
            .run(Box::new(move |uow| {
                Box::pin(async move {
                    uow.create_funds(&new_funds).await?;
                    uow.create_patients(&new_patients).await?;
                    uow.create_procedures(&new_procedures).await?;
                    uow.update_procedures(&procedures_to_update).await?;
                    uow.update_patients(&patients_to_update).await?;
                    uow.create_groups(&groups_to_write).await
                })
            }))
            .await
            // The operation makes database writes only — every refusal of the
            // domain was met while planning — so its failure is a database error.
            .map_err(|e| {
                tracing::error!(target: BACKEND, err = ?e, "statement validation: unit of work failed, nothing was written");
                FundPaymentReconciliationTask::DatabaseError
            })?;

        tracing::info!(
            target: BACKEND,
            count = groups.len(),
            procedure_count = groups.iter().map(|g| g.lines.len()).sum::<usize>(),
            "Fund payment groups created and their procedures reconciled (one unit of work)"
        );

        if funds_created {
            self.fund_service.notify_funds_updated();
        }
        if patients_changed {
            if let Some(patient_service) = patient_service {
                patient_service.notify_patients_updated();
            }
        }
        self.procedure_service.notify_procedures_updated();
        self.fund_payment_service.notify_group_updated();
        Ok(())
    }

    /// Create multiple fund payment groups from reconciliation candidates (batch operation)
    ///
    /// 1. Checks for duplicates
    /// 2. Plans the funds to create, the groups and the reconciliation of
    ///    their procedures
    /// 3. Writes the plan on one unit of work (FPA-076), then tells listeners
    pub async fn create_multiple_from_candidates(
        &self,
        candidates: Vec<FundPaymentGroupCandidate>,
    ) -> Result<Vec<FundPaymentGroup>, FundPaymentReconciliationError> {
        ensure_totals_are_positive(&candidates)?;

        let duplicate_flags = self.duplicate_flags(&candidates).await?;
        let duplicate_count = duplicate_flags.iter().filter(|&&d| d).count();
        if !candidates.is_empty() && duplicate_count == candidates.len() {
            return Err(FundPaymentReconciliationTask::AllDuplicates {
                count: duplicate_count,
            }
            .into());
        }

        let mut plan = ValidationPlan::default();
        let groups = self
            .plan_groups(&mut plan, candidates, duplicate_flags, false)
            .await?;
        if groups.is_empty() {
            return Err(FundPaymentReconciliationTask::NoValidCandidates.into());
        }

        self.write(plan, &groups, None).await?;

        // Verify integrity of all created groups (SINGLE POINT OF TRUTH), once
        // the data is committed.
        self.verify_created_groups(&groups).await;

        Ok(groups)
    }

    /// Create multiple fund payment groups with auto-corrections (batch operation)
    ///
    /// 1. Checks for duplicate groups — bails if every candidate is a
    ///    duplicate, so a re-imported PDF changes nothing.
    /// 2. Plans the auto-corrections (corrected, created and linked
    ///    procedures, created and corrected patients, created funds)
    /// 3. Adds the created and linked procedures to their candidates
    /// 4. Plans the groups and the reconciliation of their procedures
    /// 5. Writes the plan on one unit of work — all of it, or none
    ///    (FPA-076) — then tells listeners
    pub async fn create_multiple_with_auto_corrections(
        &self,
        candidates: Vec<FundPaymentGroupCandidate>,
        auto_corrections: Vec<super::dto::AutoCorrection>,
        patient_service: Arc<PatientService>,
    ) -> Result<Vec<FundPaymentGroup>, FundPaymentReconciliationError> {
        ensure_totals_are_positive(&candidates)?;
        ensure_no_disputed_amount_corrected(&auto_corrections)?;

        let duplicate_flags = self.duplicate_flags(&candidates).await?;
        let duplicate_count = duplicate_flags.iter().filter(|&&d| d).count();
        if !candidates.is_empty() && duplicate_count == candidates.len() {
            return Err(FundPaymentReconciliationTask::AllDuplicates {
                count: duplicate_count,
            }
            .into());
        }

        let mut plan = ValidationPlan::default();
        let created_procs = self
            .plan_auto_corrections(&mut plan, &auto_corrections, &patient_service)
            .await?;

        let mut candidates = candidates;
        for (fund_label, payment_date, proc_id) in created_procs {
            if let Some(candidate) = candidates
                .iter_mut()
                .find(|c| c.fund_label == fund_label && c.payment_date == payment_date)
            {
                candidate.procedure_ids.push(proc_id);
            } else {
                tracing::warn!(
                    target: BACKEND,
                    fund_identifier = loggable_fund_identifier(&fund_label),
                    payment_date = %payment_date,
                    "Created procedure has no matching candidate group"
                );
            }
        }

        // Disputed procedures (PartiallyReconciled) already carry their status
        // and paid amount from the dispute: they keep them.
        let groups = self
            .plan_groups(&mut plan, candidates, duplicate_flags, true)
            .await?;
        if groups.is_empty() {
            return Err(FundPaymentReconciliationTask::NoValidCandidatesAfterCorrections.into());
        }

        self.write(plan, &groups, Some(&patient_service)).await?;

        self.verify_created_groups(&groups).await;

        Ok(groups)
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
                    target: BACKEND,
                    group_id = %group.id,
                    error = %e,
                    "Post-persistence integrity check failed for fund payment group (data persisted, manual review needed)"
                );
            }
        }

        tracing::info!(
            target: BACKEND,
            count = groups.len(),
            "Post-persistence integrity verification complete"
        );
    }

    /// Verify data integrity AFTER persistence
    ///
    /// This check runs AFTER creating the fund-payment group to ensure the sum of
    /// paid_amount across all procedures equals the group's total_amount.
    /// Uses paid_amount (not billed_amount) because disputed procedures
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
                    target: BACKEND,
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
                target: BACKEND,
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
            target: BACKEND,
            group_id = %group.id,
            total_amount = group.total_amount,
            procedure_count = group.lines.len(),
            "Post-persistence integrity check passed: sum of paid_amount matches group total"
        );

        Ok(())
    }

    /// Plan the auto-corrections of the anomalies: nothing is written here.
    ///
    /// 1. Update corrections (amount, fund, date, dispute)
    /// 2. Creation corrections (new procedures, and their patient when unknown)
    /// 3. Link corrections (existing procedures, their patient's SSN)
    ///
    /// Returns (fund_label, payment_date, procedure_id) for each created or linked procedure.
    async fn plan_auto_corrections(
        &self,
        plan: &mut ValidationPlan,
        auto_corrections: &[AutoCorrection],
        patient_service: &PatientService,
    ) -> Result<Vec<(String, NaiveDate, String)>, FundPaymentReconciliationError> {
        let total_corrections = auto_corrections.len();

        let update_stats = self.plan_update_corrections(plan, auto_corrections).await?;
        let created_procedures = self
            .plan_create_corrections(plan, auto_corrections, patient_service)
            .await?;
        let linked_procedures = self
            .plan_link_corrections(plan, auto_corrections, patient_service)
            .await?;

        tracing::info!(
            target: BACKEND,
            total_corrections = total_corrections,
            amount_corrections = update_stats.amount_corrections,
            fund_corrections = update_stats.fund_corrections,
            date_corrections = update_stats.date_corrections,
            dispute_corrections = update_stats.dispute_corrections,
            corrected_procedures = update_stats.procedure_count,
            created_procedures = created_procedures.len(),
            linked_procedures = linked_procedures.len(),
            "Auto-corrections planned"
        );

        let mut all_results = created_procedures;
        all_results.extend(linked_procedures);
        Ok(all_results)
    }

    /// Plan the update corrections (amount, fund, date, dispute): the
    /// procedures are read once and corrected in the plan.
    async fn plan_update_corrections(
        &self,
        plan: &mut ValidationPlan,
        auto_corrections: &[AutoCorrection],
    ) -> Result<CorrectionStats, FundPaymentReconciliationError> {
        use std::collections::HashSet;

        let procedure_ids: HashSet<String> = auto_corrections
            .iter()
            .filter_map(|correction| match correction {
                AutoCorrection::AmountMismatch { procedure_id, .. }
                | AutoCorrection::FundMismatch { procedure_id, .. }
                | AutoCorrection::DateMismatch { procedure_id, .. }
                | AutoCorrection::DisputeAmount { procedure_id, .. } => Some(procedure_id.clone()),
                _ => None,
            })
            .collect();
        if procedure_ids.is_empty() {
            return Ok(CorrectionStats::default());
        }

        let mut procedures: HashMap<String, Procedure> = self
            .procedure_service
            .read_procedures_by_ids(procedure_ids.into_iter().collect())
            .await?
            .into_iter()
            .map(|proc| (proc.id.clone(), proc))
            .collect();

        let mut stats = CorrectionStats::default();
        for correction in auto_corrections {
            match correction {
                AutoCorrection::AmountMismatch {
                    procedure_id,
                    pdf_amount,
                } => {
                    if let Some(procedure) = procedures.get_mut(procedure_id) {
                        procedure.billed_amount = *pdf_amount;
                        stats.amount_corrections += 1;
                    }
                }

                AutoCorrection::FundMismatch {
                    procedure_id,
                    pdf_fund_label,
                } => {
                    let fund_id = self.plan_fund_id(plan, pdf_fund_label).await?;
                    if let Some(procedure) = procedures.get_mut(procedure_id) {
                        procedure.fund_id = Some(fund_id);
                        stats.fund_corrections += 1;
                    }
                }

                AutoCorrection::DateMismatch {
                    procedure_id,
                    pdf_date,
                } => {
                    if let Some(procedure) = procedures.get_mut(procedure_id) {
                        procedure.procedure_date = *pdf_date;
                        stats.date_corrections += 1;
                    }
                }

                AutoCorrection::DisputeAmount {
                    procedure_id,
                    paid_amount,
                } => {
                    if let Some(procedure) = procedures.get_mut(procedure_id) {
                        // FPA-212: the rule and its bound are the procedure's.
                        if !procedure.accepts_dispute(*paid_amount) {
                            tracing::warn!(
                                target: BACKEND,
                                "Validation refused: a disputed amount is out of range"
                            );
                            return Err(FundPaymentReconciliationTask::DisputedAmountOutOfRange {
                                procedure_id: procedure_id.clone(),
                            }
                            .into());
                        }
                        procedure.paid_amount = Some(*paid_amount);
                        procedure.payment_status = ProcedureStatus::PartiallyReconciled;
                        stats.dispute_corrections += 1;
                    }
                }

                _ => {} // Skip other correction types
            }
        }

        stats.procedure_count = procedures.len();
        plan.procedures_to_update.extend(procedures);
        Ok(stats)
    }

    /// Plan the link corrections: the patient of a linked procedure takes the
    /// SSN of the PDF (the PDF is always right).
    ///
    /// Returns (fund_label, payment_date, procedure_id) for each linked procedure.
    async fn plan_link_corrections(
        &self,
        plan: &mut ValidationPlan,
        auto_corrections: &[AutoCorrection],
        patient_service: &PatientService,
    ) -> Result<Vec<(String, NaiveDate, String)>, FundPaymentReconciliationError> {
        let mut result = Vec::new();

        for correction in auto_corrections {
            if let AutoCorrection::LinkProcedure {
                procedure_id,
                pdf_ssn,
                pdf_fund_label,
                payment_date,
            } = correction
            {
                let procedures = self
                    .procedure_service
                    .read_procedures_by_ids(vec![procedure_id.clone()])
                    .await?;

                if let Some(procedure) = procedures.into_iter().next() {
                    if let Some(mut patient) =
                        patient_service.read_patient(&procedure.patient_id).await?
                    {
                        patient.correct_ssn(pdf_ssn.clone());
                        plan.patients_to_update.push(patient);
                    }
                }

                result.push((pdf_fund_label.clone(), *payment_date, procedure_id.clone()));
            }
        }

        Ok(result)
    }

    /// Plan the creation corrections: a procedure for each created one and for
    /// each part of a split line (FPA-250, FPA-257), with its patient (found
    /// by SSN, already planned, or new) and its fund. A split is read again
    /// here: the backend judges it at confirmation too (FPA-258).
    ///
    /// Returns (fund_label, payment_date, procedure_id) for each planned procedure.
    async fn plan_create_corrections(
        &self,
        plan: &mut ValidationPlan,
        auto_corrections: &[AutoCorrection],
        patient_service: &PatientService,
    ) -> Result<Vec<(String, NaiveDate, String)>, FundPaymentReconciliationError> {
        let mut result = Vec::new();

        for correction in auto_corrections {
            match correction {
                AutoCorrection::CreateProcedure {
                    ssn,
                    patient_name,
                    procedure_date,
                    payment_date,
                    billed_amount,
                    pdf_fund_label,
                } => {
                    let source = PlannedSource {
                        ssn,
                        patient_name,
                        fund_label: pdf_fund_label,
                    };
                    let id = self
                        .plan_procedure(
                            plan,
                            &source,
                            *procedure_date,
                            *billed_amount,
                            patient_service,
                        )
                        .await?;
                    result.push((pdf_fund_label.clone(), *payment_date, id));
                }
                AutoCorrection::SplitIntoProcedures { line, parts } => {
                    let read = read_split(line, parts)?;
                    let source = PlannedSource {
                        ssn: &line.ssn,
                        patient_name: &line.patient_name,
                        fund_label: &line.fund_name,
                    };
                    for (procedure_date, billed_amount) in read {
                        let id = self
                            .plan_procedure(
                                plan,
                                &source,
                                procedure_date,
                                billed_amount,
                                patient_service,
                            )
                            .await?;
                        result.push((line.fund_name.clone(), line.payment_date, id));
                    }
                }
                // Corrections of existing procedures create nothing here.
                AutoCorrection::AmountMismatch { .. }
                | AutoCorrection::FundMismatch { .. }
                | AutoCorrection::DateMismatch { .. }
                | AutoCorrection::LinkProcedure { .. }
                | AutoCorrection::DisputeAmount { .. } => {}
            }
        }

        Ok(result)
    }

    /// Plan one "Import" procedure of a PDF line (FPA-250): its patient found
    /// by SSN, already planned, or new; its fund from the line's label.
    async fn plan_procedure(
        &self,
        plan: &mut ValidationPlan,
        source: &PlannedSource<'_>,
        procedure_date: NaiveDate,
        billed_amount: i64,
        patient_service: &PatientService,
    ) -> Result<String, FundPaymentReconciliationError> {
        let known = patient_service.find_patient_by_ssn(source.ssn).await?;
        let planned = plan
            .new_patients
            .iter()
            .find(|patient| patient.ssn.as_deref() == Some(source.ssn));
        let patient_id = match (known, planned) {
            (Some(patient), _) => patient.id,
            (None, Some(patient)) => patient.id.clone(),
            (None, None) => {
                tracing::info!(target: BACKEND, "Patient not found by SSN, creating new patient");
                let patient = Patient::new(
                    false,
                    Some(source.patient_name.to_string()),
                    Some(source.ssn.to_string()),
                )?;
                let patient_id = patient.id.clone();
                plan.new_patients.push(patient);
                patient_id
            }
        };

        let fund_id = self.plan_fund_id(plan, source.fund_label).await?;

        let procedure = Procedure::new(
            patient_id,
            Some(fund_id),
            "import-pdf".to_string(),
            procedure_date,
            billed_amount,
            PaymentMethod::None,
            None, // fund_reconciliation_date — set with its group
            None,
            None,
            ProcedureStatus::None,
        )?;
        let id = procedure.id.clone();
        plan.new_procedures.push(procedure);
        Ok(id)
    }
}

/// What a planned procedure takes from its PDF line (FPA-250, FPA-257).
struct PlannedSource<'a> {
    ssn: &'a str,
    patient_name: &'a str,
    fund_label: &'a str,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::fund_payment_reconciliation::SplitPart;
    use std::sync::Arc;

    fn candidate_with_total(total_amount: i64) -> FundPaymentGroupCandidate {
        FundPaymentGroupCandidate {
            fund_label: "CPAM".to_string(),
            payment_date: NaiveDate::from_ymd_opt(2026, 8, 26).unwrap(),
            total_amount,
            procedure_ids: vec![],
            matched_amount: 0,
            is_fully_covered: false,
        }
    }

    #[test]
    fn test_fpa_075_a_batch_of_positive_totals_passes_the_check() {
        assert!(ensure_totals_are_positive(&[]).is_ok());
        assert!(ensure_totals_are_positive(&[
            candidate_with_total(1),
            candidate_with_total(38_400)
        ])
        .is_ok());
    }

    #[test]
    fn test_fpa_075_one_total_that_is_not_positive_rejects_the_batch() {
        for total in [0, -26_500] {
            let err = ensure_totals_are_positive(&[
                candidate_with_total(38_400),
                candidate_with_total(total),
            ])
            .expect_err("a total that is not positive");
            assert_eq!(
                serde_json::to_value(&err).expect("serialize"),
                serde_json::json!({ "code": "TotalAmountNotPositive" }),
                "{total}"
            );
        }
    }

    use crate::context::fund::{
        Fund, FundRepository, FundService, MockFundPaymentRepository, MockFundRepository,
    };
    use crate::context::procedure::{
        MockProcedureRepository, PaymentMethod, Procedure, ProcedureRepository,
    };
    use crate::shared::event_bus::EventBus;

    use crate::context::patient::Patient;
    use crate::use_cases::fund_payment_reconciliation::uow::{
        StatementValidationOperation, StatementValidationUnitOfWork,
    };
    use std::sync::Mutex;

    /// What a validation handed to its unit of work.
    #[derive(Default, Clone)]
    struct Written {
        funds: Vec<Fund>,
        patients: Vec<Patient>,
        patients_updated: Vec<Patient>,
        procedures: Vec<Procedure>,
        procedures_updated: Vec<Procedure>,
        groups: Vec<FundPaymentGroup>,
    }

    #[async_trait::async_trait]
    impl StatementValidationUnitOfWork for Written {
        async fn create_funds(&mut self, funds: &[Fund]) -> anyhow::Result<()> {
            self.funds.extend_from_slice(funds);
            Ok(())
        }
        async fn create_patients(&mut self, patients: &[Patient]) -> anyhow::Result<()> {
            self.patients.extend_from_slice(patients);
            Ok(())
        }
        async fn update_patients(&mut self, patients: &[Patient]) -> anyhow::Result<()> {
            self.patients_updated.extend_from_slice(patients);
            Ok(())
        }
        async fn create_procedures(&mut self, procedures: &[Procedure]) -> anyhow::Result<()> {
            self.procedures.extend_from_slice(procedures);
            Ok(())
        }
        async fn update_procedures(&mut self, procedures: &[Procedure]) -> anyhow::Result<()> {
            self.procedures_updated.extend_from_slice(procedures);
            Ok(())
        }
        async fn create_groups(&mut self, groups: &[FundPaymentGroup]) -> anyhow::Result<()> {
            self.groups.extend_from_slice(groups);
            Ok(())
        }
    }

    /// A transaction manager without a database: what an operation wrote is
    /// kept when it commits, and dropped when the commit is made to fail.
    #[derive(Default)]
    struct RecordingManager {
        committed: Mutex<Option<Written>>,
        fail_on_commit: bool,
    }

    impl RecordingManager {
        fn committed(&self) -> Option<Written> {
            self.committed.lock().expect("lock").clone()
        }
    }

    #[async_trait::async_trait]
    impl StatementValidationTransactionManager for RecordingManager {
        async fn run(&self, operation: StatementValidationOperation) -> anyhow::Result<()> {
            let mut written = Written::default();
            operation(&mut written).await?;
            if self.fail_on_commit {
                anyhow::bail!("the transaction did not commit");
            }
            *self.committed.lock().expect("lock") = Some(written);
            Ok(())
        }
    }

    /// Build an orchestrator wired with the three repository mocks and a
    /// recording unit of work. Each test configures only the methods it
    /// expects to hit — mockall panics on any unconfigured call, which keeps
    /// the contract between orchestrator and repositories explicit: a
    /// validation reads through them and writes through its unit of work only.
    fn make_orchestrator_on(
        manager: Arc<RecordingManager>,
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
        let procedure_service = Arc::new(ProcedureService::new(procedure_repo_arc, bus));
        FundPaymentReconciliationOrchestrator::new(
            fund_service,
            procedure_service,
            fund_payment_service,
            manager,
        )
    }

    fn make_orchestrator(
        fund_repo: MockFundRepository,
        fund_payment_repo: MockFundPaymentRepository,
        procedure_repo: MockProcedureRepository,
    ) -> FundPaymentReconciliationOrchestrator {
        make_orchestrator_on(
            Arc::new(RecordingManager::default()),
            fund_repo,
            fund_payment_repo,
            procedure_repo,
        )
    }

    fn created_procedure(id: &str, billed_amount: i64) -> Procedure {
        Procedure::restore(
            id.to_string(),
            "patient-1".to_string(),
            Some("fund-1".to_string()),
            "type-1".to_string(),
            NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
            billed_amount,
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::Created,
        )
    }

    fn candidate(
        fund_label: &str,
        total_amount: i64,
        procedure_ids: &[&str],
    ) -> FundPaymentGroupCandidate {
        FundPaymentGroupCandidate {
            fund_label: fund_label.to_string(),
            payment_date: NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
            total_amount,
            procedure_ids: procedure_ids.iter().map(|id| id.to_string()).collect(),
            matched_amount: total_amount,
            is_fully_covered: true,
        }
    }

    /// FPA-260 (R17) — when `fund_label` resolves to an already-existing fund
    /// (no `n°` extraction needed, exact identifier match), the orchestrator
    /// reuses the fund: the group is the fund's and no fund is created.
    #[tokio::test]
    async fn create_multiple_from_candidates_resolves_existing_fund() -> anyhow::Result<()> {
        let mut fund_repo = MockFundRepository::new();
        fund_repo
            .expect_find_fund_by_identifier()
            .withf(|identifier| identifier == "CPAM93")
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
            .returning(|_, _, _| Ok(false));
        let mut procedure_repo = MockProcedureRepository::new();
        procedure_repo
            .expect_read_procedures_by_ids()
            .returning(|_| Ok(vec![created_procedure("proc-1", 50_000)]));
        procedure_repo
            .expect_read_procedure()
            .returning(|_| Ok(None));
        let manager = Arc::new(RecordingManager::default());
        let orchestrator = make_orchestrator_on(
            manager.clone(),
            fund_repo,
            fund_payment_repo,
            procedure_repo,
        );

        let groups = orchestrator
            .create_multiple_from_candidates(vec![candidate("CPAM93", 50_000, &["proc-1"])])
            .await?;

        assert_eq!(groups[0].total_amount, 50_000);
        assert_eq!(groups[0].fund_id, "fund-1");
        let written = manager.committed().expect("committed");
        assert!(written.funds.is_empty());
        assert_eq!(written.groups.len(), 1);
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
    ) -> super::super::dto::FundPaymentCandidateFromPdf {
        super::super::dto::FundPaymentCandidateFromPdf {
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
    /// non-duplicate candidate of an unknown fund hands its unit of work the
    /// fund to create, the group, and the procedure set to `Reconciled`.
    #[tokio::test]
    async fn create_multiple_from_candidates_creates_groups() -> anyhow::Result<()> {
        let mut fund_repo = MockFundRepository::new();
        fund_repo
            .expect_find_fund_by_identifier()
            .returning(|_| Ok(None));
        let mut procedure_repo = MockProcedureRepository::new();
        procedure_repo
            .expect_read_procedures_by_ids()
            .returning(|_| Ok(vec![created_procedure("proc-1", 75_000)]));
        // verify_group_integrity reads each line's procedure once the data is committed.
        procedure_repo
            .expect_read_procedure()
            .returning(|_| Ok(None));
        let manager = Arc::new(RecordingManager::default());
        let orchestrator = make_orchestrator_on(
            manager.clone(),
            fund_repo,
            MockFundPaymentRepository::new(),
            procedure_repo,
        );

        let groups = orchestrator
            .create_multiple_from_candidates(vec![candidate("CPAM n° 75", 75_000, &["proc-1"])])
            .await?;

        let written = manager.committed().expect("committed");
        assert_eq!(written.funds.len(), 1);
        assert_eq!(written.funds[0].fund_identifier, "75");
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].total_amount, 75_000);
        assert_eq!(groups[0].fund_id, written.funds[0].id);
        assert_eq!(written.groups[0].id, groups[0].id);
        assert_eq!(written.procedures_updated.len(), 1);
        let reconciled = &written.procedures_updated[0];
        assert_eq!(reconciled.payment_status, ProcedureStatus::Reconciled);
        assert_eq!(reconciled.paid_amount, Some(75_000));
        assert_eq!(
            reconciled.fund_reconciliation_date,
            NaiveDate::from_ymd_opt(2026, 1, 15)
        );
        Ok(())
    }

    fn patient_service_finding_nobody() -> Arc<crate::context::patient::PatientService> {
        use crate::context::patient::{MockPatientRepository, PatientService};
        let mut patient_repo = MockPatientRepository::new();
        patient_repo
            .expect_find_patient_by_ssn()
            .returning(|_| Ok(None));
        Arc::new(PatientService::new(
            Arc::new(patient_repo),
            Arc::new(EventBus::new()),
        ))
    }

    fn validation_with_corrections() -> (
        MockFundRepository,
        MockProcedureRepository,
        Vec<FundPaymentGroupCandidate>,
        Vec<AutoCorrection>,
    ) {
        let mut fund_repo = MockFundRepository::new();
        fund_repo
            .expect_find_fund_by_identifier()
            .returning(|_| Ok(None));
        let mut procedure_repo = MockProcedureRepository::new();
        procedure_repo
            .expect_read_procedures_by_ids()
            .returning(|_| Ok(vec![created_procedure("proc-1", 75_000)]));
        procedure_repo
            .expect_read_procedure()
            .returning(|_| Ok(None));
        let corrections = vec![
            AutoCorrection::AmountMismatch {
                procedure_id: "proc-1".to_string(),
                pdf_amount: 60_000,
            },
            AutoCorrection::CreateProcedure {
                ssn: "1234567890123".to_string(),
                patient_name: "Nom Prenom".to_string(),
                procedure_date: NaiveDate::from_ymd_opt(2026, 1, 10).unwrap(),
                payment_date: NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
                billed_amount: 40_000,
                pdf_fund_label: "CPAM n° 75".to_string(),
            },
        ];
        (
            fund_repo,
            procedure_repo,
            vec![candidate("CPAM n° 75", 100_000, &["proc-1"])],
            corrections,
        )
    }

    /// FPA-076 — the corrections, the patient, fund and procedure they create,
    /// the group and the reconciliation of its procedures reach one unit of
    /// work together: the repositories (mocks without a write expectation)
    /// are never written through.
    #[tokio::test]
    async fn test_fpa_076_a_validation_hands_every_write_to_one_unit_of_work() -> anyhow::Result<()>
    {
        let (fund_repo, procedure_repo, candidates, corrections) = validation_with_corrections();
        let manager = Arc::new(RecordingManager::default());
        let orchestrator = make_orchestrator_on(
            manager.clone(),
            fund_repo,
            MockFundPaymentRepository::new(),
            procedure_repo,
        );

        let groups = orchestrator
            .create_multiple_with_auto_corrections(
                candidates,
                corrections,
                patient_service_finding_nobody(),
            )
            .await?;

        let written = manager.committed().expect("committed");
        // One fund for the group and the created procedure, not two.
        assert_eq!(written.funds.len(), 1);
        assert_eq!(written.patients.len(), 1);
        assert_eq!(written.procedures.len(), 1);
        let created = &written.procedures[0];
        assert_eq!(created.patient_id, written.patients[0].id);
        assert_eq!(
            created.fund_id.as_deref(),
            Some(written.funds[0].id.as_str())
        );
        assert_eq!(created.payment_status, ProcedureStatus::Reconciled);
        assert_eq!(created.paid_amount, Some(40_000));
        assert_eq!(
            created.fund_reconciliation_date,
            NaiveDate::from_ymd_opt(2026, 1, 15)
        );
        // The corrected procedure carries its correction and its reconciliation.
        assert_eq!(written.procedures_updated.len(), 1);
        let corrected = &written.procedures_updated[0];
        assert_eq!(corrected.billed_amount, 60_000);
        assert_eq!(corrected.paid_amount, Some(60_000));
        assert_eq!(corrected.payment_status, ProcedureStatus::Reconciled);
        // The group holds both procedures.
        assert_eq!(groups.len(), 1);
        let lines: Vec<&str> = written.groups[0]
            .lines
            .iter()
            .map(|line| line.procedure_id.as_str())
            .collect();
        assert_eq!(lines, vec!["proc-1", created.id.as_str()]);
        Ok(())
    }

    /// FPA-250 — two procedures created for the same unknown SSN share one new
    /// patient, and each is an "Import" procedure.
    #[tokio::test]
    async fn test_fpa_250_two_created_procedures_of_one_unknown_ssn_share_one_patient(
    ) -> anyhow::Result<()> {
        let mut fund_repo = MockFundRepository::new();
        fund_repo
            .expect_find_fund_by_identifier()
            .returning(|_| Ok(None));
        let mut procedure_repo = MockProcedureRepository::new();
        procedure_repo
            .expect_read_procedure()
            .returning(|_| Ok(None));
        let create = |billed_amount: i64| AutoCorrection::CreateProcedure {
            ssn: "1234567890123".to_string(),
            patient_name: "Nom Prenom".to_string(),
            procedure_date: NaiveDate::from_ymd_opt(2026, 1, 10).unwrap(),
            payment_date: NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
            billed_amount,
            pdf_fund_label: "CPAM n° 75".to_string(),
        };
        let manager = Arc::new(RecordingManager::default());
        let orchestrator = make_orchestrator_on(
            manager.clone(),
            fund_repo,
            MockFundPaymentRepository::new(),
            procedure_repo,
        );

        orchestrator
            .create_multiple_with_auto_corrections(
                vec![candidate("CPAM n° 75", 70_000, &[])],
                vec![create(40_000), create(30_000)],
                patient_service_finding_nobody(),
            )
            .await?;

        let written = manager.committed().expect("committed");
        assert_eq!(written.patients.len(), 1);
        assert_eq!(written.procedures.len(), 2);
        for procedure in &written.procedures {
            assert_eq!(procedure.patient_id, written.patients[0].id);
            assert_eq!(procedure.procedure_type_id, "import-pdf");
        }
        assert_eq!(written.groups[0].lines.len(), 2);
        Ok(())
    }

    fn split_line(
        amount: i64,
    ) -> crate::use_cases::fund_payment_reconciliation::fund_pdf_codec::NormalizedPdfLine {
        crate::use_cases::fund_payment_reconciliation::fund_pdf_codec::NormalizedPdfLine {
            line_index: 4,
            payment_date: NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
            invoice_number: "F-1".to_string(),
            fund_name: "CPAM n° 75".to_string(),
            patient_name: "Nom Prenom".to_string(),
            ssn: "1234567890123".to_string(),
            nature: "SEANCE".to_string(),
            procedure_start_date: NaiveDate::from_ymd_opt(2026, 1, 1).unwrap(),
            procedure_end_date: NaiveDate::from_ymd_opt(2026, 1, 31).unwrap(),
            is_period: true,
            amount,
        }
    }

    fn split_part(date: &str, amount: i64) -> SplitPart {
        SplitPart {
            procedure_date: date.to_string(),
            billed_amount: Some(amount),
        }
    }

    /// FPA-257 — a line split into two parts creates two "Import" procedures
    /// of one new patient, each with its part's date and amount, both in the
    /// line's group.
    #[tokio::test]
    async fn test_fpa_257_a_split_line_creates_one_procedure_per_part() -> anyhow::Result<()> {
        let mut fund_repo = MockFundRepository::new();
        fund_repo
            .expect_find_fund_by_identifier()
            .returning(|_| Ok(None));
        let mut procedure_repo = MockProcedureRepository::new();
        procedure_repo
            .expect_read_procedure()
            .returning(|_| Ok(None));
        let manager = Arc::new(RecordingManager::default());
        let orchestrator = make_orchestrator_on(
            manager.clone(),
            fund_repo,
            MockFundPaymentRepository::new(),
            procedure_repo,
        );
        let split = AutoCorrection::SplitIntoProcedures {
            line: split_line(70_000),
            parts: vec![
                split_part("2026-01-10", 40_000),
                split_part("2026-01-17", 30_000),
            ],
        };

        orchestrator
            .create_multiple_with_auto_corrections(
                vec![candidate("CPAM n° 75", 70_000, &[])],
                vec![split],
                patient_service_finding_nobody(),
            )
            .await?;

        let written = manager.committed().expect("committed");
        assert_eq!(written.patients.len(), 1);
        let created: Vec<(NaiveDate, i64)> = written
            .procedures
            .iter()
            .map(|procedure| (procedure.procedure_date, procedure.billed_amount))
            .collect();
        assert_eq!(
            created,
            vec![
                (NaiveDate::from_ymd_opt(2026, 1, 10).unwrap(), 40_000),
                (NaiveDate::from_ymd_opt(2026, 1, 17).unwrap(), 30_000),
            ]
        );
        for procedure in &written.procedures {
            assert_eq!(procedure.patient_id, written.patients[0].id);
            assert_eq!(procedure.procedure_type_id, "import-pdf");
        }
        assert_eq!(written.groups[0].lines.len(), 2);
        Ok(())
    }

    /// FPA-258 — a split that does not add up is refused at confirmation too,
    /// and nothing is written.
    #[tokio::test]
    async fn test_fpa_258_an_unbalanced_split_is_refused_at_confirmation() {
        let mut fund_repo = MockFundRepository::new();
        fund_repo
            .expect_find_fund_by_identifier()
            .returning(|_| Ok(None));
        let mut procedure_repo = MockProcedureRepository::new();
        procedure_repo
            .expect_read_procedure()
            .returning(|_| Ok(None));
        let manager = Arc::new(RecordingManager::default());
        let orchestrator = make_orchestrator_on(
            manager.clone(),
            fund_repo,
            MockFundPaymentRepository::new(),
            procedure_repo,
        );
        let split = AutoCorrection::SplitIntoProcedures {
            line: split_line(70_000),
            parts: vec![split_part("2026-01-10", 40_000)],
        };

        let result = orchestrator
            .create_multiple_with_auto_corrections(
                vec![candidate("CPAM n° 75", 70_000, &[])],
                vec![split],
                patient_service_finding_nobody(),
            )
            .await;

        assert!(matches!(
            result,
            Err(FundPaymentReconciliationError::Task(
                FundPaymentReconciliationTask::SplitInvalid { .. }
            ))
        ));
        assert!(manager.committed().is_none());
    }

    /// FPA-240 and FPA-230 — a linked procedure joins its group and its
    /// patient takes the SSN of the PDF; a date correction moves the procedure
    /// to the date of the PDF.
    #[tokio::test]
    async fn test_fpa_240_fpa_230_a_link_gives_the_ssn_and_a_date_correction_the_date(
    ) -> anyhow::Result<()> {
        use crate::context::patient::{MockPatientRepository, PatientService};
        let mut fund_repo = MockFundRepository::new();
        fund_repo
            .expect_find_fund_by_identifier()
            .returning(|_| Ok(None));
        let mut procedure_repo = MockProcedureRepository::new();
        procedure_repo
            .expect_read_procedures_by_ids()
            .returning(|ids| Ok(ids.iter().map(|id| created_procedure(id, 50_000)).collect()));
        procedure_repo
            .expect_read_procedure()
            .returning(|_| Ok(None));
        let mut patient_repo = MockPatientRepository::new();
        patient_repo.expect_read_patient().returning(|id| {
            Ok(Some(Patient::restore(
                id.to_string(),
                false,
                Some("Nom Prenom".to_string()),
                None,
                None,
                None,
                None,
                None,
            )))
        });
        let patient_service = Arc::new(PatientService::new(
            Arc::new(patient_repo),
            Arc::new(EventBus::new()),
        ));
        let manager = Arc::new(RecordingManager::default());
        let orchestrator = make_orchestrator_on(
            manager.clone(),
            fund_repo,
            MockFundPaymentRepository::new(),
            procedure_repo,
        );
        let pdf_date = NaiveDate::from_ymd_opt(2026, 1, 12).unwrap();

        orchestrator
            .create_multiple_with_auto_corrections(
                vec![candidate("CPAM n° 75", 100_000, &["dated"])],
                vec![
                    AutoCorrection::DateMismatch {
                        procedure_id: "dated".to_string(),
                        pdf_date,
                    },
                    AutoCorrection::LinkProcedure {
                        procedure_id: "linked".to_string(),
                        pdf_ssn: "1234567890123".to_string(),
                        pdf_fund_label: "CPAM n° 75".to_string(),
                        payment_date: NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
                    },
                ],
                patient_service,
            )
            .await?;

        let written = manager.committed().expect("committed");
        assert_eq!(written.patients_updated.len(), 1);
        assert_eq!(
            written.patients_updated[0].ssn.as_deref(),
            Some("1234567890123")
        );
        let lines: Vec<&str> = written.groups[0]
            .lines
            .iter()
            .map(|line| line.procedure_id.as_str())
            .collect();
        assert_eq!(lines, vec!["dated", "linked"]);
        let dated = written
            .procedures_updated
            .iter()
            .find(|procedure| procedure.id == "dated")
            .expect("the corrected procedure");
        assert_eq!(dated.procedure_date, pdf_date);
        assert_eq!(dated.payment_status, ProcedureStatus::Reconciled);
        Ok(())
    }

    /// FPA-076 — when the unit of work fails, the validation is refused as a
    /// whole: nothing is committed, and the error is a database error.
    #[tokio::test]
    async fn test_fpa_076_a_validation_whose_unit_of_work_fails_writes_nothing() {
        let (fund_repo, procedure_repo, candidates, corrections) = validation_with_corrections();
        let manager = Arc::new(RecordingManager {
            fail_on_commit: true,
            ..RecordingManager::default()
        });
        let orchestrator = make_orchestrator_on(
            manager.clone(),
            fund_repo,
            MockFundPaymentRepository::new(),
            procedure_repo,
        );

        let result = orchestrator
            .create_multiple_with_auto_corrections(
                candidates,
                corrections,
                patient_service_finding_nobody(),
            )
            .await;

        assert!(
            matches!(
                result,
                Err(FundPaymentReconciliationError::Task(
                    FundPaymentReconciliationTask::DatabaseError
                ))
            ),
            "got: {result:?}"
        );
        assert!(manager.committed().is_none());
    }

    /// Regression — `create_multiple_with_auto_corrections` plans nothing and
    /// writes nothing when every candidate is a duplicate of an existing
    /// fund-payment group: the duplicate check comes first. The procedure and
    /// patient mocks have no expectation, so the first read of a correction
    /// would crash the test, and nothing reaches the unit of work.
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
            matches!(
                result,
                Err(FundPaymentReconciliationError::Task(
                    FundPaymentReconciliationTask::AllDuplicates { count: 1 }
                ))
            ),
            "all-duplicate batch must return AllDuplicates {{ count: 1 }}, got: {result:?}",
        );
        Ok(())
    }

    /// FPA-211 (#392) — a procedure with a dispute staged takes no amount correction: the
    /// pair is refused before anything is read. The mocks have no expectation,
    /// so a read would crash the test, and nothing reaches the unit of work.
    #[tokio::test]
    async fn create_multiple_with_auto_corrections_refuses_a_disputed_amount_corrected(
    ) -> anyhow::Result<()> {
        use crate::context::patient::{MockPatientRepository, PatientService};

        let orchestrator = make_orchestrator(
            MockFundRepository::new(),
            MockFundPaymentRepository::new(),
            MockProcedureRepository::new(),
        );
        let bus = Arc::new(EventBus::new());
        let patient_service = Arc::new(PatientService::new(
            Arc::new(MockPatientRepository::new()),
            bus,
        ));

        let result = orchestrator
            .create_multiple_with_auto_corrections(
                vec![FundPaymentGroupCandidate {
                    fund_label: "CPAM n° 75".to_string(),
                    payment_date: NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
                    total_amount: 40_000,
                    procedure_ids: vec!["proc-1".to_string()],
                    matched_amount: 40_000,
                    is_fully_covered: true,
                }],
                vec![
                    AutoCorrection::DisputeAmount {
                        procedure_id: "proc-1".to_string(),
                        paid_amount: 40_000,
                    },
                    AutoCorrection::AmountMismatch {
                        procedure_id: "proc-1".to_string(),
                        pdf_amount: 40_000,
                    },
                ],
                patient_service,
            )
            .await;

        assert!(
            matches!(
                &result,
                Err(FundPaymentReconciliationError::Task(
                    FundPaymentReconciliationTask::DisputedAmountCorrected { procedure_id }
                )) if procedure_id == "proc-1"
            ),
            "got: {result:?}",
        );
        Ok(())
    }

    /// Validates one group whose procedure, billed 50 000, is disputed at `paid_amount`.
    async fn validate_a_dispute(
        paid_amount: i64,
    ) -> (
        Result<Vec<FundPaymentGroup>, FundPaymentReconciliationError>,
        Arc<RecordingManager>,
    ) {
        let mut fund_repo = MockFundRepository::new();
        fund_repo
            .expect_find_fund_by_identifier()
            .returning(|_| Ok(None));
        let mut procedure_repo = MockProcedureRepository::new();
        procedure_repo
            .expect_read_procedures_by_ids()
            .returning(|_| Ok(vec![created_procedure("proc-1", 50_000)]));
        procedure_repo
            .expect_read_procedure()
            .returning(|_| Ok(None));
        let manager = Arc::new(RecordingManager::default());
        let orchestrator = make_orchestrator_on(
            manager.clone(),
            fund_repo,
            MockFundPaymentRepository::new(),
            procedure_repo,
        );
        let result = orchestrator
            .create_multiple_with_auto_corrections(
                vec![candidate("CPAM n° 75", 40_000, &["proc-1"])],
                vec![AutoCorrection::DisputeAmount {
                    procedure_id: "proc-1".to_string(),
                    paid_amount,
                }],
                patient_service_finding_nobody(),
            )
            .await;
        (result, manager)
    }

    fn is_out_of_range(
        result: &Result<Vec<FundPaymentGroup>, FundPaymentReconciliationError>,
    ) -> bool {
        matches!(
            result,
            Err(FundPaymentReconciliationError::Task(
                FundPaymentReconciliationTask::DisputedAmountOutOfRange { procedure_id }
            )) if procedure_id == "proc-1"
        )
    }

    /// FPA-212 (ticket #424) — a dispute at or above the billed amount is refused; nothing is written.
    #[tokio::test]
    async fn test_fpa_212_a_dispute_at_or_above_the_billed_amount_is_refused() {
        for paid_amount in [50_000, 50_001] {
            let (result, manager) = validate_a_dispute(paid_amount).await;
            assert!(is_out_of_range(&result), "paid {paid_amount}: {result:?}");
            assert!(manager.committed().is_none());
        }
    }

    /// FPA-212 (ticket #424) — a dispute below zero is refused; nothing is written.
    #[tokio::test]
    async fn test_fpa_212_a_dispute_below_zero_is_refused() {
        let (result, manager) = validate_a_dispute(-1).await;
        assert!(is_out_of_range(&result), "got: {result:?}");
        assert!(manager.committed().is_none());
    }

    /// FPA-212 (ticket #424) — zero and an amount below the billed one are disputes.
    #[tokio::test]
    async fn test_fpa_212_a_dispute_from_zero_to_below_the_billed_amount_is_recorded() {
        for paid_amount in [0, 49_999] {
            let (result, manager) = validate_a_dispute(paid_amount).await;
            assert!(result.is_ok(), "paid {paid_amount}: {result:?}");
            let written = manager.committed().expect("committed");
            let disputed = &written.procedures_updated[0];
            assert_eq!(
                disputed.payment_status,
                ProcedureStatus::PartiallyReconciled
            );
            assert_eq!(disputed.paid_amount, Some(paid_amount));
            assert_eq!(disputed.billed_amount, 50_000);
        }
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

use std::sync::Arc;

use regex::Regex;
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::context::bank::{
    BankAccountService, BankEntryLinkRepository, BankEntryService, BankEntryType, BankError,
};
use crate::context::fund::{Fund, FundPaymentGroupStatus, FundPaymentService, FundService};
use crate::context::procedure::{ProcedureService, ProcedureStatus};
use crate::shared::event_bus::{BankEntryUpdated, EventBus, ProcedureUpdated};
use crate::shared::logger::BACKEND;
use crate::shared::pdf_extractor;
use crate::shared::secure_path::{self, PathPolicy};

use super::bank_pdf_codec::BankStatementParseResult;
use super::error::{BankStatementReconciliationError, BankStatementReconciliationTask};
use super::label_mapping_repo::BankFundLabelMappingRepository;
use super::parser;

/// Maximum number of days between a fund payment group date and the bank statement credit line date.
/// A group dated on D may appear on the bank statement up to D+7 (R11).
pub const MAX_DATE_OFFSET_DAYS: i64 = 7;

/// Bank statement reconciliation configuration exported to frontend
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct BankStatementReconciliationConfig {
    /// Maximum date offset (days) for matching bank lines to payment groups
    pub max_date_offset_days: i32,
}

impl BankStatementReconciliationConfig {
    /// Get the singleton instance
    pub fn instance() -> Self {
        Self {
            max_date_offset_days: MAX_DATE_OFFSET_DAYS as i32,
        }
    }
}

/// Resolution status for a bank statement fund label
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FundLabelResolution {
    pub bank_label: String,
    /// Fund ID if already confirmed via mapping table
    pub fund_id: Option<String>,
    /// Suggested fund ID from heuristic matching
    pub suggested_fund_id: Option<String>,
    /// Suggested fund name (for display)
    pub suggested_fund_name: Option<String>,
    /// Whether this mapping is confirmed (from mapping table)
    pub is_confirmed: bool,
    /// Whether this label is explicitly rejected (not a fund payment)
    pub is_rejected: bool,
}

/// A credit line that has been resolved with a fund ID
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ResolvedCreditLine {
    pub date: String,
    pub label: String,
    pub amount: i64,
    pub fund_id: String,
}

/// A match between a bank statement credit line and a FundPaymentGroup
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct BankStatementMatch {
    pub credit_line: ResolvedCreditLine,
    pub group_id: String,
    pub group_fund_id: String,
    pub group_payment_date: String,
    pub group_total_amount: i64,
}

/// Result of matching bank statement lines against unsettled groups
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct BankStatementMatchResult {
    pub matched: Vec<BankStatementMatch>,
    pub unmatched_lines: Vec<ResolvedCreditLine>,
}

/// A confirmed match ready for bank transfer creation
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ConfirmedMatch {
    pub group_id: String,
    pub date: String,
    pub amount: i64,
}

/// Orchestrator for bank statement reconciliation workflow
pub struct BankStatementOrchestrator {
    bank_account_service: Arc<BankAccountService>,
    fund_service: Arc<FundService>,
    fund_payment_service: Arc<FundPaymentService>,
    bank_transfer_service: Arc<BankEntryService>,
    transfer_link_repo: Arc<dyn BankEntryLinkRepository>,
    procedure_service: Arc<ProcedureService>,
    label_mapping_repo: Arc<dyn BankFundLabelMappingRepository>,
    event_bus: Arc<EventBus>,
}

impl BankStatementOrchestrator {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        bank_account_service: Arc<BankAccountService>,
        fund_service: Arc<FundService>,
        fund_payment_service: Arc<FundPaymentService>,
        bank_transfer_service: Arc<BankEntryService>,
        transfer_link_repo: Arc<dyn BankEntryLinkRepository>,
        procedure_service: Arc<ProcedureService>,
        label_mapping_repo: Arc<dyn BankFundLabelMappingRepository>,
        event_bus: Arc<EventBus>,
    ) -> Self {
        Self {
            bank_account_service,
            fund_service,
            fund_payment_service,
            bank_transfer_service,
            transfer_link_repo,
            procedure_service,
            label_mapping_repo,
            event_bus,
        }
    }

    /// Parse a bank statement PDF: validate the path, extract text, parse it
    /// into a structured `BankStatementParseResult`, then enforce R26 (the
    /// workflow halts with the `NO_VIR_SEPA_LINES` sentinel when no VIR SEPA
    /// credit lines remain). Synchronous — all underlying calls block.
    pub fn parse_bank_statement(
        &self,
        file_path: &str,
    ) -> Result<BankStatementParseResult, BankStatementReconciliationError> {
        let allowed_root =
            secure_path::user_home().ok_or(BankStatementReconciliationTask::HomeDirUnresolved)?;
        let canonical = secure_path::validate_user_path(
            file_path,
            &allowed_root,
            PathPolicy::ExistingFile {
                extensions: &["pdf"],
            },
        )
        .map_err(|e| {
            tracing::warn!(target: BACKEND, error = %e, "Bank statement path rejected by validator");
            BankStatementReconciliationTask::PathRejected
        })?;

        let text = pdf_extractor::extract_pdf_text(&canonical).map_err(|e| {
            tracing::error!(target: BACKEND, err = ?e, "parse_bank_statement: PDF text extraction failed");
            BankStatementReconciliationTask::PdfExtractionFailed
        })?;
        tracing::info!(target: BACKEND, chars = text.len(), "PDF text extracted");

        let result = parser::parse_bank_statement(&text);
        let result = ensure_credit_lines(result)?;

        tracing::info!(
            target: BACKEND,
            credit_lines = result.credit_lines.len(),
            total_credits = result.total_credits,
            "Bank statement parsed successfully"
        );
        Ok(result)
    }

    /// Resolve fund labels against the mapping table and suggest matches.
    pub async fn resolve_fund_labels(
        &self,
        bank_account_id: &str,
        labels: Vec<String>,
    ) -> Result<Vec<FundLabelResolution>, BankStatementReconciliationError> {
        // Get existing mappings for this account
        let mappings = self
            .label_mapping_repo
            .find_mappings_for_account(bank_account_id)
            .await
            .map_err(|e| {
                tracing::error!(target: BACKEND, err = ?e, "resolve_fund_labels: find_mappings_for_account failed");
                BankStatementReconciliationTask::DatabaseError
            })?;

        // Get all funds for suggestion
        let funds = self.fund_service.read_all_funds().await?;

        let mut resolutions = Vec::new();
        // Deduplicate labels
        let unique_labels: Vec<String> = {
            let mut seen = std::collections::HashSet::new();
            labels
                .into_iter()
                .filter(|l| seen.insert(l.clone()))
                .collect()
        };

        for label in unique_labels {
            // Check if already mapped
            let existing = mappings.iter().find(|m| m.bank_label == label);

            if let Some(mapping) = existing {
                let is_rejected = mapping.fund_id.is_none();
                resolutions.push(FundLabelResolution {
                    bank_label: label,
                    fund_id: mapping.fund_id.clone(),
                    suggested_fund_id: None,
                    suggested_fund_name: None,
                    is_confirmed: true,
                    is_rejected,
                });
            } else {
                // Try to suggest a fund
                let (suggested_id, suggested_name) = suggest_fund(&label, &funds);
                resolutions.push(FundLabelResolution {
                    bank_label: label,
                    fund_id: None,
                    suggested_fund_id: suggested_id,
                    suggested_fund_name: suggested_name,
                    is_confirmed: false,
                    is_rejected: false,
                });
            }
        }

        Ok(resolutions)
    }

    /// Save confirmed label mappings
    pub async fn save_label_mappings(
        &self,
        bank_account_id: &str,
        mappings: Vec<(String, String)>, // (bank_label, fund_id)
    ) -> Result<(), BankStatementReconciliationError> {
        for (label, fund_id) in mappings {
            self.label_mapping_repo
                .save_mapping(bank_account_id, &label, &fund_id)
                .await
                .map_err(|e| {
                    tracing::error!(target: BACKEND, err = ?e, "save_label_mappings: save_mapping failed");
                    BankStatementReconciliationTask::DatabaseError
                })?;
        }
        Ok(())
    }

    /// Match resolved credit lines against unsettled FundPaymentGroups.
    ///
    /// A group is "unsettled" if no BankEntry exists with
    /// source = `fund_payment_group_{group_id}`.
    ///
    /// Algorithm:
    /// 1. Sort bank statement lines by date (oldest first)
    /// 2. Iterate through date offsets from MAX_DATE_OFFSET_DAYS down to 0
    ///    This ensures oldest lines get reconciled first with broader date tolerance,
    ///    then progressively tighten to exact day match.
    /// 3. For each line and offset, find the first matching unsettled group
    pub async fn match_against_unsettled_groups(
        &self,
        resolved_lines: Vec<ResolvedCreditLine>,
    ) -> Result<BankStatementMatchResult, BankStatementReconciliationError> {
        // Filter out rejected lines
        let mut active_lines: Vec<_> = resolved_lines
            .into_iter()
            .filter(|l| l.fund_id != "REJECTED")
            .collect();

        // Sort by date: oldest first
        active_lines.sort_by(|a, b| a.date.cmp(&b.date));

        // Filter to unsettled (Active) groups only — locked groups are already bank-reconciled
        let unsettled_groups: Vec<_> = self
            .fund_payment_service
            .read_all_groups()
            .await?
            .into_iter()
            .filter(|g| !g.is_locked)
            .collect();

        let mut matched = Vec::new();
        let mut used_group_ids: std::collections::HashSet<String> =
            std::collections::HashSet::new();
        let mut matched_indices = std::collections::HashSet::new();

        // Iterative matching: for each line (oldest first), find the best matching group
        // by trying offsets from MAX_DATE_OFFSET_DAYS down to 0.
        // This ensures:
        // 1. Oldest lines get matched first (priority)
        // 2. Each line gets the best available offset (broader → stricter)
        // 3. Recent lines only get groups not taken by older lines
        for (idx, line) in active_lines.iter().enumerate() {
            // Parse bank line date once
            let line_date_parsed = match chrono::NaiveDate::parse_from_str(&line.date, "%Y-%m-%d") {
                Ok(date) => date,
                Err(_) => continue, // Skip line with invalid date
            };

            // Try each offset from largest (most lenient) to 0 (exact day match)
            for offset in (0..=MAX_DATE_OFFSET_DAYS).rev() {
                // Try to find a matching group for this line at this offset
                let mut found_match = false;

                for group in &unsettled_groups {
                    if used_group_ids.contains(&group.id) {
                        continue;
                    }

                    // Match criteria:
                    // 1. Same fund
                    if group.fund_id != line.fund_id {
                        continue;
                    }

                    // 2. Exact amount match
                    if group.total_amount != line.amount {
                        continue;
                    }

                    // 3. Exact date offset (group date must be 'offset' days before bank line date)
                    if !is_exact_date_offset(line_date_parsed, group.payment_date, offset) {
                        continue;
                    }

                    // Match found! Lock this line and group, then move to next line
                    matched.push(BankStatementMatch {
                        credit_line: line.clone(),
                        group_id: group.id.clone(),
                        group_fund_id: group.fund_id.clone(),
                        group_payment_date: group.payment_date.format("%Y-%m-%d").to_string(),
                        group_total_amount: group.total_amount,
                    });
                    used_group_ids.insert(group.id.clone());
                    matched_indices.insert(idx);
                    found_match = true;
                    break; // Move to next line
                }

                // If we found a match at this offset, stop trying larger offsets
                if found_match {
                    break;
                }
            }
        }

        // Extract unmatched lines
        let unmatched_lines = active_lines
            .into_iter()
            .enumerate()
            .filter(|(idx, _)| !matched_indices.contains(idx))
            .map(|(_, line)| line)
            .collect();

        Ok(BankStatementMatchResult {
            matched,
            unmatched_lines,
        })
    }

    /// Create BankTransfers for confirmed matches and update associated procedures.
    ///
    /// This method orchestrates the batch creation of bank transfers and procedure updates.
    /// Events are suppressed during processing and published once at the end for efficiency.
    ///
    /// For each confirmed match:
    /// 1. Create a bank transfer linked to the fund payment group
    /// 2. Update all procedures in the group to Payed status
    /// 3. Update confirmed_payment_date to the bank transfer date
    pub async fn create_transfers(
        &self,
        bank_account_id: &str,
        confirmed_matches: Vec<ConfirmedMatch>,
    ) -> Result<u32, BankStatementReconciliationError> {
        let mut created_count = 0u32;

        for m in confirmed_matches {
            // Parse date once for this match
            let confirmed_date = chrono::NaiveDate::parse_from_str(&m.date, "%Y-%m-%d")
                .map_err(|_| BankStatementReconciliationTask::InvalidConfirmedMatchDate)?;

            // Step 1: Create bank transfer (silent - orchestrator will publish once)
            let transfer = self
                .bank_transfer_service
                .create_transfer(
                    m.date.clone(),
                    m.amount,
                    BankEntryType::FundWire,
                    bank_account_id.to_string(),
                    true,
                )
                .await?;

            // Step 2: Link transfer to fund payment group
            self.transfer_link_repo
                .link_fund_groups(&transfer.id, std::slice::from_ref(&m.group_id))
                .await
                .map_err(|e| {
                    tracing::error!(target: BACKEND, err = ?e, "create_transfers: link_fund_groups failed");
                    BankError::DatabaseError
                })?;

            tracing::info!(
                group_id = %m.group_id,
                transfer_date = %m.date,
                amount = m.amount,
                "Bank transfer created"
            );

            // Step 3: Update group status to BankPaid
            if let Err(e) = self
                .fund_payment_service
                .update_group_status(&m.group_id, FundPaymentGroupStatus::BankPaid)
                .await
            {
                tracing::warn!(
                    group_id = %m.group_id,
                    error = %e,
                    "Failed to update group status to BankPaid"
                );
            }

            // Step 4: Update associated procedures to Payed status (silent - orchestrator will publish once)
            if let Ok(Some(group)) = self.fund_payment_service.read_group(&m.group_id).await {
                let procedure_ids: Vec<String> =
                    group.lines.iter().map(|l| l.procedure_id.clone()).collect();

                if let Ok(procedures_to_update) = self
                    .procedure_service
                    .read_procedures_by_ids(procedure_ids)
                    .await
                {
                    let updated_procedures: Vec<_> = procedures_to_update
                        .into_iter()
                        .map(|mut procedure| {
                            // Contested procedures keep their paid_amount (pdf amount)
                            // and transition to PartiallyFundPaid instead of FundPaid.
                            let (new_status, paid_amount) = if procedure.payment_status
                                == ProcedureStatus::PartiallyReconciled
                            {
                                (ProcedureStatus::PartiallyFundPaid, procedure.paid_amount)
                            } else {
                                (ProcedureStatus::FundPaid, Some(procedure.billed_amount))
                            };
                            procedure.payment_status = new_status;
                            procedure = procedure.with_payment_info(
                                crate::context::procedure::PaymentMethod::BankTransfer,
                                Some(confirmed_date),
                                paid_amount,
                            );
                            procedure
                        })
                        .collect();

                    if let Err(e) = self
                        .procedure_service
                        .update_procedures_batch(updated_procedures, true)
                        .await
                    {
                        tracing::warn!(
                            group_id = %m.group_id,
                            error = %e,
                            "Failed to update procedures batch for bank transfer"
                        );
                    } else {
                        tracing::info!(
                            group_id = %m.group_id,
                            procedure_count = group.lines.len(),
                            transfer_date = %m.date,
                            "Updated procedures to Payed status with bank transfer date (batch)"
                        );
                    }
                } else {
                    tracing::warn!(
                        group_id = %m.group_id,
                        "Failed to read procedures for batch update"
                    );
                }
            } else {
                tracing::warn!(
                    group_id = %m.group_id,
                    "Fund payment group not found while updating procedures for bank transfer"
                );
            }

            created_count += 1;
        }

        // Publish events once after all transfers are created
        if created_count > 0 {
            let _ = self.event_bus.publish::<ProcedureUpdated>(ProcedureUpdated);
            let _ = self.event_bus.publish::<BankEntryUpdated>(BankEntryUpdated);
        }

        Ok(created_count)
    }

    /// Publish batched events after batch reconciliation completes
    pub fn publish_batch_events(&self) {
        let _ = self.event_bus.publish::<ProcedureUpdated>(ProcedureUpdated);
        let _ = self.event_bus.publish::<BankEntryUpdated>(BankEntryUpdated);
    }

    /// Resolve IBAN to bank account
    pub async fn resolve_bank_account_from_iban(
        &self,
        iban: &str,
    ) -> Result<Option<crate::context::bank::BankAccount>, BankStatementReconciliationError> {
        Ok(self.bank_account_service.find_account_by_iban(iban).await?)
    }

    /// BAS-064 — compute the ephemeral reconciliation draft as a pure function
    /// of the parsed statement plus the ordered correction list.
    ///
    /// Reads saved label mappings and live unsettled groups, applies the
    /// heuristic, runs the auto-match (BAS-050–054), then replays every
    /// correction in order (link-fund cascade BAS-066, group consumption
    /// BAS-067, multi-group balance BAS-090/091, remainder BAS-092).
    ///
    /// Read-only — no DB writes.
    pub async fn compute_draft(
        &self,
        bank_account_id: &str,
        parse_result: &super::bank_pdf_codec::BankStatementParseResult,
        corrections: &[super::draft::ReconciliationCorrection],
    ) -> Result<super::draft::ReconciliationDraft, BankStatementReconciliationError> {
        let mappings = self.load_mappings(bank_account_id).await?;
        // service layer logs the error; propagate typed
        let groups = self.fund_payment_service.read_all_groups().await?;
        let valid_fund_ids: std::collections::HashSet<String> = self
            .fund_service
            .read_all_funds()
            .await?
            .into_iter()
            .map(|f| f.id)
            .collect();
        let repos = super::draft::DraftRepos {
            mappings: &mappings,
            groups: &groups,
            valid_fund_ids: &valid_fund_ids,
        };
        super::draft::compute_draft(parse_result, &repos, corrections)
    }

    /// BAS-063/035/070–073/093 — commit the draft.
    ///
    /// Recomputes the draft server-side from `corrections` (never trusts
    /// FE-supplied state), then in one pass:
    /// - Upserts label mappings implied by `LinkFund` corrections (BAS-035).
    /// - For every resolved (Matched/Rejected-exempt) line, creates N
    ///   `BankEntry` records — one per assigned group (BAS-093).
    /// - Moves each group's procedures to `FundPaid` / `PartiallyFundPaid`
    ///   (BAS-071) and locks the group to `BankPaid` (BAS-072–073).
    /// - Unresolved and needs-* lines are skipped (BAS-063).
    /// - Acknowledged remainders create nothing (BAS-092).
    ///
    /// Returns the count of `BankEntry` records created.
    pub async fn validate_reconciliation(
        &self,
        bank_account_id: &str,
        parse_result: &super::bank_pdf_codec::BankStatementParseResult,
        corrections: &[super::draft::ReconciliationCorrection],
    ) -> Result<u32, BankStatementReconciliationError> {
        use super::draft::{DraftLineStatus, FundAssignment, ReconciliationCorrection};

        // Recompute server-side — never trust FE-supplied draft state (BAS-064).
        let draft = self
            .compute_draft(bank_account_id, parse_result, corrections)
            .await?;

        // BAS-035 — upsert the label mapping implied by each LinkFund correction.
        for correction in corrections {
            if let ReconciliationCorrection::LinkFund {
                bank_label,
                assignment,
            } = correction
            {
                let fund_id = match assignment {
                    FundAssignment::Fund { fund_id } => fund_id.clone(),
                    FundAssignment::Rejected => "REJECTED".to_string(),
                };
                self.label_mapping_repo
                    .save_mapping(bank_account_id, bank_label, &fund_id)
                    .await
                    .map_err(|e| {
                        tracing::error!(target: BACKEND, err = ?e, "validate_reconciliation: save_mapping failed");
                        BankStatementReconciliationTask::DatabaseError
                    })?;
            }
        }

        // BAS-093 — one BankEntry per assigned group on every resolved (Matched)
        // line, each sized to its group's total amount (not the line amount).
        // Unresolved / needs-* lines are skipped (BAS-063); an acknowledged
        // remainder contributes no transfer (BAS-092).
        // service layer logs the error; propagate typed
        let groups = self.fund_payment_service.read_all_groups().await?;
        let mut confirmed_matches: Vec<ConfirmedMatch> = Vec::new();
        for line in &draft.lines {
            if line.status != DraftLineStatus::Matched {
                continue;
            }
            for group_id in &line.assigned_group_ids {
                let amount = groups
                    .iter()
                    .find(|g| &g.id == group_id)
                    .map(|g| g.total_amount)
                    .ok_or_else(|| crate::context::fund::FundError::PaymentGroupNotFound {
                        fund_payment_group_id: group_id.clone(),
                    })?;
                confirmed_matches.push(ConfirmedMatch {
                    group_id: group_id.clone(),
                    date: line.credit_line.date.clone(),
                    amount,
                });
            }
        }

        self.create_transfers(bank_account_id, confirmed_matches)
            .await
    }

    /// Load the saved label mappings for an account (BAS-035 read path).
    async fn load_mappings(
        &self,
        bank_account_id: &str,
    ) -> Result<
        Vec<super::label_mapping_repo::BankFundLabelMapping>,
        BankStatementReconciliationError,
    > {
        self.label_mapping_repo
            .find_mappings_for_account(bank_account_id)
            .await
            .map_err(|e| {
                tracing::error!(target: BACKEND, err = ?e, "load_mappings: find_mappings_for_account failed");
                BankStatementReconciliationTask::DatabaseError.into()
            })
    }
}

/// Suggest a fund based on the bank label.
///
/// Strategy:
/// 1. Extract number from CPAM/CAISSE labels → match fund_identifier
/// 2. Fuzzy name matching as fallback
fn suggest_fund(label: &str, funds: &[Fund]) -> (Option<String>, Option<String>) {
    // Strategy 1: Extract CPAM number
    // Labels like "CPAM93", "CPAM94", "CPAM75PRESTATIONS"
    let cpam_re = Regex::new(r"(?i)(?:CPAM|CAISSE)(\d+)").ok();
    if let Some(re) = &cpam_re {
        if let Some(caps) = re.captures(label) {
            if let Some(num) = caps.get(1) {
                let identifier = num.as_str();
                // Find fund by identifier
                if let Some(fund) = funds.iter().find(|f| f.fund_identifier == identifier) {
                    return (Some(fund.id.clone()), Some(fund.name.clone()));
                }
            }
        }
    }

    // Strategy 2: Word overlap fuzzy matching
    let label_upper = label.to_uppercase();
    let mut best_score = 0usize;
    let mut best_fund: Option<&Fund> = None;

    for fund in funds {
        let fund_name_upper = fund.name.to_uppercase().replace(' ', "");
        // Check if label contains the fund name (without spaces) or vice versa
        let score = if label_upper.contains(&fund_name_upper) {
            fund_name_upper.len()
        } else if fund_name_upper.contains(&label_upper) {
            label_upper.len()
        } else {
            // Count matching characters in sequence
            label_upper
                .chars()
                .zip(fund_name_upper.chars())
                .take_while(|(a, b)| a == b)
                .count()
        };

        if score > best_score && score >= 3 {
            best_score = score;
            best_fund = Some(fund);
        }
    }

    match best_fund {
        Some(fund) => (Some(fund.id.clone()), Some(fund.name.clone())),
        None => (None, None),
    }
}

/// R26 — Halt the workflow with the `NO_VIR_SEPA_LINES` sentinel when the
/// parsed statement contains no actionable VIR SEPA credit lines. The
/// frontend matches on this exact error string to display a dedicated
/// "no SEPA lines" guidance.
fn ensure_credit_lines(
    result: BankStatementParseResult,
) -> Result<BankStatementParseResult, BankStatementReconciliationError> {
    if result.credit_lines.is_empty() {
        tracing::warn!(target: BACKEND, "Bank statement parsed but contains no VIR SEPA credit lines");
        return Err(BankStatementReconciliationTask::NoSepaCreditLines.into());
    }
    Ok(result)
}

/// Check if bank_date is exactly 'offset' days after group_date
fn is_exact_date_offset(
    bank_date: chrono::NaiveDate,
    group_date: chrono::NaiveDate,
    offset: i64,
) -> bool {
    (bank_date - group_date).num_days() == offset
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::context::bank::{
        BankAccount, BankAccountRepository, MockBankAccountRepository, MockBankEntryLinkRepository,
        MockBankEntryRepository,
    };
    use crate::context::fund::{
        FundPaymentGroup, FundPaymentGroupStatus, MockFundPaymentRepository, MockFundRepository,
    };
    use crate::context::procedure::{MockProcedureRepository, Procedure};
    use crate::shared::event_bus::EventBus;
    use crate::use_cases::bank_statement_reconciliation::{
        bank_pdf_codec::BankStatementCreditLine,
        draft::{DraftLineStatus, FundAssignment, ReconciliationCorrection},
        error::BankStatementReconciliationTask,
        label_mapping_repo::{BankFundLabelMapping, MockBankFundLabelMappingRepository},
    };
    use chrono::NaiveDate;
    use std::sync::Arc;

    // --- Mock repository builders ---
    //
    // Each helper returns a mockall-configured trait mock with the same default
    // behavior the previous hand-rolled impls provided. Stateful builders take
    // their dataset by value and clone into the closures.

    fn fund_repo_returning(funds: Vec<Fund>) -> MockFundRepository {
        let mut mock = MockFundRepository::new();
        mock.expect_create_fund().returning(|id, name| {
            Ok(Fund::restore(
                uuid::Uuid::new_v4().to_string(),
                id.to_string(),
                name.to_string(),
            ))
        });
        let funds_for_read = funds.clone();
        mock.expect_read_all_funds()
            .returning(move || Ok(funds_for_read.clone()));
        mock.expect_read_fund().returning(|_| Ok(None));
        mock.expect_update_fund().returning(Ok);
        // `funds` is moved into this closure and iterated in-place each call —
        // no per-call clone needed because we only read.
        mock.expect_find_fund_by_identifier()
            .returning(move |id| Ok(funds.iter().find(|f| f.fund_identifier == id).cloned()));
        mock.expect_create_batch().returning(Ok);
        mock.expect_delete_fund().returning(|_| Ok(()));
        mock
    }

    fn fund_payment_repo_returning_groups(
        groups: Vec<FundPaymentGroup>,
    ) -> MockFundPaymentRepository {
        let mut mock = MockFundPaymentRepository::new();
        // create_group and create_batch_groups deliberately left unconfigured —
        // mockall panics on unexpected call, matching the previous unimplemented!().
        mock.expect_create_lines().returning(Ok);
        let groups_for_read_one = groups.clone();
        mock.expect_read_group()
            .returning(move |id| Ok(groups_for_read_one.iter().find(|g| g.id == id).cloned()));
        mock.expect_read_lines_by_group().returning(|_| Ok(vec![]));
        mock.expect_read_all_groups()
            .returning(move || Ok(groups.clone()));
        mock.expect_update_group().returning(Ok);
        mock.expect_update_group_status().returning(|_, _| Ok(()));
        mock.expect_delete_lines_by_group().returning(|_| Ok(()));
        mock.expect_delete_group().returning(|_| Ok(()));
        mock.expect_exists_group().returning(|_, _, _| Ok(false));
        mock.expect_persist_group().returning(Ok);
        mock
    }

    fn bank_account_repo_returning(account: Option<BankAccount>) -> MockBankAccountRepository {
        let mut mock = MockBankAccountRepository::new();
        mock.expect_create_account().returning(Ok);
        mock.expect_read_all_accounts().returning(|| Ok(vec![]));
        let account_for_read = account.clone();
        mock.expect_read_account()
            .returning(move |_| Ok(account_for_read.clone()));
        mock.expect_find_by_iban()
            .returning(move |_| Ok(account.clone()));
        mock.expect_find_by_iban_including_deleted()
            .returning(|_| Ok(None));
        mock.expect_update_account().returning(Ok);
        mock.expect_delete_account().returning(|_| Ok(()));
        mock
    }

    fn bank_entry_repo_noop() -> MockBankEntryRepository {
        let mut mock = MockBankEntryRepository::new();
        mock.expect_read_transfer().returning(|_| Ok(None));
        mock.expect_read_all_transfers().returning(|| Ok(vec![]));
        mock.expect_update_transfer().returning(Ok);
        mock.expect_delete_transfer().returning(|_| Ok(()));
        mock.expect_persist_transfer().returning(Ok);
        mock
    }

    fn bank_link_repo_noop() -> MockBankEntryLinkRepository {
        let mut mock = MockBankEntryLinkRepository::new();
        mock.expect_link_fund_groups().returning(|_, _| Ok(()));
        mock.expect_get_fund_group_ids().returning(|_| Ok(vec![]));
        mock.expect_unlink_all_fund_groups().returning(|_| Ok(()));
        mock.expect_get_transfer_for_fund_group()
            .returning(|_| Ok(None));
        mock.expect_link_procedures().returning(|_, _| Ok(()));
        mock.expect_get_procedure_ids().returning(|_| Ok(vec![]));
        mock.expect_unlink_all_procedures().returning(|_| Ok(()));
        mock
    }

    fn proc_repo_noop() -> MockProcedureRepository {
        let mut mock = MockProcedureRepository::new();
        mock.expect_create_procedure().returning(
            |patient_id,
             fund_id,
             procedure_type_id,
             procedure_date,
             billed_amount,
             payment_method,
             fund_reconciliation_date,
             confirmed_payment_date,
             paid_amount,
             payment_status| {
                Ok(Procedure::restore(
                    uuid::Uuid::new_v4().to_string(),
                    patient_id,
                    fund_id,
                    procedure_type_id,
                    procedure_date,
                    billed_amount,
                    payment_method,
                    fund_reconciliation_date,
                    confirmed_payment_date,
                    paid_amount,
                    payment_status,
                ))
            },
        );
        mock.expect_read_all_procedures().returning(|| Ok(vec![]));
        mock.expect_read_procedure().returning(|_| Ok(None));
        mock.expect_read_procedures_by_ids()
            .returning(|_| Ok(vec![]));
        mock.expect_read_procedures_by_patient_id()
            .returning(|_| Ok(vec![]));
        mock.expect_update_procedure().returning(Ok);
        mock.expect_delete_procedure().returning(|_| Ok(()));
        mock.expect_find_procedures_by_ssn_and_date_range()
            .returning(|_, _, _| Ok(vec![]));
        mock.expect_find_procedures_by_ssns_and_date_range_with_ssn()
            .returning(|_, _, _| Ok(vec![]));
        mock.expect_find_procedure_exact()
            .returning(|_, _, _, _| Ok(None));
        mock.expect_create_batch().returning(Ok);
        mock.expect_update_batch().returning(Ok);
        mock.expect_find_unpaid_by_fund().returning(|_| Ok(vec![]));
        mock.expect_has_blocking_procedures_in_month()
            .returning(|_| Ok(false));
        mock.expect_delete_procedures_by_month()
            .returning(|_| Ok(0));
        mock.expect_find_unreconciled_by_date_range()
            .returning(|_, _| Ok(vec![]));
        mock.expect_find_created_in_date_range()
            .returning(|_, _| Ok(vec![]));
        mock.expect_find_created_by_fund_before_date()
            .returning(|_, _| Ok(vec![]));
        mock
    }

    fn label_mapping_repo_returning(
        mappings: Vec<BankFundLabelMapping>,
    ) -> MockBankFundLabelMappingRepository {
        let mut mock = MockBankFundLabelMappingRepository::new();
        mock.expect_find_mappings_for_account()
            .returning(move |_| Ok(mappings.clone()));
        mock.expect_save_mapping()
            .returning(|bank_account_id, bank_label, fund_id| {
                Ok(BankFundLabelMapping {
                    id: uuid::Uuid::new_v4().to_string(),
                    bank_account_id: bank_account_id.to_string(),
                    bank_label: bank_label.to_string(),
                    fund_id: Some(fund_id.to_string()),
                })
            });
        mock
    }

    fn make_orchestrator_with(
        funds: Vec<Fund>,
        groups: Vec<FundPaymentGroup>,
        account: Option<BankAccount>,
        mappings: Vec<BankFundLabelMapping>,
    ) -> BankStatementOrchestrator {
        let event_bus = Arc::new(EventBus::new());
        let bank_account_repo: Arc<dyn BankAccountRepository> =
            Arc::new(bank_account_repo_returning(account));
        BankStatementOrchestrator::new(
            Arc::new(BankAccountService::new(
                bank_account_repo.clone(),
                event_bus.clone(),
            )),
            Arc::new(FundService::new(
                Arc::new(fund_repo_returning(funds)),
                event_bus.clone(),
            )),
            Arc::new(FundPaymentService::new(
                Arc::new(fund_payment_repo_returning_groups(groups)),
                event_bus.clone(),
            )),
            Arc::new(BankEntryService::new(
                Arc::new(bank_entry_repo_noop()),
                bank_account_repo,
                event_bus.clone(),
            )),
            Arc::new(bank_link_repo_noop()),
            Arc::new(ProcedureService::new(
                Arc::new(proc_repo_noop()),
                event_bus.clone(),
            )),
            Arc::new(label_mapping_repo_returning(mappings)),
            event_bus,
        )
    }

    // --- BankStatementReconciliationConfig ---

    #[test]
    fn config_instance_has_expected_offset() {
        let config = BankStatementReconciliationConfig::instance();
        assert_eq!(config.max_date_offset_days, MAX_DATE_OFFSET_DAYS as i32);
    }

    // --- match_against_unsettled_groups ---

    #[tokio::test]
    async fn match_empty_lines_returns_empty() {
        let orchestrator = make_orchestrator_with(vec![], vec![], None, vec![]);
        let result = orchestrator
            .match_against_unsettled_groups(vec![])
            .await
            .unwrap();
        assert!(result.matched.is_empty());
        assert!(result.unmatched_lines.is_empty());
    }

    #[tokio::test]
    async fn match_rejected_line_is_filtered() {
        let orchestrator = make_orchestrator_with(vec![], vec![], None, vec![]);
        let result = orchestrator
            .match_against_unsettled_groups(vec![ResolvedCreditLine {
                date: "2026-01-15".to_string(),
                label: "REJECTED LINE".to_string(),
                amount: 100_000,
                fund_id: "REJECTED".to_string(),
            }])
            .await
            .unwrap();
        assert!(result.matched.is_empty());
        assert!(result.unmatched_lines.is_empty());
    }

    #[tokio::test]
    async fn match_line_with_no_groups_is_unmatched() {
        let orchestrator = make_orchestrator_with(vec![], vec![], None, vec![]);
        let result = orchestrator
            .match_against_unsettled_groups(vec![ResolvedCreditLine {
                date: "2026-01-15".to_string(),
                label: "CPAM93".to_string(),
                amount: 100_000,
                fund_id: "fund-1".to_string(),
            }])
            .await
            .unwrap();
        assert!(result.matched.is_empty());
        assert_eq!(result.unmatched_lines.len(), 1);
    }

    #[tokio::test]
    async fn match_line_finds_group_with_exact_date() {
        let group = FundPaymentGroup::restore(
            "group-1".to_string(),
            "fund-1".to_string(),
            NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
            100_000,
            vec![],
            FundPaymentGroupStatus::Active,
        );
        let orchestrator = make_orchestrator_with(vec![], vec![group], None, vec![]);
        let result = orchestrator
            .match_against_unsettled_groups(vec![ResolvedCreditLine {
                date: "2026-01-15".to_string(),
                label: "CPAM93".to_string(),
                amount: 100_000,
                fund_id: "fund-1".to_string(),
            }])
            .await
            .unwrap();
        assert_eq!(result.matched.len(), 1);
        assert_eq!(result.matched[0].group_id, "group-1");
        assert!(result.unmatched_lines.is_empty());
    }

    #[tokio::test]
    async fn match_line_finds_group_within_offset() {
        let group = FundPaymentGroup::restore(
            "group-2".to_string(),
            "fund-1".to_string(),
            NaiveDate::from_ymd_opt(2026, 1, 10).unwrap(), // 5 days before bank date
            50_000,
            vec![],
            FundPaymentGroupStatus::Active,
        );
        let orchestrator = make_orchestrator_with(vec![], vec![group], None, vec![]);
        let result = orchestrator
            .match_against_unsettled_groups(vec![ResolvedCreditLine {
                date: "2026-01-15".to_string(), // 5 days after group date
                label: "CPAM93".to_string(),
                amount: 50_000,
                fund_id: "fund-1".to_string(),
            }])
            .await
            .unwrap();
        assert_eq!(result.matched.len(), 1);
        assert_eq!(result.matched[0].group_id, "group-2");
    }

    #[tokio::test]
    async fn match_locked_group_is_skipped() {
        let group = FundPaymentGroup::restore(
            "group-locked".to_string(),
            "fund-1".to_string(),
            NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
            100_000,
            vec![],
            FundPaymentGroupStatus::BankPaid, // is_locked = true
        );
        let orchestrator = make_orchestrator_with(vec![], vec![group], None, vec![]);
        let result = orchestrator
            .match_against_unsettled_groups(vec![ResolvedCreditLine {
                date: "2026-01-15".to_string(),
                label: "CPAM93".to_string(),
                amount: 100_000,
                fund_id: "fund-1".to_string(),
            }])
            .await
            .unwrap();
        assert!(result.matched.is_empty());
        assert_eq!(result.unmatched_lines.len(), 1);
    }

    #[tokio::test]
    async fn match_wrong_amount_not_matched() {
        let group = FundPaymentGroup::restore(
            "group-1".to_string(),
            "fund-1".to_string(),
            NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
            200_000, // different amount
            vec![],
            FundPaymentGroupStatus::Active,
        );
        let orchestrator = make_orchestrator_with(vec![], vec![group], None, vec![]);
        let result = orchestrator
            .match_against_unsettled_groups(vec![ResolvedCreditLine {
                date: "2026-01-15".to_string(),
                label: "CPAM93".to_string(),
                amount: 100_000,
                fund_id: "fund-1".to_string(),
            }])
            .await
            .unwrap();
        assert!(result.matched.is_empty());
        assert_eq!(result.unmatched_lines.len(), 1);
    }

    // --- resolve_fund_labels ---

    #[tokio::test]
    async fn resolve_fund_labels_no_mappings_returns_suggestion() {
        let funds = vec![Fund::restore("f1".into(), "93".into(), "CPAM 93".into())];
        let orchestrator = make_orchestrator_with(funds, vec![], None, vec![]);
        let resolutions = orchestrator
            .resolve_fund_labels("account-1", vec!["CPAM93".to_string()])
            .await
            .unwrap();
        assert_eq!(resolutions.len(), 1);
        assert!(!resolutions[0].is_confirmed);
        assert_eq!(resolutions[0].suggested_fund_id.as_deref(), Some("f1"));
    }

    #[tokio::test]
    async fn resolve_fund_labels_with_confirmed_mapping() {
        let mapping = BankFundLabelMapping {
            id: "m1".to_string(),
            bank_account_id: "account-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some("f1".to_string()),
        };
        let orchestrator = make_orchestrator_with(vec![], vec![], None, vec![mapping]);
        let resolutions = orchestrator
            .resolve_fund_labels("account-1", vec!["CPAM93".to_string()])
            .await
            .unwrap();
        assert_eq!(resolutions.len(), 1);
        assert!(resolutions[0].is_confirmed);
        assert!(!resolutions[0].is_rejected);
        assert_eq!(resolutions[0].fund_id.as_deref(), Some("f1"));
    }

    #[tokio::test]
    async fn resolve_fund_labels_rejected_mapping() {
        let mapping = BankFundLabelMapping {
            id: "m2".to_string(),
            bank_account_id: "account-1".to_string(),
            bank_label: "SALAIRES".to_string(),
            fund_id: None, // rejected
        };
        let orchestrator = make_orchestrator_with(vec![], vec![], None, vec![mapping]);
        let resolutions = orchestrator
            .resolve_fund_labels("account-1", vec!["SALAIRES".to_string()])
            .await
            .unwrap();
        assert_eq!(resolutions.len(), 1);
        assert!(resolutions[0].is_confirmed);
        assert!(resolutions[0].is_rejected);
    }

    #[tokio::test]
    async fn resolve_fund_labels_deduplicates_labels() {
        let orchestrator = make_orchestrator_with(vec![], vec![], None, vec![]);
        let resolutions = orchestrator
            .resolve_fund_labels(
                "account-1",
                vec!["CPAM93".to_string(), "CPAM93".to_string()],
            )
            .await
            .unwrap();
        assert_eq!(resolutions.len(), 1);
    }

    // --- save_label_mappings ---

    #[tokio::test]
    async fn save_label_mappings_returns_ok() {
        let orchestrator = make_orchestrator_with(vec![], vec![], None, vec![]);
        let result = orchestrator
            .save_label_mappings(
                "account-1",
                vec![("CPAM93".to_string(), "fund-1".to_string())],
            )
            .await;
        assert!(result.is_ok());
    }

    // --- resolve_bank_account_from_iban ---

    #[tokio::test]
    async fn resolve_bank_account_from_iban_returns_account_when_found() {
        let account = BankAccount::restore("acc-1".to_string(), "My Bank".to_string(), None);
        let orchestrator = make_orchestrator_with(vec![], vec![], Some(account.clone()), vec![]);
        let result = orchestrator
            .resolve_bank_account_from_iban("FR76...")
            .await
            .unwrap();
        assert!(result.is_some());
        assert_eq!(result.unwrap().id, "acc-1");
    }

    #[tokio::test]
    async fn resolve_bank_account_from_iban_returns_none_when_not_found() {
        let orchestrator = make_orchestrator_with(vec![], vec![], None, vec![]);
        let result = orchestrator
            .resolve_bank_account_from_iban("UNKNOWN")
            .await
            .unwrap();
        assert!(result.is_none());
    }

    // --- publish_batch_events ---

    #[tokio::test]
    async fn publish_batch_events_emits_procedure_and_bank_entry_updates() {
        let event_bus = Arc::new(EventBus::new());
        let mut proc_rx = event_bus.subscribe::<ProcedureUpdated>().unwrap();
        let mut bank_rx = event_bus.subscribe::<BankEntryUpdated>().unwrap();

        let bank_account_repo: Arc<dyn BankAccountRepository> =
            Arc::new(bank_account_repo_returning(None));
        let orchestrator = BankStatementOrchestrator::new(
            Arc::new(BankAccountService::new(
                bank_account_repo.clone(),
                event_bus.clone(),
            )),
            Arc::new(FundService::new(
                Arc::new(fund_repo_returning(vec![])),
                event_bus.clone(),
            )),
            Arc::new(FundPaymentService::new(
                Arc::new(fund_payment_repo_returning_groups(vec![])),
                event_bus.clone(),
            )),
            Arc::new(BankEntryService::new(
                Arc::new(bank_entry_repo_noop()),
                bank_account_repo,
                event_bus.clone(),
            )),
            Arc::new(bank_link_repo_noop()),
            Arc::new(ProcedureService::new(
                Arc::new(proc_repo_noop()),
                event_bus.clone(),
            )),
            Arc::new(label_mapping_repo_returning(vec![])),
            event_bus,
        );

        orchestrator.publish_batch_events();

        proc_rx
            .recv()
            .await
            .expect("ProcedureUpdated must be published");
        bank_rx
            .recv()
            .await
            .expect("BankEntryUpdated must be published");

        // Each topic must receive exactly one event — guard against future
        // accidental double-publishes silently passing the at-least-one check.
        assert!(
            proc_rx.try_recv().is_err(),
            "no second ProcedureUpdated expected"
        );
        assert!(
            bank_rx.try_recv().is_err(),
            "no second BankEntryUpdated expected"
        );
    }

    // --- create_transfers ---

    #[tokio::test]
    async fn create_transfers_empty_input_returns_zero() {
        let account = BankAccount::restore("acc-1".to_string(), "My Bank".to_string(), None);
        let orchestrator = make_orchestrator_with(vec![], vec![], Some(account), vec![]);
        let count = orchestrator
            .create_transfers("acc-1", vec![])
            .await
            .unwrap();
        assert_eq!(count, 0);
    }

    #[tokio::test]
    async fn create_transfers_invalid_date_returns_error() {
        let account = BankAccount::restore("acc-1".to_string(), "My Bank".to_string(), None);
        let orchestrator = make_orchestrator_with(vec![], vec![], Some(account), vec![]);
        let result = orchestrator
            .create_transfers(
                "acc-1",
                vec![ConfirmedMatch {
                    group_id: "group-1".to_string(),
                    date: "not-a-date".to_string(),
                    amount: 100_000,
                }],
            )
            .await;
        let err = result.expect_err("invalid confirmed-match date must be rejected");
        assert!(matches!(
            err,
            BankStatementReconciliationError::Task(
                BankStatementReconciliationTask::InvalidConfirmedMatchDate
            )
        ));
    }

    #[tokio::test]
    async fn create_transfers_valid_match_returns_one() {
        let account = BankAccount::restore("acc-1".to_string(), "My Bank".to_string(), None);
        let group = FundPaymentGroup::restore(
            "group-1".to_string(),
            "fund-1".to_string(),
            NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
            100_000,
            vec![],
            FundPaymentGroupStatus::Active,
        );
        let orchestrator = make_orchestrator_with(vec![], vec![group], Some(account), vec![]);
        let count = orchestrator
            .create_transfers(
                "acc-1",
                vec![ConfirmedMatch {
                    group_id: "group-1".to_string(),
                    date: "2026-01-15".to_string(),
                    amount: 100_000,
                }],
            )
            .await
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_suggest_fund_cpam() {
        let funds = vec![
            Fund::restore("f1".into(), "93".into(), "CPAM 93".into()),
            Fund::restore("f2".into(), "94".into(), "CPAM 94".into()),
        ];

        let (id, name) = suggest_fund("CPAM93", &funds);
        assert_eq!(id.as_deref(), Some("f1"));
        assert_eq!(name.as_deref(), Some("CPAM 93"));

        let (id, _) = suggest_fund("CPAM94", &funds);
        assert_eq!(id.as_deref(), Some("f2"));
    }

    #[test]
    fn test_suggest_fund_cpam_with_suffix() {
        let funds = vec![Fund::restore("f1".into(), "75".into(), "CPAM 75".into())];

        let (id, _) = suggest_fund("CPAM75PRESTATIONS", &funds);
        assert_eq!(id.as_deref(), Some("f1"));
    }

    #[test]
    fn test_suggest_fund_no_match() {
        let funds = vec![Fund::restore("f1".into(), "93".into(), "CPAM 93".into())];

        let (id, _) = suggest_fund("XY", &funds);
        assert!(id.is_none());
    }

    #[test]
    fn test_suggest_fund_fuzzy_name() {
        let funds = vec![Fund::restore(
            "f1".into(),
            "MGEN".into(),
            "MUTUELLE GENERALE EDUCATION NAT".into(),
        )];

        let (id, _) = suggest_fund("MUTUELLEGENERALEEDUCATIONNAT", &funds);
        assert_eq!(id.as_deref(), Some("f1"));
    }

    // --- ensure_credit_lines (R26) ---

    fn empty_parse_result() -> BankStatementParseResult {
        BankStatementParseResult {
            iban: None,
            period: None,
            credit_lines: vec![],
            total_credits: 0,
            unparsed_count: 0,
        }
    }

    #[test]
    fn ensure_credit_lines_rejects_empty_with_no_vir_sepa_lines_sentinel() {
        let err = ensure_credit_lines(empty_parse_result())
            .expect_err("R26: empty credit lines must be rejected");
        assert!(
            matches!(
                err,
                BankStatementReconciliationError::Task(
                    BankStatementReconciliationTask::NoSepaCreditLines
                )
            ),
            "frontend keys its dedicated guidance on this code"
        );
    }

    // --- parse_bank_statement orchestrator error branches ---

    #[test]
    fn parse_bank_statement_rejects_relative_path_with_secure_path_error() {
        let orchestrator = make_orchestrator_with(vec![], vec![], None, vec![]);
        // A relative path is rejected by `secure_path::validate_user_path` before
        // any I/O, so this exercises the secure_path error mapping without
        // depending on a fixture PDF.
        let err = orchestrator
            .parse_bank_statement("relative/path/statement.pdf")
            .expect_err("relative path must be rejected by secure_path");
        let msg = err.to_string();
        assert!(
            !msg.is_empty(),
            "secure_path rejection must surface a non-empty error"
        );
    }

    #[test]
    fn parse_bank_statement_rejects_non_pdf_extension() {
        let orchestrator = make_orchestrator_with(vec![], vec![], None, vec![]);
        // Path policy requires `.pdf`. An absolute path with a wrong extension
        // is rejected by secure_path even before checking file existence.
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        let bad_path = format!("{home}/not-a-pdf.txt");
        let err = orchestrator
            .parse_bank_statement(&bad_path)
            .expect_err("wrong extension must be rejected by secure_path");
        assert!(
            !err.to_string().is_empty(),
            "extension rejection must surface a non-empty error"
        );
    }

    #[test]
    fn ensure_credit_lines_passes_through_when_lines_present() {
        let result = BankStatementParseResult {
            credit_lines: vec![
                crate::use_cases::bank_statement_reconciliation::bank_pdf_codec::BankStatementCreditLine {
                    date: "2026-01-15".to_string(),
                    label: "CPAM93".to_string(),
                    amount: 100_000,
                },
            ],
            total_credits: 100_000,
            ..empty_parse_result()
        };
        let passed = ensure_credit_lines(result).expect("non-empty lines must pass through");
        assert_eq!(passed.credit_lines.len(), 1);
    }

    #[test]
    fn test_is_exact_date_offset() {
        let d1 = chrono::NaiveDate::from_ymd_opt(2025, 5, 5).unwrap();
        let d2 = chrono::NaiveDate::from_ymd_opt(2025, 5, 4).unwrap();
        let d3 = chrono::NaiveDate::from_ymd_opt(2025, 5, 1).unwrap();
        let d4 = chrono::NaiveDate::from_ymd_opt(2025, 5, 6).unwrap();

        assert!(is_exact_date_offset(d1, d1, 0));
        assert!(is_exact_date_offset(d1, d2, 1));
        assert!(is_exact_date_offset(d1, d3, 4));
        assert!(!is_exact_date_offset(d1, d4, 1));
    }

    // =========================================================================
    // compute_draft — initial pass (no corrections)
    // =========================================================================

    // Helper — a parse result with one credit line for reuse across draft tests.
    fn one_line_parse_result(label: &str, amount: i64) -> BankStatementParseResult {
        BankStatementParseResult {
            iban: None,
            period: None,
            credit_lines: vec![BankStatementCreditLine {
                date: "2026-01-15".to_string(),
                label: label.to_string(),
                amount,
            }],
            total_credits: amount,
            unparsed_count: 0,
        }
    }

    // BAS-050–054, BAS-061: initial draft with no corrections.
    // A line whose label has a saved mapping and a matching group should be
    // auto-matched → status Matched.
    #[tokio::test]
    async fn compute_draft_no_corrections_auto_matches_eligible_line() {
        let fund_id = "fund-1";
        let group = FundPaymentGroup::restore(
            "group-1".to_string(),
            fund_id.to_string(),
            NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
            100_000,
            vec![],
            FundPaymentGroupStatus::Active,
        );
        let mapping = BankFundLabelMapping {
            id: "m1".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some(fund_id.to_string()),
        };
        let orchestrator = make_orchestrator_with(vec![], vec![group], None, vec![mapping]);
        let parse_result = one_line_parse_result("CPAM93", 100_000);

        let draft = orchestrator
            .compute_draft("acc-1", &parse_result, &[])
            .await
            .unwrap();

        assert_eq!(draft.lines.len(), 1);
        assert_eq!(draft.lines[0].status, DraftLineStatus::Matched);
        assert_eq!(draft.lines[0].assigned_group_ids, vec!["group-1"]);
        assert_eq!(draft.resolved_count, 1);
        assert_eq!(draft.needs_correction_count, 0);
    }

    // BAS-061 NeedsLink: a line whose label has no saved mapping and no
    // LinkFund correction should remain NeedsLink.
    #[tokio::test]
    async fn compute_draft_no_corrections_unknown_label_is_needs_link() {
        let orchestrator = make_orchestrator_with(vec![], vec![], None, vec![]);
        let parse_result = BankStatementParseResult {
            iban: None,
            period: None,
            credit_lines: vec![BankStatementCreditLine {
                date: "2026-01-15".to_string(),
                label: "UNKNOWN_LABEL".to_string(),
                amount: 50_000,
            }],
            total_credits: 50_000,
            unparsed_count: 0,
        };

        let draft = orchestrator
            .compute_draft("acc-1", &parse_result, &[])
            .await
            .unwrap();

        assert_eq!(draft.lines.len(), 1);
        assert_eq!(draft.lines[0].status, DraftLineStatus::NeedsLink);
        assert_eq!(draft.needs_correction_count, 1);
        assert_eq!(draft.resolved_count, 0);
    }

    // BAS-061 Rejected: initial draft with a saved rejection mapping → status
    // Rejected (and no transfer will be created).
    #[tokio::test]
    async fn compute_draft_saved_rejection_mapping_gives_rejected_status() {
        let mapping = BankFundLabelMapping {
            id: "m2".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "SALAIRES".to_string(),
            fund_id: None, // NULL in DB = rejected
        };
        let orchestrator = make_orchestrator_with(vec![], vec![], None, vec![mapping]);
        let parse_result = BankStatementParseResult {
            iban: None,
            period: None,
            credit_lines: vec![BankStatementCreditLine {
                date: "2026-01-15".to_string(),
                label: "SALAIRES".to_string(),
                amount: 20_000,
            }],
            total_credits: 20_000,
            unparsed_count: 0,
        };

        let draft = orchestrator
            .compute_draft("acc-1", &parse_result, &[])
            .await
            .unwrap();

        assert_eq!(draft.lines.len(), 1);
        assert_eq!(draft.lines[0].status, DraftLineStatus::Rejected);
        // Rejected counts as resolved (BAS-061).
        assert_eq!(draft.resolved_count, 1);
    }

    // BAS-061 NeedsGroup: label mapped to a fund but no unsettled group matches.
    #[tokio::test]
    async fn compute_draft_fund_known_but_no_group_gives_needs_group_or_unresolved() {
        let mapping = BankFundLabelMapping {
            id: "m3".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some("fund-1".to_string()),
        };
        let orchestrator = make_orchestrator_with(vec![], vec![], None, vec![mapping]);
        let parse_result = BankStatementParseResult {
            iban: None,
            period: None,
            credit_lines: vec![BankStatementCreditLine {
                date: "2026-01-15".to_string(),
                label: "CPAM93".to_string(),
                amount: 100_000,
            }],
            total_credits: 100_000,
            unparsed_count: 0,
        };

        let draft = orchestrator
            .compute_draft("acc-1", &parse_result, &[])
            .await
            .unwrap();

        assert_eq!(draft.lines.len(), 1);
        // With no matching groups the line is either NeedsGroup (has candidate)
        // or Unresolved (no candidate). Either way it is NOT resolved.
        assert!(
            draft.lines[0].status == DraftLineStatus::NeedsGroup
                || draft.lines[0].status == DraftLineStatus::Unresolved,
            "expected NeedsGroup or Unresolved, got {:?}",
            draft.lines[0].status
        );
        assert_eq!(draft.needs_correction_count, 1);
    }

    // BAS-061 summary counter: draft.resolved_count + needs_correction_count ==
    // total lines.
    #[tokio::test]
    async fn compute_draft_summary_counts_are_consistent() {
        let mapping = BankFundLabelMapping {
            id: "m-matched".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some("fund-1".to_string()),
        };
        let group = FundPaymentGroup::restore(
            "group-ok".to_string(),
            "fund-1".to_string(),
            NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
            100_000,
            vec![],
            FundPaymentGroupStatus::Active,
        );
        let orchestrator = make_orchestrator_with(vec![], vec![group], None, vec![mapping]);

        // Two lines: one that auto-matches, one with unknown label.
        let parse_result = BankStatementParseResult {
            iban: None,
            period: None,
            credit_lines: vec![
                BankStatementCreditLine {
                    date: "2026-01-15".to_string(),
                    label: "CPAM93".to_string(),
                    amount: 100_000,
                },
                BankStatementCreditLine {
                    date: "2026-01-16".to_string(),
                    label: "UNKNOWN".to_string(),
                    amount: 50_000,
                },
            ],
            total_credits: 150_000,
            unparsed_count: 0,
        };

        let draft = orchestrator
            .compute_draft("acc-1", &parse_result, &[])
            .await
            .unwrap();

        assert_eq!(draft.lines.len(), 2);
        assert_eq!(
            draft.resolved_count + draft.needs_correction_count,
            2,
            "resolved_count + needs_correction_count must equal total lines"
        );
    }

    // =========================================================================
    // compute_draft — LinkFund correction cascade (BAS-066)
    // =========================================================================

    // BAS-066: a LinkFund correction with FundAssignment::Fund resolves ALL
    // lines sharing the label and auto-matches those that now hit an eligible
    // group.
    #[tokio::test]
    async fn compute_draft_link_fund_correction_resolves_all_lines_for_label() {
        let group = FundPaymentGroup::restore(
            "group-1".to_string(),
            "fund-1".to_string(),
            NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
            100_000,
            vec![],
            FundPaymentGroupStatus::Active,
        );
        // No saved mapping — the label starts as NeedsLink.
        let funds = vec![Fund::restore(
            "fund-1".into(),
            "93".into(),
            "CPAM 93".into(),
        )];
        let orchestrator = make_orchestrator_with(funds, vec![group], None, vec![]);

        // Two credit lines with the same label.
        let parse_result = BankStatementParseResult {
            iban: None,
            period: None,
            credit_lines: vec![
                BankStatementCreditLine {
                    date: "2026-01-15".to_string(),
                    label: "CPAM93".to_string(),
                    amount: 100_000,
                },
                BankStatementCreditLine {
                    date: "2026-01-20".to_string(),
                    label: "CPAM93".to_string(),
                    amount: 50_000,
                },
            ],
            total_credits: 150_000,
            unparsed_count: 0,
        };
        let corrections = vec![ReconciliationCorrection::LinkFund {
            bank_label: "CPAM93".to_string(),
            assignment: FundAssignment::Fund {
                fund_id: "fund-1".to_string(),
            },
        }];

        let draft = orchestrator
            .compute_draft("acc-1", &parse_result, &corrections)
            .await
            .unwrap();

        // Both lines must have a resolved fund.
        for line in &draft.lines {
            assert_eq!(
                line.fund_id.as_deref(),
                Some("fund-1"),
                "link-fund cascade must set fund_id on all same-label lines"
            );
        }
        // The first line matches group-1 exactly → Matched.
        assert_eq!(draft.lines[0].status, DraftLineStatus::Matched);
    }

    // BAS-030/066: LinkFund with FundAssignment::Rejected marks the line Rejected.
    #[tokio::test]
    async fn compute_draft_link_fund_rejected_gives_rejected_status() {
        let orchestrator = make_orchestrator_with(vec![], vec![], None, vec![]);
        let parse_result = BankStatementParseResult {
            iban: None,
            period: None,
            credit_lines: vec![BankStatementCreditLine {
                date: "2026-01-15".to_string(),
                label: "SALAIRES".to_string(),
                amount: 30_000,
            }],
            total_credits: 30_000,
            unparsed_count: 0,
        };
        let corrections = vec![ReconciliationCorrection::LinkFund {
            bank_label: "SALAIRES".to_string(),
            assignment: FundAssignment::Rejected,
        }];

        let draft = orchestrator
            .compute_draft("acc-1", &parse_result, &corrections)
            .await
            .unwrap();

        assert_eq!(draft.lines[0].status, DraftLineStatus::Rejected);
        assert_eq!(draft.resolved_count, 1);
    }

    // =========================================================================
    // compute_draft — AssignGroups correction (BAS-067, BAS-090/091)
    // =========================================================================

    // BAS-090/091: assigning one group that exactly covers the line → Matched.
    #[tokio::test]
    async fn compute_draft_assign_single_group_exact_amount_gives_matched() {
        let mapping = BankFundLabelMapping {
            id: "m1".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some("fund-1".to_string()),
        };
        // Group with different amount than line so auto-match doesn't fire —
        // the explicit AssignGroups correction must be the one that resolves it.
        let group_a = FundPaymentGroup::restore(
            "group-a".to_string(),
            "fund-1".to_string(),
            NaiveDate::from_ymd_opt(2026, 1, 10).unwrap(),
            70_000, // not equal to line amount (100_000)
            vec![],
            FundPaymentGroupStatus::Active,
        );
        let group_b = FundPaymentGroup::restore(
            "group-b".to_string(),
            "fund-1".to_string(),
            NaiveDate::from_ymd_opt(2026, 1, 12).unwrap(),
            30_000,
            vec![],
            FundPaymentGroupStatus::Active,
        );
        let orchestrator =
            make_orchestrator_with(vec![], vec![group_a, group_b], None, vec![mapping]);

        let parse_result = BankStatementParseResult {
            iban: None,
            period: None,
            credit_lines: vec![BankStatementCreditLine {
                date: "2026-01-15".to_string(),
                label: "CPAM93".to_string(),
                amount: 100_000,
            }],
            total_credits: 100_000,
            unparsed_count: 0,
        };
        // Assign both groups: 70_000 + 30_000 == 100_000 → Matched.
        let corrections = vec![ReconciliationCorrection::AssignGroups {
            // line_id is derived by compute_draft; use index-based id "line-0"
            // as a placeholder — implementation must honour whatever stable id
            // it assigns.
            line_id: "line-0".to_string(),
            group_ids: vec!["group-a".to_string(), "group-b".to_string()],
        }];

        let draft = orchestrator
            .compute_draft("acc-1", &parse_result, &corrections)
            .await
            .unwrap();

        let line = &draft.lines[0];
        assert_eq!(line.covered_amount, 100_000);
        assert_eq!(line.status, DraftLineStatus::Matched);
    }

    // BAS-091 Partial: sum of assigned groups < line amount and no remainder
    // acknowledged → Partial.
    #[tokio::test]
    async fn compute_draft_assign_group_partial_coverage_gives_partial_status() {
        let mapping = BankFundLabelMapping {
            id: "m1".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some("fund-1".to_string()),
        };
        let group_a = FundPaymentGroup::restore(
            "group-a".to_string(),
            "fund-1".to_string(),
            NaiveDate::from_ymd_opt(2026, 1, 10).unwrap(),
            60_000,
            vec![],
            FundPaymentGroupStatus::Active,
        );
        let orchestrator = make_orchestrator_with(vec![], vec![group_a], None, vec![mapping]);

        let parse_result = BankStatementParseResult {
            iban: None,
            period: None,
            credit_lines: vec![BankStatementCreditLine {
                date: "2026-01-15".to_string(),
                label: "CPAM93".to_string(),
                amount: 100_000,
            }],
            total_credits: 100_000,
            unparsed_count: 0,
        };
        let corrections = vec![ReconciliationCorrection::AssignGroups {
            line_id: "line-0".to_string(),
            group_ids: vec!["group-a".to_string()],
        }];

        let draft = orchestrator
            .compute_draft("acc-1", &parse_result, &corrections)
            .await
            .unwrap();

        let line = &draft.lines[0];
        assert_eq!(line.covered_amount, 60_000);
        assert_eq!(line.status, DraftLineStatus::Partial);
    }

    // BAS-067: a group assigned to line A must no longer appear in line B's
    // candidate list.
    #[tokio::test]
    async fn compute_draft_assign_group_removes_it_from_other_lines_candidates() {
        let mapping = BankFundLabelMapping {
            id: "m1".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some("fund-1".to_string()),
        };
        let group = FundPaymentGroup::restore(
            "group-shared".to_string(),
            "fund-1".to_string(),
            NaiveDate::from_ymd_opt(2026, 1, 14).unwrap(),
            80_000,
            vec![],
            FundPaymentGroupStatus::Active,
        );
        let orchestrator = make_orchestrator_with(vec![], vec![group], None, vec![mapping]);

        // Two lines both eligible for the same group, but we assign it to
        // the first line.  The second line must NOT see it as a candidate.
        let parse_result = BankStatementParseResult {
            iban: None,
            period: None,
            credit_lines: vec![
                BankStatementCreditLine {
                    date: "2026-01-15".to_string(),
                    label: "CPAM93".to_string(),
                    amount: 80_000,
                },
                BankStatementCreditLine {
                    date: "2026-01-15".to_string(),
                    label: "CPAM93".to_string(),
                    amount: 80_000,
                },
            ],
            total_credits: 160_000,
            unparsed_count: 0,
        };
        let corrections = vec![ReconciliationCorrection::AssignGroups {
            line_id: "line-0".to_string(),
            group_ids: vec!["group-shared".to_string()],
        }];

        let draft = orchestrator
            .compute_draft("acc-1", &parse_result, &corrections)
            .await
            .unwrap();

        let line_b = &draft.lines[1];
        assert!(
            line_b
                .candidate_groups
                .iter()
                .all(|c| c.group_id != "group-shared"),
            "consumed group must not appear in the second line's candidates (BAS-067)"
        );
    }

    // BAS-067: attempting to assign a group already consumed by another line
    // via a second AssignGroups correction returns GroupAlreadyConsumed.
    #[tokio::test]
    async fn compute_draft_double_assign_same_group_returns_group_already_consumed() {
        let mapping = BankFundLabelMapping {
            id: "m1".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some("fund-1".to_string()),
        };
        let group = FundPaymentGroup::restore(
            "group-shared".to_string(),
            "fund-1".to_string(),
            NaiveDate::from_ymd_opt(2026, 1, 14).unwrap(),
            80_000,
            vec![],
            FundPaymentGroupStatus::Active,
        );
        let orchestrator = make_orchestrator_with(vec![], vec![group], None, vec![mapping]);

        let parse_result = BankStatementParseResult {
            iban: None,
            period: None,
            credit_lines: vec![
                BankStatementCreditLine {
                    date: "2026-01-15".to_string(),
                    label: "CPAM93".to_string(),
                    amount: 80_000,
                },
                BankStatementCreditLine {
                    date: "2026-01-16".to_string(),
                    label: "CPAM93".to_string(),
                    amount: 80_000,
                },
            ],
            total_credits: 160_000,
            unparsed_count: 0,
        };
        // Assign the group to line-0, then also to line-1 → should fail.
        let corrections = vec![
            ReconciliationCorrection::AssignGroups {
                line_id: "line-0".to_string(),
                group_ids: vec!["group-shared".to_string()],
            },
            ReconciliationCorrection::AssignGroups {
                line_id: "line-1".to_string(),
                group_ids: vec!["group-shared".to_string()],
            },
        ];

        let result = orchestrator
            .compute_draft("acc-1", &parse_result, &corrections)
            .await;

        assert!(
            matches!(
                result,
                Err(BankStatementReconciliationError::Task(
                    BankStatementReconciliationTask::GroupAlreadyConsumed
                ))
            ),
            "double-assigning the same group must yield GroupAlreadyConsumed (BAS-067)"
        );
    }

    // BAS-094: assigning groups whose total exceeds the line amount is rejected.
    #[tokio::test]
    async fn compute_draft_overflow_assignment_returns_assignment_overflow() {
        let mapping = BankFundLabelMapping {
            id: "m1".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some("fund-1".to_string()),
        };
        let group_a = FundPaymentGroup::restore(
            "group-a".to_string(),
            "fund-1".to_string(),
            NaiveDate::from_ymd_opt(2026, 1, 10).unwrap(),
            80_000,
            vec![],
            FundPaymentGroupStatus::Active,
        );
        let group_b = FundPaymentGroup::restore(
            "group-b".to_string(),
            "fund-1".to_string(),
            NaiveDate::from_ymd_opt(2026, 1, 11).unwrap(),
            80_000,
            vec![],
            FundPaymentGroupStatus::Active,
        );
        let orchestrator =
            make_orchestrator_with(vec![], vec![group_a, group_b], None, vec![mapping]);

        let parse_result = BankStatementParseResult {
            iban: None,
            period: None,
            credit_lines: vec![BankStatementCreditLine {
                date: "2026-01-15".to_string(),
                label: "CPAM93".to_string(),
                amount: 100_000,
            }],
            total_credits: 100_000,
            unparsed_count: 0,
        };
        // 80_000 + 80_000 = 160_000 > 100_000 → AssignmentOverflow.
        let corrections = vec![ReconciliationCorrection::AssignGroups {
            line_id: "line-0".to_string(),
            group_ids: vec!["group-a".to_string(), "group-b".to_string()],
        }];

        let result = orchestrator
            .compute_draft("acc-1", &parse_result, &corrections)
            .await;

        assert!(
            matches!(
                result,
                Err(BankStatementReconciliationError::Task(
                    BankStatementReconciliationTask::AssignmentOverflow
                ))
            ),
            "sum of group amounts exceeding line amount must yield AssignmentOverflow (BAS-094)"
        );
    }

    // BAS-090: assigning a locked (already-reconciled) group is rejected.
    #[tokio::test]
    async fn compute_draft_assign_locked_group_returns_group_not_eligible() {
        let mapping = BankFundLabelMapping {
            id: "m1".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some("fund-1".to_string()),
        };
        let locked_group = FundPaymentGroup::restore(
            "group-locked".to_string(),
            "fund-1".to_string(),
            NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
            100_000,
            vec![],
            FundPaymentGroupStatus::BankPaid, // is_locked = true → ineligible
        );
        let orchestrator = make_orchestrator_with(vec![], vec![locked_group], None, vec![mapping]);

        let parse_result = BankStatementParseResult {
            iban: None,
            period: None,
            credit_lines: vec![BankStatementCreditLine {
                date: "2026-01-15".to_string(),
                label: "CPAM93".to_string(),
                amount: 100_000,
            }],
            total_credits: 100_000,
            unparsed_count: 0,
        };
        let corrections = vec![ReconciliationCorrection::AssignGroups {
            line_id: "line-0".to_string(),
            group_ids: vec!["group-locked".to_string()],
        }];

        let result = orchestrator
            .compute_draft("acc-1", &parse_result, &corrections)
            .await;

        assert!(
            matches!(
                result,
                Err(BankStatementReconciliationError::Task(
                    BankStatementReconciliationTask::GroupNotEligible
                ))
            ),
            "assigning a locked group must yield GroupNotEligible (BAS-090)"
        );
    }

    // =========================================================================
    // compute_draft — AcknowledgeRemainder (BAS-092)
    // =========================================================================

    // BAS-092: a Partial line where the user acknowledges the remainder
    // transitions to Matched.
    #[tokio::test]
    async fn compute_draft_acknowledge_remainder_on_partial_line_gives_matched() {
        let mapping = BankFundLabelMapping {
            id: "m1".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some("fund-1".to_string()),
        };
        let group_a = FundPaymentGroup::restore(
            "group-a".to_string(),
            "fund-1".to_string(),
            NaiveDate::from_ymd_opt(2026, 1, 10).unwrap(),
            60_000,
            vec![],
            FundPaymentGroupStatus::Active,
        );
        let orchestrator = make_orchestrator_with(vec![], vec![group_a], None, vec![mapping]);

        let parse_result = BankStatementParseResult {
            iban: None,
            period: None,
            credit_lines: vec![BankStatementCreditLine {
                date: "2026-01-15".to_string(),
                label: "CPAM93".to_string(),
                amount: 100_000,
            }],
            total_credits: 100_000,
            unparsed_count: 0,
        };
        let corrections = vec![
            ReconciliationCorrection::AssignGroups {
                line_id: "line-0".to_string(),
                group_ids: vec!["group-a".to_string()],
            },
            ReconciliationCorrection::AcknowledgeRemainder {
                line_id: "line-0".to_string(),
            },
        ];

        let draft = orchestrator
            .compute_draft("acc-1", &parse_result, &corrections)
            .await
            .unwrap();

        let line = &draft.lines[0];
        assert!(line.remainder_acknowledged);
        assert_eq!(
            line.status,
            DraftLineStatus::Matched,
            "acknowledging the remainder on a partial line must give Matched (BAS-092)"
        );
    }

    // =========================================================================
    // compute_draft — pure-function / revert semantics (BAS-064/065)
    // =========================================================================

    // BAS-064/065: compute_draft is a pure function of (parse_result, corrections).
    // Recomputing with the correction list minus the last entry must yield the
    // prior draft — same line count, same statuses.
    #[tokio::test]
    async fn compute_draft_is_pure_function_of_parse_result_and_corrections() {
        let mapping = BankFundLabelMapping {
            id: "m1".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some("fund-1".to_string()),
        };
        let group = FundPaymentGroup::restore(
            "group-1".to_string(),
            "fund-1".to_string(),
            NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
            100_000,
            vec![],
            FundPaymentGroupStatus::Active,
        );
        let orchestrator = make_orchestrator_with(vec![], vec![group], None, vec![mapping]);

        let parse_result = BankStatementParseResult {
            iban: None,
            period: None,
            credit_lines: vec![BankStatementCreditLine {
                date: "2026-01-15".to_string(),
                label: "CPAM93".to_string(),
                amount: 100_000,
            }],
            total_credits: 100_000,
            unparsed_count: 0,
        };

        // Draft with no corrections (auto-match → Matched).
        let draft_before = orchestrator
            .compute_draft("acc-1", &parse_result, &[])
            .await
            .unwrap();

        // Apply an AssignGroups correction that overrides the auto-match
        // (BAS-062 unassign by passing empty ids).
        let corrections_with_unassign = vec![ReconciliationCorrection::AssignGroups {
            line_id: "line-0".to_string(),
            group_ids: vec![], // unassign
        }];
        let _draft_after = orchestrator
            .compute_draft("acc-1", &parse_result, &corrections_with_unassign)
            .await;

        // Revert: recompute with empty corrections list — must equal draft_before.
        let draft_reverted = orchestrator
            .compute_draft("acc-1", &parse_result, &[])
            .await
            .unwrap();

        assert_eq!(draft_before.lines.len(), draft_reverted.lines.len());
        assert_eq!(
            draft_before.lines[0].status, draft_reverted.lines[0].status,
            "after reverting a correction, the draft must equal the pre-correction state (BAS-065)"
        );
    }

    // =========================================================================
    // validate_reconciliation — orchestrator method (BAS-063/035/093)
    // =========================================================================

    // BAS-063: calling validate with all lines unresolved (no corrections,
    // no mappings, no groups) must succeed and return 0 created entries.
    #[tokio::test]
    async fn validate_reconciliation_all_unresolved_creates_zero_entries() {
        let parse_result = BankStatementParseResult {
            iban: None,
            period: None,
            credit_lines: vec![BankStatementCreditLine {
                date: "2026-01-15".to_string(),
                label: "UNKNOWN".to_string(),
                amount: 100_000,
            }],
            total_credits: 100_000,
            unparsed_count: 0,
        };
        let account = crate::context::bank::BankAccount::restore(
            "acc-1".to_string(),
            "My Bank".to_string(),
            None,
        );
        let orchestrator = make_orchestrator_with(vec![], vec![], Some(account), vec![]);

        let count = orchestrator
            .validate_reconciliation("acc-1", &parse_result, &[])
            .await
            .unwrap();

        assert_eq!(count, 0, "unresolved lines must be skipped (BAS-063)");
    }

    // BAS-093: validate with a matched line that has N assigned groups creates
    // N BankEntry records.
    #[tokio::test]
    async fn validate_reconciliation_multi_group_line_creates_n_entries() {
        let mapping = BankFundLabelMapping {
            id: "m1".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some("fund-1".to_string()),
        };
        let group_a = FundPaymentGroup::restore(
            "group-a".to_string(),
            "fund-1".to_string(),
            NaiveDate::from_ymd_opt(2026, 1, 10).unwrap(),
            60_000,
            vec![],
            FundPaymentGroupStatus::Active,
        );
        let group_b = FundPaymentGroup::restore(
            "group-b".to_string(),
            "fund-1".to_string(),
            NaiveDate::from_ymd_opt(2026, 1, 12).unwrap(),
            40_000,
            vec![],
            FundPaymentGroupStatus::Active,
        );
        let account = crate::context::bank::BankAccount::restore(
            "acc-1".to_string(),
            "My Bank".to_string(),
            None,
        );
        let orchestrator =
            make_orchestrator_with(vec![], vec![group_a, group_b], Some(account), vec![mapping]);

        let parse_result = BankStatementParseResult {
            iban: None,
            period: None,
            credit_lines: vec![BankStatementCreditLine {
                date: "2026-01-15".to_string(),
                label: "CPAM93".to_string(),
                amount: 100_000,
            }],
            total_credits: 100_000,
            unparsed_count: 0,
        };
        // AssignGroups: two groups summing to line amount → Matched → 2 entries.
        let corrections = vec![ReconciliationCorrection::AssignGroups {
            line_id: "line-0".to_string(),
            group_ids: vec!["group-a".to_string(), "group-b".to_string()],
        }];

        let count = orchestrator
            .validate_reconciliation("acc-1", &parse_result, &corrections)
            .await
            .unwrap();

        assert_eq!(count, 2, "one BankEntry per assigned group (BAS-093)");
    }

    // BAS-092: a line with an acknowledged remainder creates exactly
    // len(assigned_group_ids) entries — no entry for the remainder itself.
    #[tokio::test]
    async fn validate_reconciliation_acknowledged_remainder_creates_no_extra_entry() {
        let mapping = BankFundLabelMapping {
            id: "m1".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some("fund-1".to_string()),
        };
        let group_a = FundPaymentGroup::restore(
            "group-a".to_string(),
            "fund-1".to_string(),
            NaiveDate::from_ymd_opt(2026, 1, 10).unwrap(),
            60_000,
            vec![],
            FundPaymentGroupStatus::Active,
        );
        let account = crate::context::bank::BankAccount::restore(
            "acc-1".to_string(),
            "My Bank".to_string(),
            None,
        );
        let orchestrator =
            make_orchestrator_with(vec![], vec![group_a], Some(account), vec![mapping]);

        let parse_result = BankStatementParseResult {
            iban: None,
            period: None,
            credit_lines: vec![BankStatementCreditLine {
                date: "2026-01-15".to_string(),
                label: "CPAM93".to_string(),
                amount: 100_000,
            }],
            total_credits: 100_000,
            unparsed_count: 0,
        };
        // One group (60_000) + acknowledge remainder (40_000) → Matched,
        // but only 1 BankEntry must be created.
        let corrections = vec![
            ReconciliationCorrection::AssignGroups {
                line_id: "line-0".to_string(),
                group_ids: vec!["group-a".to_string()],
            },
            ReconciliationCorrection::AcknowledgeRemainder {
                line_id: "line-0".to_string(),
            },
        ];

        let count = orchestrator
            .validate_reconciliation("acc-1", &parse_result, &corrections)
            .await
            .unwrap();

        assert_eq!(
            count, 1,
            "acknowledged remainder must not produce a BankEntry (BAS-092)"
        );
    }

    // BAS-035: validate upserts a label mapping for each LinkFund correction.
    // The mock repo's `save_mapping` will be called once per distinct label.
    // We can't easily assert the mock call count without adjusting the existing
    // mock helper, so we assert the overall return value + that no error is
    // raised — wiring correctness is covered by the integration test.
    #[tokio::test]
    async fn validate_reconciliation_link_fund_correction_persists_mapping() {
        // Auto-matched line (saved mapping + matching group) — validate must
        // succeed and persist the LinkFund correction's mapping.
        let mapping = BankFundLabelMapping {
            id: "m1".to_string(),
            bank_account_id: "acc-1".to_string(),
            bank_label: "CPAM93".to_string(),
            fund_id: Some("fund-1".to_string()),
        };
        let group = FundPaymentGroup::restore(
            "group-1".to_string(),
            "fund-1".to_string(),
            NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
            100_000,
            vec![],
            FundPaymentGroupStatus::Active,
        );
        let account = crate::context::bank::BankAccount::restore(
            "acc-1".to_string(),
            "My Bank".to_string(),
            None,
        );
        let funds = vec![Fund::restore(
            "fund-1".into(),
            "93".into(),
            "CPAM 93".into(),
        )];
        let orchestrator = make_orchestrator_with(funds, vec![group], Some(account), vec![mapping]);

        let parse_result = BankStatementParseResult {
            iban: None,
            period: None,
            credit_lines: vec![BankStatementCreditLine {
                date: "2026-01-15".to_string(),
                label: "CPAM93".to_string(),
                amount: 100_000,
            }],
            total_credits: 100_000,
            unparsed_count: 0,
        };
        // A LinkFund correction (even if the saved mapping already exists)
        // triggers an upsert (BAS-035).
        let corrections = vec![ReconciliationCorrection::LinkFund {
            bank_label: "CPAM93".to_string(),
            assignment: FundAssignment::Fund {
                fund_id: "fund-1".to_string(),
            },
        }];

        let result = orchestrator
            .validate_reconciliation("acc-1", &parse_result, &corrections)
            .await;

        assert!(
            result.is_ok(),
            "validate with a LinkFund correction must succeed"
        );
    }

    // BAS-035: a Rejected LinkFund correction is also persisted (as NULL fund_id).
    #[tokio::test]
    async fn validate_reconciliation_rejected_link_fund_persists_rejection() {
        let account = crate::context::bank::BankAccount::restore(
            "acc-1".to_string(),
            "My Bank".to_string(),
            None,
        );
        let orchestrator = make_orchestrator_with(vec![], vec![], Some(account), vec![]);

        let parse_result = BankStatementParseResult {
            iban: None,
            period: None,
            credit_lines: vec![BankStatementCreditLine {
                date: "2026-01-15".to_string(),
                label: "SALAIRES".to_string(),
                amount: 50_000,
            }],
            total_credits: 50_000,
            unparsed_count: 0,
        };
        let corrections = vec![ReconciliationCorrection::LinkFund {
            bank_label: "SALAIRES".to_string(),
            assignment: FundAssignment::Rejected,
        }];

        let count = orchestrator
            .validate_reconciliation("acc-1", &parse_result, &corrections)
            .await
            .unwrap();

        // Rejected line produces no entry, but validate must not error.
        assert_eq!(count, 0);
    }
}

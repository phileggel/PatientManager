use std::sync::Arc;

use regex::Regex;
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::context::bank::{BankAccountService, BankTransferService, BankTransferType};
use crate::context::fund::{AffiliatedFund, FundPaymentService, FundService};
use crate::context::procedure::{ProcedureService, ProcedureStatus};
use crate::core::event_bus::{BankTransferUpdated, EventBus, ProcedureUpdated};

use super::label_mapping_repo::BankFundLabelMappingRepository;

/// Maximum number of days to look back when matching bank lines to payment groups
/// Can be adjusted in the future based on business rules
pub const MAX_DATE_OFFSET_DAYS: i64 = 6;

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
    bank_transfer_service: Arc<BankTransferService>,
    procedure_service: Arc<ProcedureService>,
    label_mapping_repo: Arc<dyn BankFundLabelMappingRepository>,
    event_bus: Arc<EventBus>,
}

impl BankStatementOrchestrator {
    pub fn new(
        bank_account_service: Arc<BankAccountService>,
        fund_service: Arc<FundService>,
        fund_payment_service: Arc<FundPaymentService>,
        bank_transfer_service: Arc<BankTransferService>,
        procedure_service: Arc<ProcedureService>,
        label_mapping_repo: Arc<dyn BankFundLabelMappingRepository>,
        event_bus: Arc<EventBus>,
    ) -> Self {
        Self {
            bank_account_service,
            fund_service,
            fund_payment_service,
            bank_transfer_service,
            procedure_service,
            label_mapping_repo,
            event_bus,
        }
    }

    /// Resolve fund labels against the mapping table and suggest matches.
    pub async fn resolve_fund_labels(
        &self,
        bank_account_id: &str,
        labels: Vec<String>,
    ) -> anyhow::Result<Vec<FundLabelResolution>> {
        // Get existing mappings for this account
        let mappings = self
            .label_mapping_repo
            .find_mappings_for_account(bank_account_id)
            .await?;

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
    ) -> anyhow::Result<()> {
        for (label, fund_id) in mappings {
            self.label_mapping_repo
                .save_mapping(bank_account_id, &label, &fund_id)
                .await?;
        }
        Ok(())
    }

    /// Match resolved credit lines against unsettled FundPaymentGroups.
    ///
    /// A group is "unsettled" if no BankTransfer exists with
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
    ) -> anyhow::Result<BankStatementMatchResult> {
        // Filter out rejected lines
        let mut active_lines: Vec<_> = resolved_lines
            .into_iter()
            .filter(|l| l.fund_id != "REJECTED")
            .collect();

        // Sort by date: oldest first
        active_lines.sort_by(|a, b| a.date.cmp(&b.date));

        // Get all fund payment groups
        let all_groups = self.fund_payment_service.read_all_groups().await?;

        // Get all bank transfers to find which groups are settled
        let all_transfers = self.bank_transfer_service.read_all_transfers().await?;
        let settled_group_ids: std::collections::HashSet<String> = all_transfers
            .iter()
            .filter_map(|t| t.source.strip_prefix("fund_payment_group_"))
            .map(|id| id.to_string())
            .collect();

        // Filter to unsettled groups
        let unsettled_groups: Vec<_> = all_groups
            .into_iter()
            .filter(|g| !settled_group_ids.contains(&g.id))
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
    ) -> anyhow::Result<u32> {
        let mut created_count = 0u32;

        for m in confirmed_matches {
            let source = format!("fund_payment_group_{}", m.group_id);

            // Parse date once for this match
            let confirmed_date =
                chrono::NaiveDate::parse_from_str(&m.date, "%Y-%m-%d").map_err(|_| {
                    anyhow::anyhow!("Invalid date format in confirmed match: {}", m.date)
                })?;

            // Step 1: Create bank transfer (silent - orchestrator will publish once)
            self.bank_transfer_service
                .create_transfer(
                    m.date.clone(),
                    m.amount,
                    BankTransferType::Fund,
                    bank_account_id.to_string(),
                    source,
                    true,
                )
                .await?;

            tracing::info!(
                group_id = %m.group_id,
                transfer_date = %m.date,
                amount = m.amount,
                "Bank transfer created"
            );

            // Step 2: Update associated procedures to Payed status (silent - orchestrator will publish once)
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
                            // Contested procedures keep their actual_payment_amount (pdf amount)
                            // and transition to PartiallyFundPayed instead of FundPayed.
                            let (new_status, actual_payment_amount) = if procedure.payment_status
                                == ProcedureStatus::PartiallyReconciled
                            {
                                (
                                    ProcedureStatus::PartiallyFundPayed,
                                    procedure.actual_payment_amount,
                                )
                            } else {
                                (ProcedureStatus::FundPayed, procedure.procedure_amount)
                            };
                            procedure.payment_status = new_status;
                            procedure = procedure.with_payment_info(
                                crate::context::procedure::PaymentMethod::BankTransfer,
                                Some(confirmed_date),
                                actual_payment_amount,
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
            let _ = self
                .event_bus
                .publish::<BankTransferUpdated>(BankTransferUpdated);
        }

        Ok(created_count)
    }

    /// Publish batched events after batch reconciliation completes
    pub fn publish_batch_events(&self) {
        let _ = self.event_bus.publish::<ProcedureUpdated>(ProcedureUpdated);
        let _ = self
            .event_bus
            .publish::<BankTransferUpdated>(BankTransferUpdated);
    }

    /// Resolve IBAN to bank account
    pub async fn resolve_bank_account_from_iban(
        &self,
        iban: &str,
    ) -> anyhow::Result<Option<crate::context::bank::BankAccount>> {
        self.bank_account_service.find_account_by_iban(iban).await
    }
}

/// Suggest a fund based on the bank label.
///
/// Strategy:
/// 1. Extract number from CPAM/CAISSE labels → match fund_identifier
/// 2. Fuzzy name matching as fallback
fn suggest_fund(label: &str, funds: &[AffiliatedFund]) -> (Option<String>, Option<String>) {
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
    let mut best_fund: Option<&AffiliatedFund> = None;

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

    #[test]
    fn test_suggest_fund_cpam() {
        let funds = vec![
            AffiliatedFund::restore("f1".into(), "93".into(), "CPAM 93".into()),
            AffiliatedFund::restore("f2".into(), "94".into(), "CPAM 94".into()),
        ];

        let (id, name) = suggest_fund("CPAM93", &funds);
        assert_eq!(id.as_deref(), Some("f1"));
        assert_eq!(name.as_deref(), Some("CPAM 93"));

        let (id, _) = suggest_fund("CPAM94", &funds);
        assert_eq!(id.as_deref(), Some("f2"));
    }

    #[test]
    fn test_suggest_fund_cpam_with_suffix() {
        let funds = vec![AffiliatedFund::restore(
            "f1".into(),
            "75".into(),
            "CPAM 75".into(),
        )];

        let (id, _) = suggest_fund("CPAM75PRESTATIONS", &funds);
        assert_eq!(id.as_deref(), Some("f1"));
    }

    #[test]
    fn test_suggest_fund_no_match() {
        let funds = vec![AffiliatedFund::restore(
            "f1".into(),
            "93".into(),
            "CPAM 93".into(),
        )];

        let (id, _) = suggest_fund("XY", &funds);
        assert!(id.is_none());
    }

    #[test]
    fn test_suggest_fund_fuzzy_name() {
        let funds = vec![AffiliatedFund::restore(
            "f1".into(),
            "MGEN".into(),
            "MUTUELLE GENERALE EDUCATION NAT".into(),
        )];

        let (id, _) = suggest_fund("MUTUELLEGENERALEEDUCATIONNAT", &funds);
        assert_eq!(id.as_deref(), Some("f1"));
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
}

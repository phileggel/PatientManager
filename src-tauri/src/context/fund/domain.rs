use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use specta::Type;
use uuid::Uuid;

use crate::context::fund::error::FundError;

/// Fund aggregate root
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Fund {
    pub fund_identifier: String,
    pub name: String,

    /// Temporary ID used during batch imports to map temp_id → real_id
    /// None for funds created through regular API
    /// Some(uuid) for funds created via Excel import
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temp_id: Option<String>,

    /// Metadata - not a domain property
    pub id: String,
}

impl Fund {
    /// Creates a new Fund with validation and generates ID.
    pub fn new(fund_identifier: String, name: String) -> Result<Self, FundError> {
        Self::validate(&fund_identifier, &name)?;

        Ok(Self {
            id: Uuid::new_v4().to_string(),
            fund_identifier,
            name,
            temp_id: None,
        })
    }

    /// Creates a new Fund from batch import with temporary ID.
    pub fn new_with_temp_id(
        fund_identifier: String,
        name: String,
        temp_id: String,
    ) -> Result<Self, FundError> {
        Self::validate(&fund_identifier, &name)?;

        Ok(Self {
            id: Uuid::new_v4().to_string(),
            fund_identifier,
            name,
            temp_id: Some(temp_id),
        })
    }

    /// Creates an Fund with an existing ID and validation.
    /// Does NOT generate a new ID.
    pub fn with_id(id: String, fund_identifier: String, name: String) -> Result<Self, FundError> {
        Self::validate(&fund_identifier, &name)?;

        Ok(Self {
            id,
            fund_identifier,
            name,
            temp_id: None,
        })
    }

    /// Restores an Fund from database storage (no validation).
    /// Data from storage is already validated.
    pub fn restore(id: String, fund_identifier: String, name: String) -> Self {
        Self {
            id,
            fund_identifier,
            name,
            temp_id: None,
        }
    }

    /// Validates fund fields.
    fn validate(fund_identifier: &str, name: &str) -> Result<(), FundError> {
        if fund_identifier.trim().is_empty() {
            return Err(FundError::FundIdentifierEmpty);
        }
        if name.trim().is_empty() {
            return Err(FundError::FundNameEmpty);
        }
        Ok(())
    }
}

/// Status of a fund payment group in the bank reconciliation lifecycle
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FundPaymentGroupStatus {
    /// Group is active — not yet bank-reconciled, can be edited or deleted
    #[default]
    Active,
    /// Group has been bank-reconciled — locked, cannot be edited or deleted
    BankPaid,
}

/// FundPaymentGroup aggregate root
/// Represents a batch of payments from a single fund (e.g., CPAM payment run)
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FundPaymentGroup {
    pub id: String,
    pub fund_id: String,
    #[serde(serialize_with = "serialize_date")]
    #[specta(type = String)]
    pub payment_date: NaiveDate,
    pub total_amount: i64,
    pub lines: Vec<FundPaymentLine>,
    pub status: FundPaymentGroupStatus,
    /// Derived from status: true when BankPaid. Group cannot be edited or deleted when locked.
    pub is_locked: bool,
}

/// Serialize NaiveDate as ISO format string for serde
fn serialize_date<S>(date: &NaiveDate, serializer: S) -> std::result::Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_str(&date.format("%Y-%m-%d").to_string())
}

impl FundPaymentGroup {
    /// Creates a new FundPaymentGroup with validation and generates ID.
    /// New groups start as Active (not yet bank-reconciled).
    pub fn new(
        fund_id: String,
        payment_date: String,
        total_amount: i64,
        lines: Vec<FundPaymentLine>,
    ) -> Result<Self, FundError> {
        Self::validate(&fund_id, &payment_date, total_amount)?;

        let parsed_date = NaiveDate::parse_from_str(&payment_date, "%Y-%m-%d")
            .map_err(|_| FundError::InvalidPaymentDateFormat)?;

        Ok(Self {
            id: Uuid::new_v4().to_string(),
            fund_id,
            payment_date: parsed_date,
            total_amount,
            lines,
            status: FundPaymentGroupStatus::Active,
            is_locked: false,
        })
    }

    /// Updates an existing FundPaymentGroup with validation.
    pub fn with_id(
        id: String,
        fund_id: String,
        payment_date: String,
        total_amount: i64,
        lines: Vec<FundPaymentLine>,
    ) -> Result<Self, FundError> {
        Self::validate(&fund_id, &payment_date, total_amount)?;

        let parsed_date = NaiveDate::parse_from_str(&payment_date, "%Y-%m-%d")
            .map_err(|_| FundError::InvalidPaymentDateFormat)?;

        Ok(Self {
            id,
            fund_id,
            payment_date: parsed_date,
            total_amount,
            lines,
            status: FundPaymentGroupStatus::Active,
            is_locked: false,
        })
    }

    /// Restores a FundPaymentGroup from database storage (no validation).
    /// Data from storage is already validated. is_locked is derived from status.
    pub fn restore(
        id: String,
        fund_id: String,
        payment_date: NaiveDate,
        total_amount: i64,
        lines: Vec<FundPaymentLine>,
        status: FundPaymentGroupStatus,
    ) -> Self {
        let is_locked = status == FundPaymentGroupStatus::BankPaid;

        Self {
            id,
            fund_id,
            payment_date,
            total_amount,
            lines,
            status,
            is_locked,
        }
    }

    /// Validates fund payment group fields.
    fn validate(fund_id: &str, _payment_date: &str, total_amount: i64) -> Result<(), FundError> {
        if fund_id.trim().is_empty() {
            return Err(FundError::FundIdEmpty);
        }
        if total_amount <= 0 {
            return Err(FundError::TotalAmountNotPositive);
        }
        Ok(())
    }
}

/// FundPaymentLine aggregate
/// Links a fund payment group to a specific procedure
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FundPaymentLine {
    pub id: String,
    pub fund_payment_group_id: String,
    pub procedure_id: String,
}

impl FundPaymentLine {
    /// Creates a new FundPaymentLine with validation and generates ID.
    pub fn new(fund_payment_group_id: String, procedure_id: String) -> Result<Self, FundError> {
        Self::validate(&fund_payment_group_id, &procedure_id)?;

        Ok(Self {
            id: Uuid::new_v4().to_string(),
            fund_payment_group_id,
            procedure_id,
        })
    }

    /// Creates a FundPaymentLine with an existing ID and validation.
    /// Does NOT generate a new ID.
    pub fn with_id(
        id: String,
        fund_payment_group_id: String,
        procedure_id: String,
    ) -> Result<Self, FundError> {
        Self::validate(&fund_payment_group_id, &procedure_id)?;

        Ok(Self {
            id,
            fund_payment_group_id,
            procedure_id,
        })
    }

    /// Restores a FundPaymentLine from database storage (no validation).
    /// Data from storage is already validated.
    pub fn restore(id: String, fund_payment_group_id: String, procedure_id: String) -> Self {
        Self {
            id,
            fund_payment_group_id,
            procedure_id,
        }
    }

    /// Validates fund payment line fields.
    fn validate(fund_payment_group_id: &str, procedure_id: &str) -> Result<(), FundError> {
        if fund_payment_group_id.trim().is_empty() {
            return Err(FundError::FundPaymentGroupIdEmpty);
        }
        if procedure_id.trim().is_empty() {
            return Err(FundError::LineProcedureIdEmpty);
        }
        Ok(())
    }
}

/// FundPaymentRepository trait for fund payment group and line operations
#[cfg_attr(test, mockall::automock)]
#[async_trait::async_trait]
pub trait FundPaymentRepository: Send + Sync {
    /// Create a fund payment group with lines (atomic operation)
    /// Repository generates IDs and timestamps
    async fn create_group(
        &self,
        fund_id: String,
        payment_date: String,
        total_amount: i64,
        procedure_ids: Vec<String>,
    ) -> anyhow::Result<FundPaymentGroup>;

    /// Batch create multiple fund payment groups with all their lines (single atomic transaction)
    /// Receives fully-constructed FundPaymentGroup objects (IDs already generated)
    /// Repository only persists them atomically
    async fn create_batch_groups(
        &self,
        groups: Vec<FundPaymentGroup>,
    ) -> anyhow::Result<Vec<FundPaymentGroup>>;

    async fn create_lines(
        &self,
        lines: Vec<FundPaymentLine>,
    ) -> anyhow::Result<Vec<FundPaymentLine>>;
    async fn read_group(&self, id: &str) -> anyhow::Result<Option<FundPaymentGroup>>;
    async fn read_lines_by_group(&self, group_id: &str) -> anyhow::Result<Vec<FundPaymentLine>>;
    async fn read_all_groups(&self) -> anyhow::Result<Vec<FundPaymentGroup>>;
    async fn update_group(&self, group: FundPaymentGroup) -> anyhow::Result<FundPaymentGroup>;
    async fn update_group_status(
        &self,
        group_id: &str,
        status: FundPaymentGroupStatus,
    ) -> anyhow::Result<()>;
    async fn delete_lines_by_group(&self, group_id: &str) -> anyhow::Result<()>;
    async fn delete_group(&self, group_id: &str) -> anyhow::Result<()>;
    /// Check if a group with matching (fund_id, payment_date, total_amount) already exists
    async fn exists_group(
        &self,
        fund_id: &str,
        payment_date: &str,
        total_amount: i64,
    ) -> anyhow::Result<bool>;

    /// Persist a fully-constructed FundPaymentGroup with its lines, preserving status/is_locked.
    /// Used for overpayment refund groups created with BankPaid status + negative amount (REF-100).
    async fn persist_group(&self, group: FundPaymentGroup) -> anyhow::Result<FundPaymentGroup>;
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- Fund ---

    #[test]
    fn fund_new_rejects_empty_identifier() {
        assert!(Fund::new("".to_string(), "Name".to_string()).is_err());
    }

    #[test]
    fn fund_new_rejects_empty_name() {
        assert!(Fund::new("ID".to_string(), "".to_string()).is_err());
    }

    #[test]
    fn fund_with_id_rejects_empty_identifier() {
        assert!(Fund::with_id("my-id".to_string(), "".to_string(), "CPAM 75".to_string()).is_err());
    }

    #[test]
    fn fund_with_id_rejects_empty_name() {
        assert!(Fund::with_id("my-id".to_string(), "75".to_string(), "".to_string()).is_err());
    }

    // --- FundPaymentGroup ---

    #[test]
    fn fund_payment_group_new_success() {
        let g = FundPaymentGroup::new(
            "fund-1".to_string(),
            "2026-01-15".to_string(),
            10000,
            vec![],
        )
        .unwrap();
        assert!(!g.id.is_empty());
        assert_eq!(g.status, FundPaymentGroupStatus::Active);
        assert!(!g.is_locked);
    }

    #[test]
    fn fund_payment_group_new_rejects_empty_fund_id() {
        assert!(
            FundPaymentGroup::new("".to_string(), "2026-01-15".to_string(), 10000, vec![]).is_err()
        );
    }

    #[test]
    fn fund_payment_group_new_rejects_zero_amount() {
        assert!(
            FundPaymentGroup::new("fund-1".to_string(), "2026-01-15".to_string(), 0, vec![])
                .is_err()
        );
    }

    #[test]
    fn fund_payment_group_new_rejects_negative_amount() {
        assert!(FundPaymentGroup::new(
            "fund-1".to_string(),
            "2026-01-15".to_string(),
            -100,
            vec![]
        )
        .is_err());
    }

    #[test]
    fn fund_payment_group_restore_bank_paid_is_locked() {
        let g = FundPaymentGroup::restore(
            "id".to_string(),
            "fund-1".to_string(),
            NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
            10000,
            vec![],
            FundPaymentGroupStatus::BankPaid,
        );
        assert!(g.is_locked);
        assert_eq!(g.status, FundPaymentGroupStatus::BankPaid);
    }

    #[test]
    fn fund_payment_group_restore_active_not_locked() {
        let g = FundPaymentGroup::restore(
            "id".to_string(),
            "fund-1".to_string(),
            NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
            10000,
            vec![],
            FundPaymentGroupStatus::Active,
        );
        assert!(!g.is_locked);
    }

    // --- FundPaymentLine ---

    #[test]
    fn fund_payment_line_new_success() {
        let l = FundPaymentLine::new("group-1".to_string(), "proc-1".to_string()).unwrap();
        assert!(!l.id.is_empty());
        assert_eq!(l.fund_payment_group_id, "group-1");
        assert_eq!(l.procedure_id, "proc-1");
    }

    #[test]
    fn fund_payment_line_new_rejects_empty_group_id() {
        assert!(FundPaymentLine::new("".to_string(), "proc-1".to_string()).is_err());
    }

    #[test]
    fn fund_payment_line_new_rejects_empty_procedure_id() {
        assert!(FundPaymentLine::new("group-1".to_string(), "".to_string()).is_err());
    }

    #[test]
    fn fund_payment_line_with_id_rejects_empty_group_id() {
        assert!(
            FundPaymentLine::with_id("my-id".to_string(), "".to_string(), "p1".to_string())
                .is_err()
        );
    }

    #[test]
    fn fund_payment_line_with_id_rejects_empty_procedure_id() {
        assert!(
            FundPaymentLine::with_id("my-id".to_string(), "g1".to_string(), "".to_string())
                .is_err()
        );
    }
}

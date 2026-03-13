use anyhow::Result;
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use specta::Type;
use uuid::Uuid;

/// AffiliatedFund aggregate root
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AffiliatedFund {
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

impl AffiliatedFund {
    /// Creates a new AffiliatedFund with validation and generates ID.
    pub fn new(fund_identifier: String, name: String) -> Result<Self> {
        Self::validate(&fund_identifier, &name)?;

        Ok(Self {
            id: Uuid::new_v4().to_string(),
            fund_identifier,
            name,
            temp_id: None,
        })
    }

    /// Creates a new AffiliatedFund from batch import with temporary ID.
    pub fn new_with_temp_id(
        fund_identifier: String,
        name: String,
        temp_id: String,
    ) -> Result<Self> {
        Self::validate(&fund_identifier, &name)?;

        Ok(Self {
            id: Uuid::new_v4().to_string(),
            fund_identifier,
            name,
            temp_id: Some(temp_id),
        })
    }

    /// Creates an AffiliatedFund with an existing ID and validation.
    /// Does NOT generate a new ID.
    pub fn with_id(id: String, fund_identifier: String, name: String) -> Result<Self> {
        Self::validate(&fund_identifier, &name)?;

        Ok(Self {
            id,
            fund_identifier,
            name,
            temp_id: None,
        })
    }

    /// Restores an AffiliatedFund from database storage (no validation).
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
    fn validate(fund_identifier: &str, name: &str) -> Result<()> {
        if fund_identifier.trim().is_empty() {
            anyhow::bail!("Fund identifier cannot be empty");
        }
        if name.trim().is_empty() {
            anyhow::bail!("Fund name cannot be empty");
        }
        Ok(())
    }
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
    pub fn new(
        fund_id: String,
        payment_date: String,
        total_amount: i64,
        lines: Vec<FundPaymentLine>,
    ) -> Result<Self> {
        Self::validate(&fund_id, &payment_date, total_amount)?;

        let parsed_date = NaiveDate::parse_from_str(&payment_date, "%Y-%m-%d").map_err(|_| {
            anyhow::anyhow!(
                "Invalid payment date format: {} (expected YYYY-MM-DD)",
                payment_date
            )
        })?;

        Ok(Self {
            id: Uuid::new_v4().to_string(),
            fund_id,
            payment_date: parsed_date,
            total_amount,
            lines,
        })
    }

    /// Updates an existing FundPaymentGroup with validation.
    pub fn with_id(
        id: String,
        fund_id: String,
        payment_date: String,
        total_amount: i64,
        lines: Vec<FundPaymentLine>,
    ) -> Result<Self> {
        Self::validate(&fund_id, &payment_date, total_amount)?;

        let parsed_date = NaiveDate::parse_from_str(&payment_date, "%Y-%m-%d").map_err(|_| {
            anyhow::anyhow!(
                "Invalid payment date format: {} (expected YYYY-MM-DD)",
                payment_date
            )
        })?;

        Ok(Self {
            id,
            fund_id,
            payment_date: parsed_date,
            total_amount,
            lines,
        })
    }

    /// Restores a FundPaymentGroup from database storage (no validation).
    /// Data from storage is already validated.
    pub fn restore(
        id: String,
        fund_id: String,
        payment_date: String,
        total_amount: i64,
        lines: Vec<FundPaymentLine>,
    ) -> Self {
        let parsed_date =
            NaiveDate::parse_from_str(&payment_date, "%Y-%m-%d").unwrap_or(NaiveDate::MIN);

        Self {
            id,
            fund_id,
            payment_date: parsed_date,
            total_amount,
            lines,
        }
    }

    /// Validates fund payment group fields.
    fn validate(fund_id: &str, _payment_date: &str, total_amount: i64) -> Result<()> {
        if fund_id.trim().is_empty() {
            anyhow::bail!("Fund ID cannot be empty");
        }
        if total_amount <= 0 {
            anyhow::bail!("Total amount must be greater than 0");
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
    pub fn new(fund_payment_group_id: String, procedure_id: String) -> Result<Self> {
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
    ) -> Result<Self> {
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
    fn validate(fund_payment_group_id: &str, procedure_id: &str) -> Result<()> {
        if fund_payment_group_id.trim().is_empty() {
            anyhow::bail!("Fund payment group ID cannot be empty");
        }
        if procedure_id.trim().is_empty() {
            anyhow::bail!("Procedure ID cannot be empty");
        }
        Ok(())
    }
}

/// FundPaymentRepository trait for fund payment group and line operations
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
    async fn delete_lines_by_group(&self, group_id: &str) -> anyhow::Result<()>;
    async fn delete_group(&self, group_id: &str) -> anyhow::Result<()>;
    /// Check if a group with matching (fund_id, payment_date, total_amount) already exists
    async fn exists_group(
        &self,
        fund_id: &str,
        payment_date: &str,
        total_amount: i64,
    ) -> anyhow::Result<bool>;
}

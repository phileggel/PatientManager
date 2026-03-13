use anyhow::Result;
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use specta::Type;
use uuid::Uuid;

/// Payment method for a healthcare procedure
///
/// Represents how a procedure payment was made, inferred from Excel import data:
/// - None: No payment information or no confirmed payment date (default)
/// - Cash: Electronic payment (ES code in Excel)
/// - Check: Check payment (CH code in Excel)
/// - BankCard: Credit/debit card payment (not currently in Excel imports, handled later)
/// - BankTransfer: Bank transfer (inferred when confirmed_payment_date exists but no explicit method)
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PaymentMethod {
    #[default]
    None,
    Cash,
    Check,
    BankCard,
    BankTransfer,
}

/// Procedure status lifecycle
///
/// Represents the reconciliation state of a healthcare procedure:
/// - None: Initial state, no reconciliation activity
/// - Created: Procedure has been created and is awaiting payment/reconciliation
/// - Reconciliated: A fund payment group has been associated with this procedure
/// - DirectlyPayed: Procedure was paid directly (cash/card) without fund reconciliation (blocking re-import)
/// - FundPayed: A bank payment has been matched/reconciled with this procedure via fund (blocking re-import)
/// - ImportDirectlyPayed: From Excel import — paid directly (ES/CH), non-blocking re-import
/// - ImportFundPayed: From Excel import — fund present, method not ES/CH (non-blocking re-import)
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ProcedureStatus {
    #[default]
    None,
    Created,
    Reconciliated,
    /// Fund reconciliation done but amount disputed: actual_payment_amount ≠ procedure_amount
    PartiallyReconciled,
    DirectlyPayed,
    FundPayed,
    /// Bank transfer confirmed for a partially reconciled procedure
    PartiallyFundPayed,
    ImportDirectlyPayed,
    ImportFundPayed,
}

/// Healthcare Procedure aggregate root
///
/// Represents a healthcare procedure (service/procedure) record with foreign key references
/// to Patient, Fund, and Procedure Type. Uses soft-delete pattern.
///
/// Payment tracking:
/// - procedure_amount: Total amount charged/invoiced for the procedure (millièmes)
/// - actual_payment_amount: Amount actually paid/received from patient or fund (millièmes)
/// - confirmed_payment_date: When the payment was confirmed (from reconciliation)
/// - payment_method: How payment was made (Cash/Check/BankCard/BankTransfer/None)
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Procedure {
    /// Foreign key to Patient (required)
    pub patient_id: String,
    /// Foreign key to AffiliatedFund (optional - procedure can exist without a fund)
    pub fund_id: Option<String>,
    /// Foreign key to ProcedureType (required)
    pub procedure_type_id: String,
    /// Procedure date (required, ISO format: YYYY-MM-DD)
    #[specta(type = String)]
    pub procedure_date: NaiveDate,
    /// Total amount charged/invoiced for this procedure, in millièmes (e.g. 1234 = 1.234 €)
    /// Optional - uses procedure type default amount if not specified
    /// Source: Excel import column F or manual entry
    pub procedure_amount: Option<i64>,

    /// Payment method used for this procedure
    /// Determines how payment was made: Cash/Check/BankCard/BankTransfer/None
    /// - Cash: Electronic payment (ES in Excel)
    /// - Check: Check payment (CH in Excel)
    /// - BankCard: Credit/debit card (available for future use)
    /// - BankTransfer: Inferred from confirmed_payment_date during reconciliation
    /// - None: No payment information or no confirmed payment date
    pub payment_method: PaymentMethod,

    /// Procedure status in the reconciliation lifecycle
    /// Tracks progress through: None → Created → Reconciliated → FundPayed (or DirectlyPayed)
    /// - None: Initial state
    /// - Created: Procedure created, awaiting reconciliation
    /// - Reconciliated: Associated with a fund payment group
    /// - DirectlyPayed: Paid directly (cash/card), no fund reconciliation
    /// - FundPayed: Bank payment matched via fund reconciliation
    pub payment_status: ProcedureStatus,

    /// Date when payment was confirmed (ISO format: YYYY-MM-DD)
    /// Source: Excel import column J or PDF reconciliation data
    /// Presence of this date triggers BankTransfer inference if payment_method not explicit
    #[specta(type = String)]
    pub confirmed_payment_date: Option<NaiveDate>,

    /// Actual amount paid/received from patient or fund, in millièmes (e.g. 1234 = 1.234 €)
    /// May differ from procedure_amount (partial payment, overpayment, etc.)
    /// Source: Excel import column K or reconciliation statement
    pub actual_payment_amount: Option<i64>,

    /// Metadata - not a domain property
    pub id: String,
}

impl Procedure {
    /// Creates a new Procedure with validation and generates ID.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        patient_id: String,
        fund_id: Option<String>,
        procedure_type_id: String,
        procedure_date: String,
        procedure_amount: Option<i64>,
        payment_method: PaymentMethod,
        confirmed_payment_date: Option<String>,
        actual_payment_amount: Option<i64>,
        payment_status: ProcedureStatus,
    ) -> Result<Self> {
        Self::validate(&patient_id, &procedure_type_id, &procedure_date)?;

        let parsed_procedure_date = NaiveDate::parse_from_str(&procedure_date, "%Y-%m-%d")
            .map_err(|_| {
                anyhow::anyhow!(
                    "Invalid procedure date format: {} (expected YYYY-MM-DD)",
                    procedure_date
                )
            })?;

        let parsed_confirmed_payment_date = if let Some(date_str) = confirmed_payment_date {
            Some(
                NaiveDate::parse_from_str(&date_str, "%Y-%m-%d").map_err(|_| {
                    anyhow::anyhow!(
                        "Invalid confirmed payment date format: {} (expected YYYY-MM-DD)",
                        date_str
                    )
                })?,
            )
        } else {
            None
        };

        Ok(Self {
            id: Uuid::new_v4().to_string(),
            patient_id,
            fund_id,
            procedure_type_id,
            procedure_date: parsed_procedure_date,
            procedure_amount,
            payment_method,
            confirmed_payment_date: parsed_confirmed_payment_date,
            actual_payment_amount,
            payment_status,
        })
    }

    /// Creates a Procedure with an existing ID and validation.
    /// Used when updating a procedure from external input (API, imports, etc.).
    /// Does NOT generate a new ID.
    #[allow(clippy::too_many_arguments)]
    pub fn with_id(
        id: String,
        patient_id: String,
        fund_id: Option<String>,
        procedure_type_id: String,
        procedure_date: String,
        procedure_amount: Option<i64>,
        payment_method: PaymentMethod,
        confirmed_payment_date: Option<String>,
        actual_payment_amount: Option<i64>,
        payment_status: ProcedureStatus,
    ) -> Result<Self> {
        Self::validate(&patient_id, &procedure_type_id, &procedure_date)?;

        let parsed_procedure_date = NaiveDate::parse_from_str(&procedure_date, "%Y-%m-%d")
            .map_err(|_| {
                anyhow::anyhow!(
                    "Invalid procedure date format: {} (expected YYYY-MM-DD)",
                    procedure_date
                )
            })?;

        let parsed_confirmed_payment_date = if let Some(date_str) = confirmed_payment_date {
            Some(
                NaiveDate::parse_from_str(&date_str, "%Y-%m-%d").map_err(|_| {
                    anyhow::anyhow!(
                        "Invalid confirmed payment date format: {} (expected YYYY-MM-DD)",
                        date_str
                    )
                })?,
            )
        } else {
            None
        };

        Ok(Self {
            id,
            patient_id,
            fund_id,
            procedure_type_id,
            procedure_date: parsed_procedure_date,
            procedure_amount,
            payment_method,
            confirmed_payment_date: parsed_confirmed_payment_date,
            actual_payment_amount,
            payment_status,
        })
    }

    /// Restores a Procedure from database storage (no validation).
    /// Data from storage is already validated.
    #[allow(clippy::too_many_arguments)]
    pub fn restore(
        id: String,
        patient_id: String,
        fund_id: Option<String>,
        procedure_type_id: String,
        procedure_date: NaiveDate,
        procedure_amount: Option<i64>,
        payment_method: PaymentMethod,
        confirmed_payment_date: Option<NaiveDate>,
        actual_payment_amount: Option<i64>,
        payment_status: ProcedureStatus,
    ) -> Self {
        Self {
            id,
            patient_id,
            fund_id,
            procedure_type_id,
            procedure_date,
            procedure_amount,
            payment_method,
            confirmed_payment_date,
            actual_payment_amount,
            payment_status,
        }
    }

    /// Sets all payment-related fields together (payment_method, confirmed_payment_date, actual_payment_amount)
    ///
    /// Used when adding or updating payment information from reconciliation data.
    /// Ensures all 3 fields are updated consistently as a single logical operation.
    pub fn with_payment_info(
        mut self,
        payment_method: PaymentMethod,
        confirmed_payment_date: Option<NaiveDate>,
        actual_payment_amount: Option<i64>,
    ) -> Self {
        self.payment_method = payment_method;
        self.confirmed_payment_date = confirmed_payment_date;
        self.actual_payment_amount = actual_payment_amount;
        self
    }

    /// Clears all payment-related fields (sets to default/None)
    ///
    /// Used when removing payment information (e.g., when a procedure is removed from a payment group).
    /// Sets payment_method to None and clears dates/amounts.
    pub fn clear_payment_info(mut self) -> Self {
        self.payment_method = PaymentMethod::None;
        self.confirmed_payment_date = None;
        self.actual_payment_amount = None;
        self
    }

    /// Updates only the confirmed payment date
    ///
    /// Used when updating an existing payment date without changing payment method or amount.
    /// Leaves other payment fields unchanged.
    pub fn with_confirmed_payment_date(
        mut self,
        confirmed_payment_date: Option<NaiveDate>,
    ) -> Self {
        self.confirmed_payment_date = confirmed_payment_date;
        self
    }

    /// Validates healthcare procedure fields.
    fn validate(patient_id: &str, procedure_type_id: &str, procedure_date: &str) -> Result<()> {
        if patient_id.trim().is_empty() {
            anyhow::bail!("Patient ID cannot be empty");
        }
        if procedure_type_id.trim().is_empty() {
            anyhow::bail!("Procedure type ID cannot be empty");
        }
        if procedure_date.trim().is_empty() {
            anyhow::bail!("Procedure date cannot be empty");
        }
        Ok(())
    }
}

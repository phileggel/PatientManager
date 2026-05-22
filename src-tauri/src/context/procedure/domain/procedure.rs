use std::str::FromStr;

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

impl PaymentMethod {
    /// SQLite-stored representation. `None` is encoded as SQL NULL
    /// (caller decides via `Option`).
    pub fn as_db_str(self) -> Option<&'static str> {
        match self {
            PaymentMethod::None => None,
            PaymentMethod::Cash => Some("CASH"),
            PaymentMethod::Check => Some("CHECK"),
            PaymentMethod::BankCard => Some("BANK_CARD"),
            PaymentMethod::BankTransfer => Some("BANK_TRANSFER"),
        }
    }
}

impl FromStr for PaymentMethod {
    type Err = String;
    fn from_str(s: &str) -> std::result::Result<Self, Self::Err> {
        match s {
            "CASH" => Ok(PaymentMethod::Cash),
            "CHECK" => Ok(PaymentMethod::Check),
            "BANK_CARD" => Ok(PaymentMethod::BankCard),
            "BANK_TRANSFER" => Ok(PaymentMethod::BankTransfer),
            _ => Err(s.to_string()),
        }
    }
}

/// Procedure status lifecycle
///
/// Represents the reconciliation state of a healthcare procedure:
/// - None: Initial state, no reconciliation activity
/// - Created: Procedure has been created and is awaiting payment/reconciliation
/// - Reconciled: A fund payment group has been associated with this procedure
/// - DirectlyPaid: Procedure was paid directly (cash/card) without fund reconciliation (blocking re-import)
/// - FundPaid: A bank payment has been matched/reconciled with this procedure via fund (blocking re-import)
/// - ImportDirectlyPaid: From Excel import — paid directly (ES/CH), non-blocking re-import
/// - ImportFundPaid: From Excel import — fund present, method not ES/CH (non-blocking re-import)
/// - Overpaid: Source procedure whose full overpayment has been recorded (REF-160). Blocks deletion (REF-220).
/// - OverpaymentRefund: Mirror negative procedure created to offset an overpayment (REF-090). Blocks deletion (REF-230).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ProcedureStatus {
    #[default]
    None,
    Created,
    Reconciled,
    /// Fund reconciliation done but amount disputed: paid_amount ≠ billed_amount
    PartiallyReconciled,
    DirectlyPaid,
    FundPaid,
    /// Bank transfer confirmed for a partially reconciled procedure
    PartiallyFundPaid,
    ImportDirectlyPaid,
    ImportFundPaid,
    /// Source procedure whose full overpayment has been recorded (REF-160)
    Overpaid,
    /// Mirror negative procedure created to offset an overpayment (REF-090)
    OverpaymentRefund,
}

impl ProcedureStatus {
    /// True for statuses that block deletion and restrict editing
    /// (R5, R26, REF-220, REF-230).
    ///
    /// NOTE: must stay in sync with `isBlockingStatus` in the frontend
    /// (`src/features/procedure/model/procedure-row.types.ts`).
    pub fn is_blocking(self) -> bool {
        matches!(
            self,
            ProcedureStatus::Reconciled
                | ProcedureStatus::PartiallyReconciled
                | ProcedureStatus::FundPaid
                | ProcedureStatus::PartiallyFundPaid
                | ProcedureStatus::DirectlyPaid
                | ProcedureStatus::Overpaid
                | ProcedureStatus::OverpaymentRefund
        )
    }

    /// SQLite-stored representation (legacy column values, e.g.
    /// `Reconciled` → `"RECONCILIATED"`).
    pub fn as_db_str(self) -> &'static str {
        match self {
            ProcedureStatus::None => "NONE",
            ProcedureStatus::Created => "CREATED",
            ProcedureStatus::Reconciled => "RECONCILIATED",
            ProcedureStatus::PartiallyReconciled => "PARTIALLY_RECONCILED",
            ProcedureStatus::DirectlyPaid => "DIRECTLY_PAYED",
            ProcedureStatus::FundPaid => "FUND_PAYED",
            ProcedureStatus::PartiallyFundPaid => "PARTIALLY_FUND_PAYED",
            ProcedureStatus::ImportDirectlyPaid => "IMPORT_DIRECTLY_PAYED",
            ProcedureStatus::ImportFundPaid => "IMPORT_FUND_PAYED",
            ProcedureStatus::Overpaid => "OVERPAID",
            ProcedureStatus::OverpaymentRefund => "OVERPAYMENT_REFUND",
        }
    }
}

impl FromStr for ProcedureStatus {
    type Err = String;
    fn from_str(s: &str) -> std::result::Result<Self, Self::Err> {
        match s {
            "NONE" => Ok(ProcedureStatus::None),
            "CREATED" => Ok(ProcedureStatus::Created),
            "RECONCILIATED" => Ok(ProcedureStatus::Reconciled),
            "PARTIALLY_RECONCILED" => Ok(ProcedureStatus::PartiallyReconciled),
            "DIRECTLY_PAYED" => Ok(ProcedureStatus::DirectlyPaid),
            "FUND_PAYED" => Ok(ProcedureStatus::FundPaid),
            "PARTIALLY_FUND_PAYED" => Ok(ProcedureStatus::PartiallyFundPaid),
            "IMPORT_DIRECTLY_PAYED" => Ok(ProcedureStatus::ImportDirectlyPaid),
            "IMPORT_FUND_PAYED" => Ok(ProcedureStatus::ImportFundPaid),
            "OVERPAID" => Ok(ProcedureStatus::Overpaid),
            "OVERPAYMENT_REFUND" => Ok(ProcedureStatus::OverpaymentRefund),
            _ => Err(s.to_string()),
        }
    }
}

/// Healthcare Procedure aggregate root
///
/// Represents a healthcare procedure (service/procedure) record with foreign key references
/// to Patient, Fund, and Procedure Type. Uses soft-delete pattern.
///
/// Payment tracking:
/// - billed_amount: Total amount charged/invoiced for the procedure (thousandths of a euro)
/// - paid_amount: Amount actually paid/received from patient or fund (thousandths of a euro)
/// - confirmed_payment_date: When the payment was confirmed (from reconciliation)
/// - payment_method: How payment was made (Cash/Check/BankCard/BankTransfer/None)
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Procedure {
    /// Foreign key to Patient (required)
    pub patient_id: String,
    /// Foreign key to Fund (optional - procedure can exist without a fund)
    pub fund_id: Option<String>,
    /// Foreign key to ProcedureType (required)
    pub procedure_type_id: String,
    /// Procedure date (required, ISO format: YYYY-MM-DD)
    #[specta(type = String)]
    pub procedure_date: NaiveDate,
    /// Total amount charged/invoiced for this procedure, in thousandths of a euro (e.g. 1234 = 1.234 €)
    /// Optional - uses procedure type default amount if not specified
    /// Source: Excel import column F or manual entry
    pub billed_amount: Option<i64>,

    /// Payment method used for this procedure
    /// Determines how payment was made: Cash/Check/BankCard/BankTransfer/None
    /// - Cash: Electronic payment (ES in Excel)
    /// - Check: Check payment (CH in Excel)
    /// - BankCard: Credit/debit card (available for future use)
    /// - BankTransfer: Inferred from confirmed_payment_date during reconciliation
    /// - None: No payment information or no confirmed payment date
    pub payment_method: PaymentMethod,

    /// Procedure status in the reconciliation lifecycle
    /// Tracks progress through: None → Created → Reconciled → FundPaid (or DirectlyPaid)
    /// - None: Initial state
    /// - Created: Procedure created, awaiting reconciliation
    /// - Reconciled: Associated with a fund payment group
    /// - DirectlyPaid: Paid directly (cash/card), no fund reconciliation
    /// - FundPaid: Bank payment matched via fund reconciliation
    pub payment_status: ProcedureStatus,

    /// Stage 1 — fund-declared payment date from the fund document
    /// (ISO format: YYYY-MM-DD). Set by fund-payment-* reconciliation
    /// flows when the procedure enters a `FundPaymentGroup` (PRO-250,
    /// FPM-320, FPA-300); cleared on removal (FPM-310, FPM-400).
    /// Distinct from `confirmed_payment_date` which is Stage 2 only.
    #[specta(type = String)]
    pub fund_reconciliation_date: Option<NaiveDate>,

    /// Stage 2 — bank-side confirmed payment date (ISO format:
    /// YYYY-MM-DD). Set by bank-statement-* reconciliation flows when
    /// the procedure's group is matched to a bank transfer, or
    /// directly at Excel import (column J) for procedures arriving
    /// with payment data already present.
    /// Presence of this date triggers BankTransfer inference if
    /// payment_method not explicit.
    #[specta(type = String)]
    pub confirmed_payment_date: Option<NaiveDate>,

    /// Actual amount paid/received from patient or fund, in thousandths of a euro (e.g. 1234 = 1.234 €)
    /// May differ from billed_amount (partial payment, overpayment, etc.)
    /// Source: Excel import column K or reconciliation statement
    pub paid_amount: Option<i64>,

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
        billed_amount: Option<i64>,
        payment_method: PaymentMethod,
        fund_reconciliation_date: Option<String>,
        confirmed_payment_date: Option<String>,
        paid_amount: Option<i64>,
        payment_status: ProcedureStatus,
    ) -> Result<Self> {
        Self::validate(&patient_id, &procedure_type_id, &procedure_date)?;

        let parsed_procedure_date = Self::parse_date(&procedure_date, "procedure date")?;
        let parsed_fund_reconciliation_date =
            Self::parse_optional_date(fund_reconciliation_date, "fund reconciliation date")?;
        let parsed_confirmed_payment_date =
            Self::parse_optional_date(confirmed_payment_date, "confirmed payment date")?;

        Ok(Self {
            id: Uuid::new_v4().to_string(),
            patient_id,
            fund_id,
            procedure_type_id,
            procedure_date: parsed_procedure_date,
            billed_amount,
            payment_method,
            fund_reconciliation_date: parsed_fund_reconciliation_date,
            confirmed_payment_date: parsed_confirmed_payment_date,
            paid_amount,
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
        billed_amount: Option<i64>,
        payment_method: PaymentMethod,
        fund_reconciliation_date: Option<String>,
        confirmed_payment_date: Option<String>,
        paid_amount: Option<i64>,
        payment_status: ProcedureStatus,
    ) -> Result<Self> {
        Self::validate(&patient_id, &procedure_type_id, &procedure_date)?;

        let parsed_procedure_date = Self::parse_date(&procedure_date, "procedure date")?;
        let parsed_fund_reconciliation_date =
            Self::parse_optional_date(fund_reconciliation_date, "fund reconciliation date")?;
        let parsed_confirmed_payment_date =
            Self::parse_optional_date(confirmed_payment_date, "confirmed payment date")?;

        Ok(Self {
            id,
            patient_id,
            fund_id,
            procedure_type_id,
            procedure_date: parsed_procedure_date,
            billed_amount,
            payment_method,
            fund_reconciliation_date: parsed_fund_reconciliation_date,
            confirmed_payment_date: parsed_confirmed_payment_date,
            paid_amount,
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
        billed_amount: Option<i64>,
        payment_method: PaymentMethod,
        fund_reconciliation_date: Option<NaiveDate>,
        confirmed_payment_date: Option<NaiveDate>,
        paid_amount: Option<i64>,
        payment_status: ProcedureStatus,
    ) -> Self {
        Self {
            id,
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
        }
    }

    /// Sets all payment-related fields together (payment_method, confirmed_payment_date, paid_amount)
    ///
    /// Used when adding or updating payment information from reconciliation data.
    /// Ensures all 3 fields are updated consistently as a single logical operation.
    pub fn with_payment_info(
        mut self,
        payment_method: PaymentMethod,
        confirmed_payment_date: Option<NaiveDate>,
        paid_amount: Option<i64>,
    ) -> Self {
        self.payment_method = payment_method;
        self.confirmed_payment_date = confirmed_payment_date;
        self.paid_amount = paid_amount;
        self
    }

    /// Clears all payment-related fields (sets to default/None).
    ///
    /// Used when removing payment information (e.g., when a procedure
    /// is removed from a payment group, FPM-310). Sets payment_method
    /// to None and clears both stage dates and amounts.
    pub fn clear_payment_info(mut self) -> Self {
        self.payment_method = PaymentMethod::None;
        self.fund_reconciliation_date = None;
        self.confirmed_payment_date = None;
        self.paid_amount = None;
        self
    }

    /// Reverts the Stage 2 (bank-side) payment when a FUND bank
    /// transfer is deleted. Clears `payment_method` and
    /// `confirmed_payment_date`; preserves `fund_reconciliation_date`
    /// (Stage 1 unchanged by Stage 2 rollback) and `paid_amount`
    /// (per R8 spec).
    pub fn revert_fund_payment(mut self) -> Self {
        self.payment_method = PaymentMethod::None;
        self.confirmed_payment_date = None;
        self
    }

    /// State transition: set or clear the Stage 1 fund-reconciliation date on
    /// an already-loaded aggregate. Used by fund-payment-* reconciliation flows
    /// when a procedure enters (FPM-320, FPA-300) or leaves (FPM-310, FPM-400)
    /// a `FundPaymentGroup`. Not a constructor patch — `Procedure::new` /
    /// `with_id` accept `fund_reconciliation_date` as a parameter; never chain
    /// this onto a freshly-built aggregate to thread an initial value.
    pub fn with_fund_reconciliation_date(
        mut self,
        fund_reconciliation_date: Option<NaiveDate>,
    ) -> Self {
        self.fund_reconciliation_date = fund_reconciliation_date;
        self
    }

    /// Updates only the Stage 2 confirmed payment date.
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

    fn parse_date(date_str: &str, label: &str) -> Result<NaiveDate> {
        NaiveDate::parse_from_str(date_str, "%Y-%m-%d").map_err(|_| {
            anyhow::anyhow!(
                "Invalid {} format: {} (expected YYYY-MM-DD)",
                label,
                date_str
            )
        })
    }

    fn parse_optional_date(date_str: Option<String>, label: &str) -> Result<Option<NaiveDate>> {
        match date_str {
            Some(s) => Self::parse_date(&s, label).map(Some),
            None => Ok(None),
        }
    }
}

/// Domain projection: a procedure pending reconciliation, enriched with patient identity data.
pub struct UnreconciledProcedure {
    pub procedure_id: String,
    pub patient_id: String,
    pub patient_name: Option<String>,
    pub patient_ssn: Option<String>,
    pub procedure_date: String,
    pub amount: Option<i64>,
}

#[cfg_attr(test, mockall::automock)]
#[async_trait::async_trait]
pub trait ProcedureRepository: Send + Sync {
    #[allow(clippy::too_many_arguments)]
    async fn create_procedure(
        &self,
        patient_id: String,
        fund_id: Option<String>,
        procedure_type_id: String,
        procedure_date: String,
        billed_amount: Option<i64>,
        payment_method: PaymentMethod,
        fund_reconciliation_date: Option<String>,
        confirmed_payment_date: Option<String>,
        paid_amount: Option<i64>,
        payment_status: ProcedureStatus,
    ) -> anyhow::Result<Procedure>;

    async fn read_all_procedures(&self) -> anyhow::Result<Vec<Procedure>>;
    async fn read_procedure(&self, id: &str) -> anyhow::Result<Option<Procedure>>;
    async fn read_procedures_by_ids(&self, ids: &[String]) -> anyhow::Result<Vec<Procedure>>;
    async fn read_procedures_by_patient_id(
        &self,
        patient_id: &str,
    ) -> anyhow::Result<Vec<Procedure>>;
    async fn update_procedure(&self, procedure: Procedure) -> anyhow::Result<Procedure>;
    async fn delete_procedure(&self, id: &str) -> anyhow::Result<()>;

    async fn find_procedures_by_ssn_and_date_range(
        &self,
        ssn: &str,
        start_date: &str,
        end_date: &str,
    ) -> anyhow::Result<Vec<Procedure>>;

    async fn find_procedures_by_ssns_and_date_range_with_ssn(
        &self,
        ssns: &[String],
        start_date: &str,
        end_date: &str,
    ) -> anyhow::Result<Vec<(String, Procedure)>>;

    /// Find exact procedure match for import deduplication.
    /// Matches by patient_id, fund_id (nullable), procedure_date, and exact amount.
    #[cfg_attr(test, mockall::concretize)]
    async fn find_procedure_exact(
        &self,
        patient_id: &str,
        fund_id: Option<&str>,
        procedure_date: &str,
        billed_amount: i64,
    ) -> anyhow::Result<Option<Procedure>>;

    async fn create_batch(&self, procedures: Vec<Procedure>) -> anyhow::Result<Vec<Procedure>>;
    async fn update_batch(&self, procedures: Vec<Procedure>) -> anyhow::Result<Vec<Procedure>>;
    async fn find_unpaid_by_fund(&self, fund_id: &str) -> anyhow::Result<Vec<Procedure>>;

    async fn find_unreconciled_by_date_range(
        &self,
        start_date: &str,
        end_date: &str,
    ) -> anyhow::Result<Vec<UnreconciledProcedure>>;

    /// Returns true if any non-deleted procedure in the given month (YYYY-MM) has a
    /// blocking status (Reconciled or FundPaid), preventing re-import.
    async fn has_blocking_procedures_in_month(&self, month: &str) -> anyhow::Result<bool>;

    /// Hard-deletes all procedures (including soft-deleted) for the given month (YYYY-MM).
    /// Returns the number of deleted rows.
    async fn delete_procedures_by_month(&self, month: &str) -> anyhow::Result<u64>;

    /// Find procedures eligible for a direct bank payment (CHECK/CREDIT_CARD/CASH).
    /// Returns procedures with status CREATED and procedure_date in [date_min, date_max].
    /// Used for the 7-day window selection (R14) and expanded search (R20).
    async fn find_created_in_date_range(
        &self,
        date_min: &str,
        date_max: &str,
    ) -> anyhow::Result<Vec<Procedure>>;

    /// Find Created procedures for a given fund with procedure_date <= date (R19).
    /// Used by the edit modal to populate the "add procedures" selector.
    async fn find_created_by_fund_before_date(
        &self,
        fund_id: &str,
        date: &str,
    ) -> anyhow::Result<Vec<Procedure>>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_blocking_matches_the_seven_blocking_lifecycle_statuses() {
        let blocking = [
            ProcedureStatus::Reconciled,
            ProcedureStatus::PartiallyReconciled,
            ProcedureStatus::FundPaid,
            ProcedureStatus::PartiallyFundPaid,
            ProcedureStatus::DirectlyPaid,
            ProcedureStatus::Overpaid,
            ProcedureStatus::OverpaymentRefund,
        ];
        for status in blocking {
            assert!(
                status.is_blocking(),
                "{status:?} must be classified as blocking"
            );
        }
    }

    #[test]
    fn is_blocking_excludes_initial_created_and_import_statuses() {
        let non_blocking = [
            ProcedureStatus::None,
            ProcedureStatus::Created,
            ProcedureStatus::ImportDirectlyPaid,
            ProcedureStatus::ImportFundPaid,
        ];
        for status in non_blocking {
            assert!(
                !status.is_blocking(),
                "{status:?} must NOT be classified as blocking"
            );
        }
    }

    #[test]
    fn procedure_status_db_codec_round_trips_every_variant() {
        // Listing every variant explicitly so a future `ProcedureStatus`
        // addition fails to compile here until the codec is extended.
        let variants = [
            ProcedureStatus::None,
            ProcedureStatus::Created,
            ProcedureStatus::Reconciled,
            ProcedureStatus::PartiallyReconciled,
            ProcedureStatus::DirectlyPaid,
            ProcedureStatus::FundPaid,
            ProcedureStatus::PartiallyFundPaid,
            ProcedureStatus::ImportDirectlyPaid,
            ProcedureStatus::ImportFundPaid,
            ProcedureStatus::Overpaid,
            ProcedureStatus::OverpaymentRefund,
        ];
        for v in variants {
            let s = v.as_db_str();
            let parsed: ProcedureStatus = s
                .parse()
                .unwrap_or_else(|e| panic!("round-trip failed for {v:?}: {e}"));
            assert_eq!(v, parsed, "{v:?} did not round-trip via {s:?}");
        }
    }

    #[test]
    fn procedure_status_from_str_unknown_returns_err_with_input() {
        let err = "WAT".parse::<ProcedureStatus>().unwrap_err();
        assert_eq!(err, "WAT");
    }

    #[test]
    fn payment_method_db_codec_round_trips_non_none_variants() {
        // None ↔ SQL NULL, not a string — covered by the as_db_str = None
        // assertion below.
        for v in [
            PaymentMethod::Cash,
            PaymentMethod::Check,
            PaymentMethod::BankCard,
            PaymentMethod::BankTransfer,
        ] {
            let s = v
                .as_db_str()
                .unwrap_or_else(|| panic!("non-None variant {v:?} must serialize"));
            let parsed: PaymentMethod = s
                .parse()
                .unwrap_or_else(|e| panic!("round-trip failed for {v:?}: {e}"));
            assert_eq!(v, parsed);
        }
        assert_eq!(PaymentMethod::None.as_db_str(), None);
    }

    #[test]
    fn payment_method_from_str_unknown_returns_err_with_input() {
        let err = "WAT".parse::<PaymentMethod>().unwrap_err();
        assert_eq!(err, "WAT");
    }
}

use anyhow::{anyhow, Context};
use chrono::NaiveDate;
use sqlx::SqlitePool;

use crate::context::procedure::domain::{PaymentMethod, Procedure, ProcedureStatus};

/// Internal row type for procedure database mapping
#[derive(sqlx::FromRow)]
pub struct ProcedureRow {
    pub id: String,
    pub patient_id: String,
    pub fund_id: Option<String>,
    pub procedure_type_id: String,
    pub procedure_date: String,
    pub procedure_amount: Option<i64>,
    pub payment_method: Option<String>,
    pub confirmed_payment_date: Option<String>,
    pub actual_payment_amount: Option<i64>,
    pub payment_status: Option<String>,
    pub is_deleted: i64,
}

/// Internal row type for procedure queries with SSN (used for reconciliation batching)
#[derive(sqlx::FromRow)]
pub struct ProcedureWithSSNRow {
    pub id: String,
    pub patient_id: String,
    pub fund_id: Option<String>,
    pub procedure_type_id: String,
    pub procedure_date: String,
    pub procedure_amount: Option<i64>,
    pub payment_method: Option<String>,
    pub confirmed_payment_date: Option<String>,
    pub actual_payment_amount: Option<i64>,
    pub payment_status: Option<String>,
    pub is_deleted: i64,
    pub ssn: String,
}

/// Row type for unreconciled procedure queries with patient info
#[derive(sqlx::FromRow)]
pub struct UnreconciledProcedureRow {
    pub procedure_id: String,
    pub patient_id: String,
    pub patient_name: Option<String>,
    pub patient_ssn: Option<String>,
    pub procedure_date: String,
    pub amount: Option<i64>,
}

// Conversion function from row type to domain object
impl From<ProcedureRow> for Procedure {
    fn from(row: ProcedureRow) -> Self {
        let payment_method = match row.payment_method.as_deref() {
            Some("CASH") => PaymentMethod::Cash,
            Some("CHECK") => PaymentMethod::Check,
            Some("BANK_CARD") => PaymentMethod::BankCard,
            Some("BANK_TRANSFER") => PaymentMethod::BankTransfer,
            _ => PaymentMethod::None,
        };

        let payment_status = match row.payment_status.as_deref() {
            Some("CREATED") => ProcedureStatus::Created,
            Some("RECONCILIATED") => ProcedureStatus::Reconciliated,
            Some("PARTIALLY_RECONCILED") => ProcedureStatus::PartiallyReconciled,
            Some("DIRECTLY_PAYED") => ProcedureStatus::DirectlyPayed,
            Some("FUND_PAYED") => ProcedureStatus::FundPayed,
            Some("PARTIALLY_FUND_PAYED") => ProcedureStatus::PartiallyFundPayed,
            Some("IMPORT_DIRECTLY_PAYED") => ProcedureStatus::ImportDirectlyPayed,
            Some("IMPORT_FUND_PAYED") => ProcedureStatus::ImportFundPayed,
            _ => ProcedureStatus::None,
        };

        let procedure_date_parsed = match NaiveDate::parse_from_str(&row.procedure_date, "%Y-%m-%d")
        {
            Ok(date) => date,
            Err(_) => NaiveDate::MIN,
        };

        let confirmed_payment_date_parsed = row
            .confirmed_payment_date
            .and_then(|date_str| NaiveDate::parse_from_str(&date_str, "%Y-%m-%d").ok());

        Procedure::restore(
            row.id,
            row.patient_id,
            row.fund_id,
            row.procedure_type_id,
            procedure_date_parsed,
            row.procedure_amount,
            payment_method,
            confirmed_payment_date_parsed,
            row.actual_payment_amount,
            payment_status,
        )
    }
}

/// ProcedureRepository trait defines the contract for procedure data access
#[async_trait::async_trait]
pub trait ProcedureRepository: Send + Sync {
    #[allow(clippy::too_many_arguments)]
    async fn create_procedure(
        &self,
        patient_id: String,
        fund_id: Option<String>,
        procedure_type_id: String,
        procedure_date: String,
        procedure_amount: Option<i64>,
        payment_method: PaymentMethod,
        confirmed_payment_date: Option<String>,
        actual_payment_amount: Option<i64>,
        payment_status: ProcedureStatus,
    ) -> anyhow::Result<Procedure>;

    async fn read_all_procedures(&self) -> anyhow::Result<Vec<Procedure>>;
    async fn read_procedure(&self, id: &str) -> anyhow::Result<Option<Procedure>>;
    async fn read_procedures_by_ids(&self, ids: &[String]) -> anyhow::Result<Vec<Procedure>>;
    async fn update_procedure(&self, procedure: Procedure) -> anyhow::Result<Procedure>;
    async fn delete_procedure(&self, id: &str) -> anyhow::Result<()>;

    async fn find_procedures_by_ssn_and_date_range(
        &self,
        ssn: &str,
        start_date: &str,
        end_date: &str,
    ) -> anyhow::Result<Vec<Procedure>>;

    async fn find_procedures_by_ssns_and_date_range(
        &self,
        ssns: &[String],
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
    async fn find_procedure_exact(
        &self,
        patient_id: &str,
        fund_id: Option<&str>,
        procedure_date: &str,
        procedure_amount: i64,
    ) -> anyhow::Result<Option<Procedure>>;

    async fn create_batch(&self, procedures: Vec<Procedure>) -> anyhow::Result<Vec<Procedure>>;
    async fn update_batch(&self, procedures: Vec<Procedure>) -> anyhow::Result<Vec<Procedure>>;
    async fn find_unpaid_by_fund(&self, fund_id: &str) -> anyhow::Result<Vec<Procedure>>;

    async fn find_unreconciled_by_date_range(
        &self,
        start_date: &str,
        end_date: &str,
    ) -> anyhow::Result<Vec<UnreconciledProcedureRow>>;

    /// Returns true if any non-deleted procedure in the given month (YYYY-MM) has a
    /// blocking status (RECONCILIATED or FUND_PAYED), preventing re-import.
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
}

pub struct SqliteProcedureRepository {
    pool: SqlitePool,
}

impl SqliteProcedureRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

fn payment_method_to_str(method: PaymentMethod) -> Option<&'static str> {
    match method {
        PaymentMethod::None => None,
        PaymentMethod::Cash => Some("CASH"),
        PaymentMethod::Check => Some("CHECK"),
        PaymentMethod::BankCard => Some("BANK_CARD"),
        PaymentMethod::BankTransfer => Some("BANK_TRANSFER"),
    }
}

fn payment_status_to_str(status: ProcedureStatus) -> &'static str {
    match status {
        ProcedureStatus::None => "NONE",
        ProcedureStatus::Created => "CREATED",
        ProcedureStatus::Reconciliated => "RECONCILIATED",
        ProcedureStatus::PartiallyReconciled => "PARTIALLY_RECONCILED",
        ProcedureStatus::DirectlyPayed => "DIRECTLY_PAYED",
        ProcedureStatus::FundPayed => "FUND_PAYED",
        ProcedureStatus::PartiallyFundPayed => "PARTIALLY_FUND_PAYED",
        ProcedureStatus::ImportDirectlyPayed => "IMPORT_DIRECTLY_PAYED",
        ProcedureStatus::ImportFundPayed => "IMPORT_FUND_PAYED",
    }
}

#[async_trait::async_trait]
impl ProcedureRepository for SqliteProcedureRepository {
    #[allow(clippy::too_many_arguments)]
    async fn create_procedure(
        &self,
        patient_id: String,
        fund_id: Option<String>,
        procedure_type_id: String,
        procedure_date: String,
        procedure_amount: Option<i64>,
        payment_method: PaymentMethod,
        confirmed_payment_date: Option<String>,
        actual_payment_amount: Option<i64>,
        payment_status: ProcedureStatus,
    ) -> anyhow::Result<Procedure> {
        let procedure = Procedure::new(
            patient_id,
            fund_id,
            procedure_type_id,
            procedure_date,
            procedure_amount,
            payment_method,
            confirmed_payment_date,
            actual_payment_amount,
            payment_status,
        )?;

        let payment_method_str = payment_method_to_str(procedure.payment_method);
        let payment_status_str = payment_status_to_str(procedure.payment_status);
        let procedure_date_str = procedure.procedure_date.format("%Y-%m-%d").to_string();
        let confirmed_payment_date_str = procedure
            .confirmed_payment_date
            .map(|d| d.format("%Y-%m-%d").to_string());

        tracing::trace!(
            procedure_id = %procedure.id,
            patient_id = %procedure.patient_id,
            "Inserting procedure into database"
        );

        sqlx::query!(
            r#"
            INSERT INTO procedure (id, patient_id, fund_id, procedure_type_id, procedure_date, procedure_amount, payment_method, confirmed_payment_date, actual_payment_amount, payment_status, is_deleted)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0)
            "#,
            procedure.id,
            procedure.patient_id,
            procedure.fund_id,
            procedure.procedure_type_id,
            procedure_date_str,
            procedure.procedure_amount,
            payment_method_str,
            confirmed_payment_date_str,
            procedure.actual_payment_amount,
            payment_status_str,
        )
        .execute(&self.pool)
        .await?;

        tracing::trace!(procedure_id = %procedure.id, "Procedure inserted successfully");

        Ok(procedure)
    }

    async fn read_all_procedures(&self) -> anyhow::Result<Vec<Procedure>> {
        tracing::trace!("Fetching all active procedures from database");

        let rows = sqlx::query_as!(
            ProcedureRow,
            r#"
            SELECT id, patient_id, fund_id, procedure_type_id, procedure_date, procedure_amount, payment_method, confirmed_payment_date, actual_payment_amount, payment_status, is_deleted
            FROM procedure
            WHERE is_deleted = 0
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(Procedure::from).collect())
    }

    async fn read_procedure(&self, id: &str) -> anyhow::Result<Option<Procedure>> {
        tracing::trace!(procedure_id = %id, "Fetching procedure from database");

        let row = sqlx::query_as!(
            ProcedureRow,
            r#"
            SELECT id, patient_id, fund_id, procedure_type_id, procedure_date, procedure_amount, payment_method, confirmed_payment_date, actual_payment_amount, payment_status, is_deleted
            FROM procedure
            WHERE id = $1 AND is_deleted = 0
            "#,
            id,
        )
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(Procedure::from))
    }

    async fn read_procedures_by_ids(&self, ids: &[String]) -> anyhow::Result<Vec<Procedure>> {
        tracing::debug!(count = ids.len(), "Fetching procedures by IDs");

        if ids.is_empty() {
            return Ok(Vec::new());
        }

        let placeholders = (1..=ids.len())
            .map(|i| format!("${}", i))
            .collect::<Vec<_>>()
            .join(",");

        let query = format!(
            r#"
            SELECT id, patient_id, fund_id, procedure_type_id, procedure_date, procedure_amount,
                   payment_method, confirmed_payment_date, actual_payment_amount,
                   payment_status, is_deleted
            FROM procedure
            WHERE id IN ({}) AND is_deleted = 0
            "#,
            placeholders
        );

        let mut query_builder = sqlx::query_as::<_, ProcedureRow>(&query);
        for id in ids {
            query_builder = query_builder.bind(id);
        }

        let rows = query_builder
            .fetch_all(&self.pool)
            .await
            .context("Failed to fetch procedures by IDs")?;

        Ok(rows.into_iter().map(Procedure::from).collect())
    }

    async fn update_procedure(&self, procedure: Procedure) -> anyhow::Result<Procedure> {
        tracing::trace!(procedure_id = %procedure.id, "Updating procedure in database");

        let payment_method_str = payment_method_to_str(procedure.payment_method);
        let payment_status_str = payment_status_to_str(procedure.payment_status);
        let procedure_date_str = procedure.procedure_date.format("%Y-%m-%d").to_string();
        let confirmed_payment_date_str = procedure
            .confirmed_payment_date
            .map(|d| d.format("%Y-%m-%d").to_string());

        sqlx::query!(
            r#"
            UPDATE procedure
            SET patient_id = $1, fund_id = $2, procedure_type_id = $3, procedure_date = $4, procedure_amount = $5, payment_method = $6, confirmed_payment_date = $7, actual_payment_amount = $8, payment_status = $9
            WHERE id = $10
            "#,
            procedure.patient_id,
            procedure.fund_id,
            procedure.procedure_type_id,
            procedure_date_str,
            procedure.procedure_amount,
            payment_method_str,
            confirmed_payment_date_str,
            procedure.actual_payment_amount,
            payment_status_str,
            procedure.id,
        )
        .execute(&self.pool)
        .await?;

        tracing::trace!("Procedure updated successfully");
        Ok(procedure.clone())
    }

    async fn delete_procedure(&self, id: &str) -> anyhow::Result<()> {
        tracing::trace!(procedure_id = %id, "Soft-deleting procedure from database");

        sqlx::query!(r#"UPDATE procedure SET is_deleted = 1 WHERE id = ?"#, id)
            .execute(&self.pool)
            .await
            .with_context(|| anyhow!("Failed to soft-delete procedure"))?;

        Ok(())
    }

    async fn find_procedures_by_ssn_and_date_range(
        &self,
        ssn: &str,
        start_date: &str,
        end_date: &str,
    ) -> anyhow::Result<Vec<Procedure>> {
        tracing::trace!(ssn = %ssn, start = %start_date, end = %end_date,
                        "Querying procedures by SSN and date range");

        let rows = sqlx::query_as!(
            ProcedureRow,
            r#"
            SELECT hp.id, hp.patient_id, hp.fund_id, hp.procedure_type_id,
                   hp.procedure_date, hp.procedure_amount, hp.payment_method, hp.confirmed_payment_date, hp.actual_payment_amount, hp.payment_status, hp.is_deleted
            FROM procedure hp
            JOIN patient p ON hp.patient_id = p.id
            WHERE p.ssn = $1
              AND hp.procedure_date >= $2
              AND hp.procedure_date <= $3
              AND hp.is_deleted = 0
              AND p.is_deleted = 0
            ORDER BY hp.procedure_date ASC
            "#,
            ssn,
            start_date,
            end_date,
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(Procedure::from).collect())
    }

    async fn find_procedures_by_ssns_and_date_range(
        &self,
        ssns: &[String],
        start_date: &str,
        end_date: &str,
    ) -> anyhow::Result<Vec<Procedure>> {
        if ssns.is_empty() {
            return Ok(Vec::new());
        }

        tracing::trace!(
            ssn_count = ssns.len(),
            start = %start_date,
            end = %end_date,
            "Querying procedures by multiple SSNs and date range (batch)"
        );

        let ssn_list = ssns.join("','");
        let query_str = format!(
            r#"
            SELECT hp.id, hp.patient_id, hp.fund_id, hp.procedure_type_id,
                   hp.procedure_date, hp.procedure_amount, hp.payment_method, hp.confirmed_payment_date, hp.actual_payment_amount, hp.payment_status, hp.is_deleted
            FROM procedure hp
            JOIN patient p ON hp.patient_id = p.id
            WHERE p.ssn IN ('{}')
              AND hp.procedure_date >= '{}'
              AND hp.procedure_date <= '{}'
              AND hp.is_deleted = 0
              AND p.is_deleted = 0
            ORDER BY hp.procedure_date ASC
            "#,
            ssn_list, start_date, end_date
        );

        let rows = sqlx::query_as::<_, ProcedureRow>(&query_str)
            .fetch_all(&self.pool)
            .await?;

        tracing::trace!(
            ssn_count = ssns.len(),
            procedure_count = rows.len(),
            "Batch procedure query completed"
        );

        Ok(rows.into_iter().map(Procedure::from).collect())
    }

    async fn find_procedures_by_ssns_and_date_range_with_ssn(
        &self,
        ssns: &[String],
        start_date: &str,
        end_date: &str,
    ) -> anyhow::Result<Vec<(String, Procedure)>> {
        if ssns.is_empty() {
            return Ok(Vec::new());
        }

        tracing::debug!(
            ssn_count = ssns.len(),
            start = %start_date,
            end = %end_date,
            "Batch querying procedures by multiple SSNs (with SSN return for grouping)"
        );

        let ssn_list = ssns.join("','");
        let query_str = format!(
            r#"
            SELECT hp.id, hp.patient_id, hp.fund_id, hp.procedure_type_id,
                   hp.procedure_date, hp.procedure_amount, hp.payment_method, hp.confirmed_payment_date,
                   hp.actual_payment_amount, hp.payment_status, hp.is_deleted,
                   p.ssn
            FROM procedure hp
            JOIN patient p ON hp.patient_id = p.id
            WHERE p.ssn IN ('{}')
              AND hp.procedure_date >= '{}'
              AND hp.procedure_date <= '{}'
              AND hp.is_deleted = 0
              AND p.is_deleted = 0
            ORDER BY p.ssn, hp.procedure_date ASC
            "#,
            ssn_list, start_date, end_date
        );

        let rows = sqlx::query_as::<_, ProcedureWithSSNRow>(&query_str)
            .fetch_all(&self.pool)
            .await?;

        tracing::info!(
            ssn_count = ssns.len(),
            procedure_count = rows.len(),
            "Batch procedure query with SSN completed (1 query instead of {} queries)",
            ssns.len()
        );

        Ok(rows
            .into_iter()
            .map(|row| {
                let ssn = row.ssn.clone();
                let proc_row = ProcedureRow {
                    id: row.id,
                    patient_id: row.patient_id,
                    fund_id: row.fund_id,
                    procedure_type_id: row.procedure_type_id,
                    procedure_date: row.procedure_date,
                    procedure_amount: row.procedure_amount,
                    payment_method: row.payment_method,
                    confirmed_payment_date: row.confirmed_payment_date,
                    actual_payment_amount: row.actual_payment_amount,
                    payment_status: row.payment_status,
                    is_deleted: row.is_deleted,
                };
                (ssn, Procedure::from(proc_row))
            })
            .collect())
    }

    async fn find_procedure_exact(
        &self,
        patient_id: &str,
        fund_id: Option<&str>,
        procedure_date: &str,
        procedure_amount: i64,
    ) -> anyhow::Result<Option<Procedure>> {
        tracing::trace!(
            patient_id = %patient_id,
            fund_id = ?fund_id,
            procedure_date = %procedure_date,
            procedure_amount = %procedure_amount,
            "Querying for exact procedure match"
        );

        let row = sqlx::query_as!(
            ProcedureRow,
            r#"
            SELECT id, patient_id, fund_id, procedure_type_id, procedure_date, procedure_amount, payment_method, confirmed_payment_date, actual_payment_amount, payment_status, is_deleted
            FROM procedure
            WHERE patient_id = $1
              AND fund_id IS $2
              AND procedure_date = $3
              AND procedure_amount = $4
              AND is_deleted = 0
            LIMIT 1
            "#,
            patient_id,
            fund_id,
            procedure_date,
            procedure_amount,
        )
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(Procedure::from))
    }

    async fn create_batch(&self, procedures: Vec<Procedure>) -> anyhow::Result<Vec<Procedure>> {
        let mut tx = self.pool.begin().await?;
        let mut created_procedures = Vec::new();

        for procedure in procedures {
            let payment_method_str = payment_method_to_str(procedure.payment_method);
            let payment_status_str = payment_status_to_str(procedure.payment_status);
            let procedure_date_str = procedure.procedure_date.format("%Y-%m-%d").to_string();
            let confirmed_payment_date_str = procedure
                .confirmed_payment_date
                .map(|d| d.format("%Y-%m-%d").to_string());

            tracing::trace!(
                procedure_id = %procedure.id,
                patient_id = %procedure.patient_id,
                "Inserting procedure into database (batch)"
            );

            sqlx::query!(
                r#"
                INSERT INTO procedure (id, patient_id, fund_id, procedure_type_id, procedure_date, procedure_amount, payment_method, confirmed_payment_date, actual_payment_amount, payment_status, is_deleted)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0)
                "#,
                procedure.id,
                procedure.patient_id,
                procedure.fund_id,
                procedure.procedure_type_id,
                procedure_date_str,
                procedure.procedure_amount,
                payment_method_str,
                confirmed_payment_date_str,
                procedure.actual_payment_amount,
                payment_status_str,
            )
            .execute(&mut *tx)
            .await?;

            created_procedures.push(procedure.clone());
        }

        tx.commit().await?;
        tracing::trace!(
            count = created_procedures.len(),
            "Procedures batch inserted successfully"
        );

        Ok(created_procedures)
    }

    async fn update_batch(&self, procedures: Vec<Procedure>) -> anyhow::Result<Vec<Procedure>> {
        let mut tx = self.pool.begin().await?;
        let mut updated_procedures = Vec::new();

        for procedure in procedures {
            let payment_method_str = payment_method_to_str(procedure.payment_method);
            let payment_status_str = payment_status_to_str(procedure.payment_status);
            let procedure_date_str = procedure.procedure_date.format("%Y-%m-%d").to_string();
            let confirmed_payment_date_str = procedure
                .confirmed_payment_date
                .map(|d| d.format("%Y-%m-%d").to_string());

            tracing::trace!(
                procedure_id = %procedure.id,
                "Updating procedure in database (batch)"
            );

            sqlx::query!(
                r#"
                UPDATE procedure
                SET patient_id = $1, fund_id = $2, procedure_type_id = $3, procedure_date = $4, procedure_amount = $5, payment_method = $6, confirmed_payment_date = $7, actual_payment_amount = $8, payment_status = $9
                WHERE id = $10
                "#,
                procedure.patient_id,
                procedure.fund_id,
                procedure.procedure_type_id,
                procedure_date_str,
                procedure.procedure_amount,
                payment_method_str,
                confirmed_payment_date_str,
                procedure.actual_payment_amount,
                payment_status_str,
                procedure.id,
            )
            .execute(&mut *tx)
            .await?;

            updated_procedures.push(procedure.clone());
        }

        tx.commit().await?;
        tracing::trace!(
            count = updated_procedures.len(),
            "Procedures batch updated successfully"
        );

        Ok(updated_procedures)
    }

    async fn find_unpaid_by_fund(&self, fund_id: &str) -> anyhow::Result<Vec<Procedure>> {
        tracing::debug!(fund_id = %fund_id, "Finding unpaid procedures by fund");

        let rows = sqlx::query_as!(
            ProcedureRow,
            r#"
            SELECT hp.id, hp.patient_id, hp.fund_id, hp.procedure_type_id, hp.procedure_date,
                   hp.procedure_amount, hp.payment_method, hp.confirmed_payment_date,
                   hp.actual_payment_amount, hp.payment_status, hp.is_deleted
            FROM procedure hp
            WHERE hp.fund_id = $1
              AND hp.is_deleted = 0
              AND hp.payment_status = 'CREATED'
            ORDER BY hp.procedure_date DESC
            "#,
            fund_id
        )
        .fetch_all(&self.pool)
        .await
        .context("Failed to find unpaid procedures by fund")?;

        Ok(rows.into_iter().map(Procedure::from).collect())
    }

    async fn find_unreconciled_by_date_range(
        &self,
        start_date: &str,
        end_date: &str,
    ) -> anyhow::Result<Vec<UnreconciledProcedureRow>> {
        tracing::debug!(start_date = %start_date, end_date = %end_date, "Finding unreconciled procedures by date range");

        let rows = sqlx::query_as!(
            UnreconciledProcedureRow,
            r#"
            SELECT p.id AS procedure_id, p.patient_id,
                   pat.name AS patient_name, pat.ssn AS patient_ssn,
                   p.procedure_date, p.procedure_amount AS amount
            FROM "procedure" p
            JOIN patient pat ON p.patient_id = pat.id
            WHERE p.procedure_date BETWEEN $1 AND $2
              AND p.is_deleted = 0
              AND p.payment_status = 'CREATED'
              AND p.id NOT IN (
                  SELECT procedure_id FROM fund_payment_line WHERE is_deleted = 0
              )
            ORDER BY p.procedure_date
            "#,
            start_date,
            end_date
        )
        .fetch_all(&self.pool)
        .await
        .context("Failed to find unreconciled procedures by date range")?;

        Ok(rows)
    }

    async fn has_blocking_procedures_in_month(&self, month: &str) -> anyhow::Result<bool> {
        let pattern = format!("{month}-%");
        let count = sqlx::query_scalar!(
            r#"
            SELECT COUNT(*) FROM procedure
            WHERE procedure_date LIKE ?
              AND payment_status IN ('RECONCILIATED', 'FUND_PAYED')
              AND is_deleted = 0
            "#,
            pattern
        )
        .fetch_one(&self.pool)
        .await
        .context("Failed to check blocking procedures in month")?;

        Ok(count > 0)
    }

    async fn delete_procedures_by_month(&self, month: &str) -> anyhow::Result<u64> {
        let pattern = format!("{month}-%");
        let result = sqlx::query!(
            r#"DELETE FROM procedure WHERE procedure_date LIKE ?"#,
            pattern
        )
        .execute(&self.pool)
        .await
        .context("Failed to delete procedures by month")?;

        Ok(result.rows_affected())
    }

    async fn find_created_in_date_range(
        &self,
        date_min: &str,
        date_max: &str,
    ) -> anyhow::Result<Vec<Procedure>> {
        tracing::debug!(
            date_min = %date_min,
            date_max = %date_max,
            "Finding Created procedures in date range for direct payment"
        );

        let rows = sqlx::query_as!(
            ProcedureRow,
            r#"
            SELECT id, patient_id, fund_id, procedure_type_id, procedure_date,
                   procedure_amount, payment_method, confirmed_payment_date,
                   actual_payment_amount, payment_status, is_deleted
            FROM "procedure"
            WHERE is_deleted = 0
              AND payment_status = 'CREATED'
              AND procedure_date BETWEEN $1 AND $2
            ORDER BY procedure_date DESC
            "#,
            date_min,
            date_max,
        )
        .fetch_all(&self.pool)
        .await
        .context("Failed to find Created procedures in date range")?;

        Ok(rows.into_iter().map(Procedure::from).collect())
    }
}

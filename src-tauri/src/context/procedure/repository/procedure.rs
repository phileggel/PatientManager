use anyhow::{anyhow, Context};
use chrono::NaiveDate;
use sqlx::SqlitePool;

use crate::context::procedure::domain::{
    PaymentMethod, Procedure, ProcedureRepository, ProcedureStatus, UnreconciledProcedure,
};

/// Internal row type for procedure database mapping
#[derive(sqlx::FromRow)]
pub struct ProcedureRow {
    pub id: String,
    pub patient_id: String,
    pub fund_id: Option<String>,
    pub procedure_type_id: String,
    pub procedure_date: NaiveDate,
    pub billed_amount: Option<i64>,
    pub payment_method: Option<String>,
    pub fund_reconciliation_date: Option<NaiveDate>,
    pub confirmed_payment_date: Option<NaiveDate>,
    pub paid_amount: Option<i64>,
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
    pub procedure_date: NaiveDate,
    pub billed_amount: Option<i64>,
    pub payment_method: Option<String>,
    pub fund_reconciliation_date: Option<NaiveDate>,
    pub confirmed_payment_date: Option<NaiveDate>,
    pub paid_amount: Option<i64>,
    pub payment_status: Option<String>,
    pub is_deleted: i64,
    pub ssn: String,
}

/// Internal row type for unreconciled procedure queries with patient info
#[derive(sqlx::FromRow)]
struct UnreconciledProcedureRow {
    procedure_id: String,
    patient_id: String,
    patient_name: Option<String>,
    patient_ssn: Option<String>,
    procedure_date: NaiveDate,
    amount: Option<i64>,
}

impl From<UnreconciledProcedureRow> for UnreconciledProcedure {
    fn from(row: UnreconciledProcedureRow) -> Self {
        UnreconciledProcedure {
            procedure_id: row.procedure_id,
            patient_id: row.patient_id,
            patient_name: row.patient_name,
            patient_ssn: row.patient_ssn,
            procedure_date: row.procedure_date,
            amount: row.amount,
        }
    }
}

// Conversion function from row type to domain object
impl From<ProcedureRow> for Procedure {
    fn from(row: ProcedureRow) -> Self {
        let payment_method = row
            .payment_method
            .as_deref()
            .and_then(|s| s.parse::<PaymentMethod>().ok())
            .unwrap_or_default();

        let payment_status = row
            .payment_status
            .as_deref()
            .and_then(|s| s.parse::<ProcedureStatus>().ok())
            .unwrap_or_default();

        Procedure::restore(
            row.id,
            row.patient_id,
            row.fund_id,
            row.procedure_type_id,
            row.procedure_date,
            row.billed_amount,
            payment_method,
            row.fund_reconciliation_date,
            row.confirmed_payment_date,
            row.paid_amount,
            payment_status,
        )
    }
}

pub struct SqliteProcedureRepository {
    pool: SqlitePool,
}

impl SqliteProcedureRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
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
        billed_amount: Option<i64>,
        payment_method: PaymentMethod,
        fund_reconciliation_date: Option<String>,
        confirmed_payment_date: Option<String>,
        paid_amount: Option<i64>,
        payment_status: ProcedureStatus,
    ) -> anyhow::Result<Procedure> {
        let procedure = Procedure::new(
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
        )?;

        let payment_method_str = procedure.payment_method.as_db_str();
        let payment_status_str = procedure.payment_status.as_db_str();

        tracing::trace!(
            procedure_id = %procedure.id,
            patient_id = %procedure.patient_id,
            "Inserting procedure into database"
        );

        sqlx::query!(
            r#"
            INSERT INTO procedure (id, patient_id, fund_id, procedure_type_id, procedure_date, billed_amount, payment_method, fund_reconciliation_date, confirmed_payment_date, paid_amount, payment_status, is_deleted)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0)
            "#,
            procedure.id,
            procedure.patient_id,
            procedure.fund_id,
            procedure.procedure_type_id,
            procedure.procedure_date,
            procedure.billed_amount,
            payment_method_str,
            procedure.fund_reconciliation_date,
            procedure.confirmed_payment_date,
            procedure.paid_amount,
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
            SELECT id, patient_id, fund_id, procedure_type_id, procedure_date AS "procedure_date: NaiveDate", billed_amount, payment_method, fund_reconciliation_date AS "fund_reconciliation_date?: NaiveDate", confirmed_payment_date AS "confirmed_payment_date?: NaiveDate", paid_amount, payment_status, is_deleted
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
            SELECT id, patient_id, fund_id, procedure_type_id, procedure_date AS "procedure_date: NaiveDate", billed_amount, payment_method, fund_reconciliation_date AS "fund_reconciliation_date?: NaiveDate", confirmed_payment_date AS "confirmed_payment_date?: NaiveDate", paid_amount, payment_status, is_deleted
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

        // sqlx::query_as! macros require static SQL; dynamic IN clauses with variable-length
        // lists cannot be expressed as compile-time macros. QueryBuilder with push_bind is the
        // recommended sqlx approach for this pattern.
        let mut builder = sqlx::QueryBuilder::new(
            "SELECT id, patient_id, fund_id, procedure_type_id, procedure_date, billed_amount,
                    payment_method, fund_reconciliation_date, confirmed_payment_date, paid_amount,
                    payment_status, is_deleted
             FROM procedure WHERE id IN (",
        );
        let mut separated = builder.separated(", ");
        for id in ids {
            separated.push_bind(id);
        }
        separated.push_unseparated(") AND is_deleted = 0");

        let rows = builder
            .build_query_as::<ProcedureRow>()
            .fetch_all(&self.pool)
            .await
            .context("Failed to fetch procedures by IDs")?;

        Ok(rows.into_iter().map(Procedure::from).collect())
    }

    async fn read_procedures_by_patient_id(
        &self,
        patient_id: &str,
    ) -> anyhow::Result<Vec<Procedure>> {
        tracing::trace!(patient_id = %patient_id, "Fetching procedures by patient_id");

        let rows = sqlx::query_as!(
            ProcedureRow,
            r#"
            SELECT id, patient_id, fund_id, procedure_type_id, procedure_date AS "procedure_date: NaiveDate", billed_amount, payment_method, fund_reconciliation_date AS "fund_reconciliation_date?: NaiveDate", confirmed_payment_date AS "confirmed_payment_date?: NaiveDate", paid_amount, payment_status, is_deleted
            FROM procedure
            WHERE patient_id = $1 AND is_deleted = 0
            "#,
            patient_id,
        )
        .fetch_all(&self.pool)
        .await
        .context("Failed to fetch procedures by patient_id")?;

        Ok(rows.into_iter().map(Procedure::from).collect())
    }

    async fn update_procedure(&self, procedure: Procedure) -> anyhow::Result<Procedure> {
        tracing::trace!(procedure_id = %procedure.id, "Updating procedure in database");

        let payment_method_str = procedure.payment_method.as_db_str();
        let payment_status_str = procedure.payment_status.as_db_str();

        sqlx::query!(
            r#"
            UPDATE procedure
            SET patient_id = $1, fund_id = $2, procedure_type_id = $3, procedure_date = $4, billed_amount = $5, payment_method = $6, fund_reconciliation_date = $7, confirmed_payment_date = $8, paid_amount = $9, payment_status = $10
            WHERE id = $11
            "#,
            procedure.patient_id,
            procedure.fund_id,
            procedure.procedure_type_id,
            procedure.procedure_date,
            procedure.billed_amount,
            payment_method_str,
            procedure.fund_reconciliation_date,
            procedure.confirmed_payment_date,
            procedure.paid_amount,
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
        tracing::trace!(start = %start_date, end = %end_date,
                        "Querying procedures by SSN and date range");

        let rows = sqlx::query_as!(
            ProcedureRow,
            r#"
            SELECT hp.id, hp.patient_id, hp.fund_id, hp.procedure_type_id,
                   hp.procedure_date AS "procedure_date: NaiveDate", hp.billed_amount, hp.payment_method, hp.fund_reconciliation_date AS "fund_reconciliation_date?: NaiveDate", hp.confirmed_payment_date AS "confirmed_payment_date?: NaiveDate", hp.paid_amount, hp.payment_status, hp.is_deleted
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

        // sqlx::query_as! macros require static SQL; dynamic IN clauses with variable-length
        // lists cannot be expressed as compile-time macros. QueryBuilder with push_bind is the
        // recommended sqlx approach for this pattern.
        let mut builder = sqlx::QueryBuilder::new(
            "SELECT hp.id, hp.patient_id, hp.fund_id, hp.procedure_type_id,
                    hp.procedure_date, hp.billed_amount, hp.payment_method,
                    hp.fund_reconciliation_date, hp.confirmed_payment_date, hp.paid_amount,
                    hp.payment_status, hp.is_deleted, p.ssn
             FROM procedure hp
             JOIN patient p ON hp.patient_id = p.id
             WHERE p.ssn IN (",
        );
        let mut separated = builder.separated(", ");
        for ssn in ssns {
            separated.push_bind(ssn);
        }
        // Confining the matcher to `Created` procedures — `Reconciled` /
        // `PartiallyReconciled` rows belong to an existing fund-payment
        // group and re-matching them would surface ghost anomalies on a
        // PDF re-import. The DB code is sourced from `as_db_str` to avoid
        // diverging from the domain serializer.
        separated
            .push_unseparated(")")
            .push_unseparated(" AND hp.procedure_date >= ")
            .push_bind_unseparated(start_date)
            .push_unseparated(" AND hp.procedure_date <= ")
            .push_bind_unseparated(end_date)
            .push_unseparated(" AND hp.payment_status = ")
            .push_bind_unseparated(ProcedureStatus::Created.as_db_str())
            .push_unseparated(
                " AND hp.is_deleted = 0 AND p.is_deleted = 0 ORDER BY p.ssn, hp.procedure_date ASC",
            );

        let rows = builder
            .build_query_as::<ProcedureWithSSNRow>()
            .fetch_all(&self.pool)
            .await?;

        tracing::info!(
            ssn_count = ssns.len(),
            procedure_count = rows.len(),
            "Batch procedure query with SSN completed"
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
                    billed_amount: row.billed_amount,
                    payment_method: row.payment_method,
                    fund_reconciliation_date: row.fund_reconciliation_date,
                    confirmed_payment_date: row.confirmed_payment_date,
                    paid_amount: row.paid_amount,
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
        billed_amount: i64,
    ) -> anyhow::Result<Option<Procedure>> {
        tracing::trace!(
            patient_id = %patient_id,
            fund_id = ?fund_id,
            procedure_date = %procedure_date,
            billed_amount = %billed_amount,
            "Querying for exact procedure match"
        );

        let row = sqlx::query_as!(
            ProcedureRow,
            r#"
            SELECT id, patient_id, fund_id, procedure_type_id, procedure_date AS "procedure_date: NaiveDate", billed_amount, payment_method, fund_reconciliation_date AS "fund_reconciliation_date?: NaiveDate", confirmed_payment_date AS "confirmed_payment_date?: NaiveDate", paid_amount, payment_status, is_deleted
            FROM procedure
            WHERE patient_id = $1
              AND fund_id IS $2
              AND procedure_date = $3
              AND billed_amount = $4
              AND is_deleted = 0
            LIMIT 1
            "#,
            patient_id,
            fund_id,
            procedure_date,
            billed_amount,
        )
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(Procedure::from))
    }

    async fn create_batch(&self, procedures: Vec<Procedure>) -> anyhow::Result<Vec<Procedure>> {
        let mut tx = self.pool.begin().await?;
        let mut created_procedures = Vec::new();

        for procedure in procedures {
            let payment_method_str = procedure.payment_method.as_db_str();
            let payment_status_str = procedure.payment_status.as_db_str();

            tracing::trace!(
                procedure_id = %procedure.id,
                patient_id = %procedure.patient_id,
                "Inserting procedure into database (batch)"
            );

            sqlx::query!(
                r#"
                INSERT INTO procedure (id, patient_id, fund_id, procedure_type_id, procedure_date, billed_amount, payment_method, fund_reconciliation_date, confirmed_payment_date, paid_amount, payment_status, is_deleted)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0)
                "#,
                procedure.id,
                procedure.patient_id,
                procedure.fund_id,
                procedure.procedure_type_id,
                procedure.procedure_date,
                procedure.billed_amount,
                payment_method_str,
                procedure.fund_reconciliation_date,
                procedure.confirmed_payment_date,
                procedure.paid_amount,
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
            let payment_method_str = procedure.payment_method.as_db_str();
            let payment_status_str = procedure.payment_status.as_db_str();

            tracing::trace!(
                procedure_id = %procedure.id,
                "Updating procedure in database (batch)"
            );

            sqlx::query!(
                r#"
                UPDATE procedure
                SET patient_id = $1, fund_id = $2, procedure_type_id = $3, procedure_date = $4, billed_amount = $5, payment_method = $6, fund_reconciliation_date = $7, confirmed_payment_date = $8, paid_amount = $9, payment_status = $10
                WHERE id = $11
                "#,
                procedure.patient_id,
                procedure.fund_id,
                procedure.procedure_type_id,
                procedure.procedure_date,
                procedure.billed_amount,
                payment_method_str,
                procedure.fund_reconciliation_date,
                procedure.confirmed_payment_date,
                procedure.paid_amount,
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
            SELECT hp.id, hp.patient_id, hp.fund_id, hp.procedure_type_id, hp.procedure_date AS "procedure_date: NaiveDate",
                   hp.billed_amount, hp.payment_method, hp.fund_reconciliation_date AS "fund_reconciliation_date?: NaiveDate", hp.confirmed_payment_date AS "confirmed_payment_date?: NaiveDate",
                   hp.paid_amount, hp.payment_status, hp.is_deleted
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
    ) -> anyhow::Result<Vec<UnreconciledProcedure>> {
        tracing::debug!(start_date = %start_date, end_date = %end_date, "Finding unreconciled procedures by date range");

        let rows = sqlx::query_as!(
            UnreconciledProcedureRow,
            r#"
            SELECT p.id AS procedure_id, p.patient_id,
                   pat.name AS patient_name, pat.ssn AS patient_ssn,
                   p.procedure_date AS "procedure_date: NaiveDate", p.billed_amount AS amount
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

        Ok(rows.into_iter().map(UnreconciledProcedure::from).collect())
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
            SELECT id, patient_id, fund_id, procedure_type_id, procedure_date AS "procedure_date: NaiveDate",
                   billed_amount, payment_method, fund_reconciliation_date AS "fund_reconciliation_date?: NaiveDate", confirmed_payment_date AS "confirmed_payment_date?: NaiveDate",
                   paid_amount, payment_status, is_deleted
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

    async fn find_created_by_fund_before_date(
        &self,
        fund_id: &str,
        date: &str,
    ) -> anyhow::Result<Vec<Procedure>> {
        tracing::debug!(
            fund_id = %fund_id,
            date = %date,
            "Finding Created procedures by fund before date (R19)"
        );

        let rows = sqlx::query_as!(
            ProcedureRow,
            r#"
            SELECT id, patient_id, fund_id, procedure_type_id, procedure_date AS "procedure_date: NaiveDate",
                   billed_amount, payment_method, fund_reconciliation_date AS "fund_reconciliation_date?: NaiveDate", confirmed_payment_date AS "confirmed_payment_date?: NaiveDate",
                   paid_amount, payment_status, is_deleted
            FROM "procedure"
            WHERE fund_id = $1
              AND payment_status = 'CREATED'
              AND procedure_date <= $2
              AND is_deleted = 0
            ORDER BY procedure_date DESC
            "#,
            fund_id,
            date,
        )
        .fetch_all(&self.pool)
        .await
        .context("Failed to find Created procedures by fund before date")?;

        Ok(rows.into_iter().map(Procedure::from).collect())
    }
}

#[cfg(test)]
mod tests {
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

    use super::*;

    async fn setup() -> SqliteProcedureRepository {
        let opts = SqliteConnectOptions::new()
            .in_memory(true)
            .foreign_keys(false);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(opts)
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        SqliteProcedureRepository { pool }
    }

    fn make_procedure(
        patient_id: &str,
        procedure_type_id: &str,
        date: &str,
    ) -> anyhow::Result<Procedure> {
        Procedure::new(
            patient_id.to_string(),
            None,
            procedure_type_id.to_string(),
            date.to_string(),
            Some(10000),
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::Created,
        )
    }

    #[tokio::test]
    async fn create_and_read_procedure() {
        let repo = setup().await;
        let p = make_procedure("patient-1", "type-1", "2026-01-15").unwrap();
        let created = repo
            .create_procedure(
                p.patient_id.clone(),
                p.fund_id.clone(),
                p.procedure_type_id.clone(),
                "2026-01-15".to_string(),
                p.billed_amount,
                p.payment_method,
                None,
                None,
                p.paid_amount,
                p.payment_status,
            )
            .await
            .unwrap();

        let found = repo.read_procedure(&created.id).await.unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().patient_id, "patient-1");
    }

    #[tokio::test]
    async fn read_procedure_returns_none_for_unknown_id() {
        let repo = setup().await;
        let found = repo.read_procedure("no-such-id").await.unwrap();
        assert!(found.is_none());
    }

    #[tokio::test]
    async fn read_all_procedures_returns_created_records() {
        let repo = setup().await;
        repo.create_procedure(
            "p1".to_string(),
            None,
            "t1".to_string(),
            "2026-01-01".to_string(),
            None,
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::Created,
        )
        .await
        .unwrap();
        repo.create_procedure(
            "p2".to_string(),
            None,
            "t1".to_string(),
            "2026-01-02".to_string(),
            None,
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::Created,
        )
        .await
        .unwrap();
        let all = repo.read_all_procedures().await.unwrap();
        assert_eq!(all.len(), 2);
    }

    #[tokio::test]
    async fn delete_procedure_soft_deletes() {
        let repo = setup().await;
        let created = repo
            .create_procedure(
                "p1".to_string(),
                None,
                "t1".to_string(),
                "2026-01-01".to_string(),
                None,
                PaymentMethod::None,
                None,
                None,
                None,
                ProcedureStatus::Created,
            )
            .await
            .unwrap();
        repo.delete_procedure(&created.id).await.unwrap();
        let found = repo.read_procedure(&created.id).await.unwrap();
        assert!(found.is_none());
        let all = repo.read_all_procedures().await.unwrap();
        assert!(all.is_empty());
    }

    #[tokio::test]
    async fn update_procedure_persists_changes() {
        let repo = setup().await;
        let created = repo
            .create_procedure(
                "p1".to_string(),
                None,
                "t1".to_string(),
                "2026-01-01".to_string(),
                Some(5000),
                PaymentMethod::None,
                None,
                None,
                None,
                ProcedureStatus::Created,
            )
            .await
            .unwrap();
        let updated = Procedure::restore(
            created.id.clone(),
            "p1".to_string(),
            None,
            "t1".to_string(),
            created.procedure_date,
            Some(9999),
            PaymentMethod::Cash,
            None,
            None,
            None,
            ProcedureStatus::DirectlyPaid,
        );
        repo.update_procedure(updated).await.unwrap();
        let found = repo.read_procedure(&created.id).await.unwrap().unwrap();
        assert_eq!(found.billed_amount, Some(9999));
        assert_eq!(found.payment_status, ProcedureStatus::DirectlyPaid);
    }

    #[tokio::test]
    async fn has_blocking_procedures_in_month_returns_false_when_none() {
        let repo = setup().await;
        let result = repo
            .has_blocking_procedures_in_month("2026-01")
            .await
            .unwrap();
        assert!(!result);
    }

    #[tokio::test]
    async fn has_blocking_procedures_in_month_returns_true_when_reconciled() {
        let repo = setup().await;
        let created = repo
            .create_procedure(
                "p1".to_string(),
                None,
                "t1".to_string(),
                "2026-01-10".to_string(),
                None,
                PaymentMethod::None,
                None,
                None,
                None,
                ProcedureStatus::Reconciled,
            )
            .await
            .unwrap();
        // Update to reconciled status
        let updated = Procedure::restore(
            created.id.clone(),
            "p1".to_string(),
            None,
            "t1".to_string(),
            created.procedure_date,
            None,
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::Reconciled,
        );
        repo.update_procedure(updated).await.unwrap();
        let result = repo
            .has_blocking_procedures_in_month("2026-01")
            .await
            .unwrap();
        assert!(result);
    }

    #[tokio::test]
    async fn delete_procedures_by_month_removes_all() {
        let repo = setup().await;
        repo.create_procedure(
            "p1".to_string(),
            None,
            "t1".to_string(),
            "2026-02-05".to_string(),
            None,
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::Created,
        )
        .await
        .unwrap();
        repo.create_procedure(
            "p2".to_string(),
            None,
            "t1".to_string(),
            "2026-02-15".to_string(),
            None,
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::Created,
        )
        .await
        .unwrap();
        let deleted = repo.delete_procedures_by_month("2026-02").await.unwrap();
        assert_eq!(deleted, 2);
        assert!(repo.read_all_procedures().await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn find_created_in_date_range_returns_matching() {
        let repo = setup().await;
        repo.create_procedure(
            "p1".to_string(),
            None,
            "t1".to_string(),
            "2026-03-05".to_string(),
            None,
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::Created,
        )
        .await
        .unwrap();
        repo.create_procedure(
            "p2".to_string(),
            None,
            "t1".to_string(),
            "2026-04-01".to_string(),
            None,
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::Created,
        )
        .await
        .unwrap();
        let result = repo
            .find_created_in_date_range("2026-03-01", "2026-03-31")
            .await
            .unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].patient_id, "p1");
    }

    #[tokio::test]
    async fn read_procedures_by_ids_returns_subset() {
        let repo = setup().await;
        let c1 = repo
            .create_procedure(
                "p1".to_string(),
                None,
                "t1".to_string(),
                "2026-01-01".to_string(),
                None,
                PaymentMethod::None,
                None,
                None,
                None,
                ProcedureStatus::Created,
            )
            .await
            .unwrap();
        let c2 = repo
            .create_procedure(
                "p2".to_string(),
                None,
                "t1".to_string(),
                "2026-01-02".to_string(),
                None,
                PaymentMethod::None,
                None,
                None,
                None,
                ProcedureStatus::Created,
            )
            .await
            .unwrap();
        repo.create_procedure(
            "p3".to_string(),
            None,
            "t1".to_string(),
            "2026-01-03".to_string(),
            None,
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::Created,
        )
        .await
        .unwrap();
        let found = repo
            .read_procedures_by_ids(&[c1.id.clone(), c2.id.clone()])
            .await
            .unwrap();
        assert_eq!(found.len(), 2);
    }

    async fn seed_patient(pool: &sqlx::SqlitePool, id: &str, ssn: &str) {
        sqlx::query!(
            "INSERT INTO patient (id, is_anonymous, ssn, is_deleted) VALUES (?, 0, ?, 0)",
            id,
            ssn
        )
        .execute(pool)
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn read_procedures_by_patient_id_returns_matching() {
        let repo = setup().await;
        repo.create_procedure(
            "p1".into(),
            None,
            "t1".into(),
            "2026-01-01".into(),
            None,
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::Created,
        )
        .await
        .unwrap();
        repo.create_procedure(
            "p2".into(),
            None,
            "t1".into(),
            "2026-01-02".into(),
            None,
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::Created,
        )
        .await
        .unwrap();
        let result = repo.read_procedures_by_patient_id("p1").await.unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].patient_id, "p1");
    }

    #[tokio::test]
    async fn create_batch_inserts_multiple_in_transaction() {
        let repo = setup().await;
        let p1 = make_procedure("p1", "t1", "2026-01-10").unwrap();
        let p2 = make_procedure("p2", "t1", "2026-01-11").unwrap();
        let created = repo.create_batch(vec![p1, p2]).await.unwrap();
        assert_eq!(created.len(), 2);
        let all = repo.read_all_procedures().await.unwrap();
        assert_eq!(all.len(), 2);
    }

    #[tokio::test]
    async fn update_batch_updates_multiple_in_transaction() {
        let repo = setup().await;
        let c1 = repo
            .create_procedure(
                "p1".into(),
                None,
                "t1".into(),
                "2026-01-10".into(),
                Some(1000),
                PaymentMethod::None,
                None,
                None,
                None,
                ProcedureStatus::Created,
            )
            .await
            .unwrap();
        let c2 = repo
            .create_procedure(
                "p2".into(),
                None,
                "t1".into(),
                "2026-01-11".into(),
                Some(2000),
                PaymentMethod::None,
                None,
                None,
                None,
                ProcedureStatus::Created,
            )
            .await
            .unwrap();

        let u1 = Procedure::restore(
            c1.id.clone(),
            "p1".into(),
            None,
            "t1".into(),
            c1.procedure_date,
            Some(9999),
            PaymentMethod::Cash,
            None,
            None,
            None,
            ProcedureStatus::DirectlyPaid,
        );
        let u2 = Procedure::restore(
            c2.id.clone(),
            "p2".into(),
            None,
            "t1".into(),
            c2.procedure_date,
            Some(8888),
            PaymentMethod::Check,
            None,
            None,
            None,
            ProcedureStatus::FundPaid,
        );

        let updated = repo.update_batch(vec![u1, u2]).await.unwrap();
        assert_eq!(updated.len(), 2);

        let r1 = repo.read_procedure(&c1.id).await.unwrap().unwrap();
        assert_eq!(r1.billed_amount, Some(9999));
        assert_eq!(r1.payment_method, PaymentMethod::Cash);
        let r2 = repo.read_procedure(&c2.id).await.unwrap().unwrap();
        assert_eq!(r2.payment_status, ProcedureStatus::FundPaid);
        assert_eq!(r2.payment_method, PaymentMethod::Check);
    }

    #[tokio::test]
    async fn find_procedures_by_ssn_and_date_range_returns_matching() {
        let repo = setup().await;
        seed_patient(&repo.pool, "patient-1", "123456789012").await;
        repo.create_procedure(
            "patient-1".into(),
            None,
            "t1".into(),
            "2026-03-10".into(),
            Some(5000),
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::Created,
        )
        .await
        .unwrap();
        repo.create_procedure(
            "patient-1".into(),
            None,
            "t1".into(),
            "2026-05-01".into(),
            Some(5000),
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::Created,
        )
        .await
        .unwrap();

        let result = repo
            .find_procedures_by_ssn_and_date_range("123456789012", "2026-03-01", "2026-03-31")
            .await
            .unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].patient_id, "patient-1");
    }

    #[tokio::test]
    async fn find_procedures_by_ssns_and_date_range_with_ssn_returns_ssn_field() {
        let repo = setup().await;
        seed_patient(&repo.pool, "patient-1", "333333333333").await;
        repo.create_procedure(
            "patient-1".into(),
            None,
            "t1".into(),
            "2026-04-10".into(),
            Some(3000),
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::Created,
        )
        .await
        .unwrap();

        let ssns = vec!["333333333333".to_string()];
        let result = repo
            .find_procedures_by_ssns_and_date_range_with_ssn(&ssns, "2026-04-01", "2026-04-30")
            .await
            .unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].0, "333333333333");
        assert_eq!(result[0].1.patient_id, "patient-1");
    }

    #[tokio::test]
    async fn find_procedures_by_ssns_and_date_range_with_ssn_empty_returns_empty() {
        let repo = setup().await;
        let result = repo
            .find_procedures_by_ssns_and_date_range_with_ssn(&[], "2026-01-01", "2026-12-31")
            .await
            .unwrap();
        assert!(result.is_empty());
    }

    #[tokio::test]
    async fn find_procedures_by_ssns_and_date_range_with_ssn_excludes_already_reconciled() {
        let repo = setup().await;
        seed_patient(&repo.pool, "patient-1", "444444444444").await;
        repo.create_procedure(
            "patient-1".into(),
            None,
            "t1".into(),
            "2026-04-10".into(),
            Some(3000),
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::Created,
        )
        .await
        .unwrap();
        repo.create_procedure(
            "patient-1".into(),
            None,
            "t1".into(),
            "2026-04-15".into(),
            Some(5000),
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::Reconciled,
        )
        .await
        .unwrap();
        repo.create_procedure(
            "patient-1".into(),
            None,
            "t1".into(),
            "2026-04-20".into(),
            Some(7000),
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::PartiallyReconciled,
        )
        .await
        .unwrap();

        let ssns = vec!["444444444444".to_string()];
        let result = repo
            .find_procedures_by_ssns_and_date_range_with_ssn(&ssns, "2026-04-01", "2026-04-30")
            .await
            .unwrap();

        assert_eq!(result.len(), 1, "only the Created procedure should match");
        assert_eq!(result[0].1.billed_amount, Some(3000));
    }

    #[tokio::test]
    async fn find_procedure_exact_returns_match() {
        let repo = setup().await;
        let created = repo
            .create_procedure(
                "p1".into(),
                Some("fund-1".into()),
                "t1".into(),
                "2026-01-15".into(),
                Some(7500),
                PaymentMethod::None,
                None,
                None,
                None,
                ProcedureStatus::Created,
            )
            .await
            .unwrap();

        let result = repo
            .find_procedure_exact("p1", Some("fund-1"), "2026-01-15", 7500)
            .await
            .unwrap();
        assert!(result.is_some());
        assert_eq!(result.unwrap().id, created.id);
    }

    #[tokio::test]
    async fn find_procedure_exact_returns_none_when_no_match() {
        let repo = setup().await;
        let result = repo
            .find_procedure_exact("p1", None, "2026-01-15", 9999)
            .await
            .unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn find_unpaid_by_fund_returns_created_with_fund() {
        let repo = setup().await;
        // Created with fund → should appear
        repo.create_procedure(
            "p1".into(),
            Some("fund-1".into()),
            "t1".into(),
            "2026-01-10".into(),
            Some(5000),
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::Created,
        )
        .await
        .unwrap();
        // Created without fund → should NOT appear
        repo.create_procedure(
            "p2".into(),
            None,
            "t1".into(),
            "2026-01-11".into(),
            Some(5000),
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::Created,
        )
        .await
        .unwrap();

        let result = repo.find_unpaid_by_fund("fund-1").await.unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].patient_id, "p1");
    }

    #[tokio::test]
    async fn find_unreconciled_by_date_range_returns_created_not_in_group() {
        let repo = setup().await;
        seed_patient(&repo.pool, "patient-1", "444444444444").await;
        let created = repo
            .create_procedure(
                "patient-1".into(),
                None,
                "t1".into(),
                "2026-02-10".into(),
                Some(1000),
                PaymentMethod::None,
                None,
                None,
                None,
                ProcedureStatus::Created,
            )
            .await
            .unwrap();

        let result = repo
            .find_unreconciled_by_date_range("2026-02-01", "2026-02-28")
            .await
            .unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].procedure_id, created.id);
        assert_eq!(result[0].patient_ssn, Some("444444444444".to_string()));
    }

    #[tokio::test]
    async fn find_created_by_fund_before_date_returns_matching() {
        let repo = setup().await;
        // Created with fund-1, within date range
        repo.create_procedure(
            "p1".into(),
            Some("fund-1".into()),
            "t1".into(),
            "2026-01-10".into(),
            Some(1000),
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::Created,
        )
        .await
        .unwrap();
        // Created with fund-1, after cutoff → should not appear
        repo.create_procedure(
            "p2".into(),
            Some("fund-1".into()),
            "t1".into(),
            "2026-03-01".into(),
            Some(2000),
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::Created,
        )
        .await
        .unwrap();
        // Created with different fund → should not appear
        repo.create_procedure(
            "p3".into(),
            Some("fund-2".into()),
            "t1".into(),
            "2026-01-15".into(),
            Some(3000),
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::Created,
        )
        .await
        .unwrap();

        let result = repo
            .find_created_by_fund_before_date("fund-1", "2026-02-01")
            .await
            .unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].patient_id, "p1");
    }

    #[tokio::test]
    async fn payment_method_roundtrip_all_variants() {
        let repo = setup().await;
        let methods = vec![
            PaymentMethod::Cash,
            PaymentMethod::Check,
            PaymentMethod::BankCard,
            PaymentMethod::BankTransfer,
        ];
        for method in methods {
            let created = repo
                .create_procedure(
                    "p1".into(),
                    None,
                    "t1".into(),
                    "2026-01-15".into(),
                    Some(1000),
                    method,
                    None,
                    None,
                    None,
                    ProcedureStatus::Created,
                )
                .await
                .unwrap();
            let found = repo.read_procedure(&created.id).await.unwrap().unwrap();
            assert_eq!(found.payment_method, method);
            repo.delete_procedure(&created.id).await.unwrap();
        }
    }
}

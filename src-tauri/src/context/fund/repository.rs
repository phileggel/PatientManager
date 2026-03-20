use anyhow::{anyhow, Context};
use sqlx::SqlitePool;

use super::{
    AffiliatedFund, FundPaymentGroup, FundPaymentGroupStatus, FundPaymentLine,
    FundPaymentRepository,
};

/// Internal row type for affiliated fund database mapping
#[derive(sqlx::FromRow)]
pub struct FundRow {
    pub id: String,
    pub fund_identifier: String,
    pub name: String,
    pub is_deleted: i64,
}

// Conversion function from row type to domain object
impl From<FundRow> for AffiliatedFund {
    fn from(row: FundRow) -> Self {
        AffiliatedFund::restore(row.id, row.fund_identifier, row.name)
    }
}

/// AffiliatedFundRepository trait defines the contract for affiliated fund data access
///
/// Implementations of this trait handle persistence and retrieval of affiliated fund data.
/// The application layer uses this trait without knowing about concrete implementations (e.g., database).
#[async_trait::async_trait]
pub trait FundRepository: Send + Sync {
    async fn create_fund(
        &self,
        fund_identifier: &str,
        fund_name: &str,
    ) -> anyhow::Result<AffiliatedFund>;
    async fn read_all_funds(&self) -> anyhow::Result<Vec<AffiliatedFund>>;
    async fn read_fund(&self, id: &str) -> anyhow::Result<Option<AffiliatedFund>>;
    async fn update_fund(&self, fund: AffiliatedFund) -> anyhow::Result<AffiliatedFund>;
    async fn find_fund_by_identifier(
        &self,
        identifier: &str,
    ) -> anyhow::Result<Option<AffiliatedFund>>;
    async fn create_batch(&self, funds: Vec<AffiliatedFund>)
        -> anyhow::Result<Vec<AffiliatedFund>>;
    async fn delete_fund(&self, id: &str) -> anyhow::Result<()>;
}

pub struct SqliteFundRepository {
    pool: SqlitePool,
}

impl SqliteFundRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

#[async_trait::async_trait]
impl FundRepository for SqliteFundRepository {
    async fn create_fund(
        &self,
        fund_identifier: &str,
        fund_name: &str,
    ) -> anyhow::Result<AffiliatedFund> {
        // Domain layer creates and validates the fund
        let fund = AffiliatedFund::new(fund_identifier.to_string(), fund_name.to_string())?;

        tracing::trace!(fund_id = %fund.id, fund_identifier = %fund.fund_identifier, "Inserting affiliated fund into database");

        sqlx::query!(
            r#"
            INSERT INTO fund (id, fund_identifier, name, is_deleted)
            VALUES ($1, $2, $3, 0)
            "#,
            fund.id,
            fund.fund_identifier,
            fund.name,
        )
        .execute(&self.pool)
        .await
        .map_err(|e| {
            if is_unique_constraint_violation(&e, "fund_identifier") {
                anyhow!("Fund identifier already exists")
            } else {
                anyhow::Error::from(e)
            }
        })?;

        tracing::debug!(fund_id = %fund.id, "Affiliated fund inserted successfully");

        Ok(fund)
    }

    async fn read_all_funds(&self) -> anyhow::Result<Vec<AffiliatedFund>> {
        tracing::trace!("Fetching all affiliated funds from database");

        let rows = sqlx::query_as!(
            FundRow,
            r#"
            SELECT id, fund_identifier, name, is_deleted
            FROM fund
            WHERE is_deleted = 0
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(AffiliatedFund::from).collect())
    }

    async fn read_fund(&self, id: &str) -> anyhow::Result<Option<AffiliatedFund>> {
        tracing::trace!(fund_id = %id, "Fetching affiliated fund from database");

        let row = sqlx::query_as!(
            FundRow,
            r#"
            SELECT id, fund_identifier, name, is_deleted
            FROM fund
            WHERE id = $1 AND is_deleted = 0
            "#,
            id,
        )
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(AffiliatedFund::from))
    }

    async fn update_fund(&self, fund: AffiliatedFund) -> anyhow::Result<AffiliatedFund> {
        tracing::trace!(fund_identifier = %fund.fund_identifier, "Updating affiliated fund in database");

        sqlx::query!(
            r#"
            UPDATE fund
            SET fund_identifier = $1, name = $2
            WHERE id = $3
            "#,
            fund.fund_identifier,
            fund.name,
            fund.id,
        )
        .execute(&self.pool)
        .await
        .with_context(|| "Failed to update affiliated fund")?;

        tracing::trace!(fund_identifier = %fund.fund_identifier, "Affiliated fund updated successfully");
        Ok(fund.clone())
    }

    async fn find_fund_by_identifier(
        &self,
        identifier: &str,
    ) -> anyhow::Result<Option<AffiliatedFund>> {
        tracing::trace!(fund_identifier = %identifier, "Fetching affiliated fund by identifier from database");

        let row = sqlx::query_as!(
            FundRow,
            r#"
            SELECT id, fund_identifier, name, is_deleted
            FROM fund
            WHERE fund_identifier = $1 AND is_deleted = 0
            "#,
            identifier,
        )
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(AffiliatedFund::from))
    }

    async fn create_batch(
        &self,
        funds: Vec<AffiliatedFund>,
    ) -> anyhow::Result<Vec<AffiliatedFund>> {
        let mut tx = self.pool.begin().await?;

        let mut created_funds = Vec::new();

        for fund in funds {
            tracing::trace!(
                fund_id = %fund.id,
                fund_identifier = %fund.fund_identifier,
                "Inserting affiliated fund into database within transaction"
            );

            sqlx::query!(
                r#"
                INSERT INTO fund (id, fund_identifier, name, is_deleted)
                VALUES ($1, $2, $3, 0)
                "#,
                fund.id,
                fund.fund_identifier,
                fund.name,
            )
            .execute(&mut *tx)
            .await?;

            created_funds.push(fund);
        }

        tx.commit().await?;
        tracing::trace!(
            count = created_funds.len(),
            "Batch affiliated funds created successfully"
        );

        Ok(created_funds)
    }

    async fn delete_fund(&self, id: &str) -> anyhow::Result<()> {
        tracing::trace!(fund_id = %id, "Soft-deleting affiliated fund from database");

        sqlx::query!(r#"UPDATE fund SET is_deleted = 1 WHERE id = ?"#, id)
            .execute(&self.pool)
            .await
            .with_context(|| format!("Failed to soft-delete fund {}", id))?;

        tracing::trace!(fund_id = %id, "Affiliated fund soft-deleted successfully");
        Ok(())
    }
}

/// Helper function to check if an error is a UNIQUE constraint violation
fn is_unique_constraint_violation(error: &sqlx::Error, column: &str) -> bool {
    if let sqlx::Error::Database(db_err) = error {
        let msg = db_err.message();
        msg.contains("UNIQUE constraint failed") && msg.contains(column)
    } else {
        false
    }
}

// ============ Fund Payment Repository ============

/// Database row types for fund payment operations
#[derive(sqlx::FromRow)]
pub struct FundPaymentGroupRow {
    pub id: String,
    pub fund_id: String,
    pub payment_date: String,
    pub total_amount: i64,
    pub status: String,
}

fn parse_group_status(s: &str) -> FundPaymentGroupStatus {
    match s {
        "BANK_PAYED" => FundPaymentGroupStatus::BankPayed,
        _ => FundPaymentGroupStatus::Active,
    }
}

fn group_status_to_str(s: FundPaymentGroupStatus) -> &'static str {
    match s {
        FundPaymentGroupStatus::Active => "ACTIVE",
        FundPaymentGroupStatus::BankPayed => "BANK_PAYED",
    }
}

impl From<FundPaymentGroupRow> for FundPaymentGroup {
    fn from(row: FundPaymentGroupRow) -> Self {
        let status = parse_group_status(&row.status);
        FundPaymentGroup::restore(
            row.id,
            row.fund_id,
            row.payment_date,
            row.total_amount,
            Vec::new(), // Lines are fetched separately in repository
            status,
        )
    }
}

#[derive(sqlx::FromRow)]
pub struct FundPaymentLineRow {
    pub id: String,
    pub fund_payment_group_id: String,
    pub procedure_id: String,
}

impl From<FundPaymentLineRow> for FundPaymentLine {
    fn from(row: FundPaymentLineRow) -> Self {
        // Use restore (no validation, direct from database)
        FundPaymentLine::restore(row.id, row.fund_payment_group_id, row.procedure_id)
    }
}

pub struct SqliteFundPaymentRepository {
    pool: SqlitePool,
}

impl SqliteFundPaymentRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

#[async_trait::async_trait]
impl FundPaymentRepository for SqliteFundPaymentRepository {
    async fn create_group(
        &self,
        fund_id: String,
        payment_date: String,
        total_amount: i64,
        procedure_ids: Vec<String>,
    ) -> anyhow::Result<FundPaymentGroup> {
        // Create group first to get its ID, then create lines with the real group ID
        let group =
            FundPaymentGroup::new(fund_id.clone(), payment_date.clone(), total_amount, vec![])?;

        let mut lines = Vec::new();
        for procedure_id in procedure_ids {
            let line = FundPaymentLine::new(group.id.clone(), procedure_id)?;
            lines.push(line);
        }

        let group = FundPaymentGroup::with_id(
            group.id,
            fund_id.clone(),
            payment_date.clone(),
            total_amount,
            lines,
        )?;

        tracing::info!(
            group_id = %group.id,
            fund_id = %fund_id,
            total_amount = total_amount,
            line_count = group.lines.len(),
            "Creating fund payment group with lines (atomic)"
        );

        // Start transaction for atomic group + lines persistence
        let mut tx = self
            .pool
            .begin()
            .await
            .context("Failed to begin transaction")?;

        // Insert group
        let payment_date_str = group.payment_date.format("%Y-%m-%d").to_string();

        sqlx::query!(
            r#"
            INSERT INTO fund_payment_group (
                id, fund_id, payment_date, total_amount, status, is_deleted
            )
            VALUES ($1, $2, $3, $4, 'ACTIVE', 0)
            "#,
            group.id,
            group.fund_id,
            payment_date_str,
            group.total_amount,
        )
        .execute(&mut *tx)
        .await
        .context("Failed to insert fund payment group")?;

        // Insert lines
        for line in &group.lines {
            sqlx::query!(
                r#"
                INSERT INTO fund_payment_line (
                    id, fund_payment_group_id, procedure_id, is_deleted
                )
                VALUES ($1, $2, $3, 0)
                "#,
                line.id,
                line.fund_payment_group_id,
                line.procedure_id,
            )
            .execute(&mut *tx)
            .await
            .context("Failed to insert fund payment line")?;
        }

        tx.commit().await.context("Failed to commit transaction")?;

        tracing::trace!(
            group_id = %group.id,
            line_count = group.lines.len(),
            "Fund payment group with lines created successfully"
        );

        Ok(group)
    }

    async fn create_lines(
        &self,
        lines: Vec<FundPaymentLine>,
    ) -> anyhow::Result<Vec<FundPaymentLine>> {
        let mut tx = self
            .pool
            .begin()
            .await
            .context("Failed to begin transaction")?;

        for line in &lines {
            sqlx::query!(
                r#"
                INSERT INTO fund_payment_line (
                    id, fund_payment_group_id, procedure_id, is_deleted
                )
                VALUES ($1, $2, $3, 0)
                "#,
                line.id,
                line.fund_payment_group_id,
                line.procedure_id,
            )
            .execute(&mut *tx)
            .await
            .context("Failed to insert fund payment line")?;
        }

        tx.commit().await.context("Failed to commit transaction")?;

        Ok(lines)
    }

    async fn create_batch_groups(
        &self,
        groups: Vec<FundPaymentGroup>,
    ) -> anyhow::Result<Vec<FundPaymentGroup>> {
        if groups.is_empty() {
            return Ok(Vec::new());
        }

        tracing::info!(
            count = groups.len(),
            "Creating batch of fund payment groups with all lines (atomic)"
        );

        // Start single transaction for all groups and lines
        let mut tx = self
            .pool
            .begin()
            .await
            .context("Failed to begin transaction")?;

        // Insert all groups and their lines
        for group in &groups {
            let payment_date_str = group.payment_date.format("%Y-%m-%d").to_string();

            // Insert group
            sqlx::query!(
                r#"
                INSERT INTO fund_payment_group (
                    id, fund_id, payment_date, total_amount, status, is_deleted
                )
                VALUES ($1, $2, $3, $4, 'ACTIVE', 0)
                "#,
                group.id,
                group.fund_id,
                payment_date_str,
                group.total_amount,
            )
            .execute(&mut *tx)
            .await
            .context("Failed to insert fund payment group")?;

            // Insert all lines for this group
            for line in &group.lines {
                sqlx::query!(
                    r#"
                    INSERT INTO fund_payment_line (
                        id, fund_payment_group_id, procedure_id, is_deleted
                    )
                    VALUES ($1, $2, $3, 0)
                    "#,
                    line.id,
                    line.fund_payment_group_id,
                    line.procedure_id,
                )
                .execute(&mut *tx)
                .await
                .context("Failed to insert fund payment line")?;
            }
        }

        tx.commit()
            .await
            .context("Failed to commit batch transaction")?;

        tracing::info!(
            count = groups.len(),
            "Batch fund payment groups with lines created successfully"
        );

        Ok(groups)
    }

    async fn read_group(&self, id: &str) -> anyhow::Result<Option<FundPaymentGroup>> {
        tracing::trace!(group_id = %id, "Fetching fund payment group from database");

        let group_row = sqlx::query_as!(
            FundPaymentGroupRow,
            r#"
            SELECT id, fund_id, payment_date, total_amount, status
            FROM fund_payment_group
            WHERE id = $1 AND is_deleted = 0
            "#,
            id,
        )
        .fetch_optional(&self.pool)
        .await?;

        if let Some(row) = group_row {
            let lines = sqlx::query_as!(
                FundPaymentLineRow,
                r#"
                SELECT id, fund_payment_group_id, procedure_id
                FROM fund_payment_line
                WHERE fund_payment_group_id = $1 AND is_deleted = 0
                "#,
                id,
            )
            .fetch_all(&self.pool)
            .await?;

            let mut group = FundPaymentGroup::from(row);
            group.lines = lines.into_iter().map(FundPaymentLine::from).collect();

            Ok(Some(group))
        } else {
            Ok(None)
        }
    }

    async fn read_lines_by_group(&self, group_id: &str) -> anyhow::Result<Vec<FundPaymentLine>> {
        tracing::trace!(group_id = %group_id, "Fetching fund payment lines for group");

        let rows = sqlx::query_as!(
            FundPaymentLineRow,
            r#"
            SELECT id, fund_payment_group_id, procedure_id
            FROM fund_payment_line
            WHERE fund_payment_group_id = $1 AND is_deleted = 0
            "#,
            group_id,
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(FundPaymentLine::from).collect())
    }

    async fn read_all_groups(&self) -> anyhow::Result<Vec<FundPaymentGroup>> {
        tracing::trace!("Fetching all fund payment groups from database");

        let group_rows = sqlx::query_as!(
            FundPaymentGroupRow,
            r#"
            SELECT id, fund_id, payment_date, total_amount, status
            FROM fund_payment_group
            WHERE is_deleted = 0
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        let mut groups = Vec::new();

        for row in group_rows {
            let lines = sqlx::query_as!(
                FundPaymentLineRow,
                r#"
                SELECT id, fund_payment_group_id, procedure_id
                FROM fund_payment_line
                WHERE fund_payment_group_id = $1 AND is_deleted = 0
                "#,
                row.id,
            )
            .fetch_all(&self.pool)
            .await?;

            let mut group = FundPaymentGroup::from(row);
            group.lines = lines.into_iter().map(FundPaymentLine::from).collect();

            groups.push(group);
        }

        Ok(groups)
    }

    async fn update_group(&self, group: FundPaymentGroup) -> anyhow::Result<FundPaymentGroup> {
        tracing::trace!(group_id = %group.id, "Updating fund payment group in database");

        let payment_date_str = group.payment_date.format("%Y-%m-%d").to_string();

        sqlx::query!(
            r#"
            UPDATE fund_payment_group
            SET payment_date = $1, total_amount = $2
            WHERE id = $3
            "#,
            payment_date_str,
            group.total_amount,
            group.id,
        )
        .execute(&self.pool)
        .await
        .with_context(|| "Failed to update fund payment group")?;

        tracing::trace!(group_id = %group.id, "Fund payment group updated successfully");
        Ok(group)
    }

    async fn update_group_status(
        &self,
        group_id: &str,
        status: FundPaymentGroupStatus,
    ) -> anyhow::Result<()> {
        let status_str = group_status_to_str(status);
        tracing::info!(group_id = %group_id, status = %status_str, "Updating fund payment group status");

        sqlx::query!(
            r#"UPDATE fund_payment_group SET status = ? WHERE id = ?"#,
            status_str,
            group_id,
        )
        .execute(&self.pool)
        .await
        .with_context(|| {
            format!(
                "Failed to update status for fund payment group {}",
                group_id
            )
        })?;

        Ok(())
    }

    async fn delete_lines_by_group(&self, group_id: &str) -> anyhow::Result<()> {
        tracing::trace!(group_id = %group_id, "Soft-deleting fund payment lines");

        sqlx::query!(
            r#"UPDATE fund_payment_line SET is_deleted = 1 WHERE fund_payment_group_id = ?"#,
            group_id
        )
        .execute(&self.pool)
        .await
        .with_context(|| "Failed to delete fund payment lines")?;

        Ok(())
    }

    async fn delete_group(&self, group_id: &str) -> anyhow::Result<()> {
        tracing::trace!(group_id = %group_id, "Soft-deleting fund payment group");

        sqlx::query!(
            r#"UPDATE fund_payment_group SET is_deleted = 1 WHERE id = ?"#,
            group_id
        )
        .execute(&self.pool)
        .await
        .with_context(|| format!("Failed to soft-delete fund payment group {}", group_id))?;

        Ok(())
    }

    async fn exists_group(
        &self,
        fund_id: &str,
        payment_date: &str,
        total_amount: i64,
    ) -> anyhow::Result<bool> {
        let count = sqlx::query_scalar!(
            r#"
            SELECT COUNT(*) as "count: i32"
            FROM fund_payment_group
            WHERE fund_id = $1 AND payment_date = $2 AND total_amount = $3 AND is_deleted = 0
            "#,
            fund_id,
            payment_date,
            total_amount,
        )
        .fetch_one(&self.pool)
        .await?;

        Ok(count > 0)
    }
}

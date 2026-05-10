use anyhow::{anyhow, Context};
use sqlx::SqlitePool;

use super::{
    Fund, FundPaymentGroup, FundPaymentGroupStatus, FundPaymentLine, FundPaymentRepository,
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
impl From<FundRow> for Fund {
    fn from(row: FundRow) -> Self {
        Fund::restore(row.id, row.fund_identifier, row.name)
    }
}

/// AffiliatedFundRepository trait defines the contract for affiliated fund data access
///
/// Implementations of this trait handle persistence and retrieval of affiliated fund data.
/// The application layer uses this trait without knowing about concrete implementations (e.g., database).
#[cfg_attr(test, mockall::automock)]
#[async_trait::async_trait]
pub trait FundRepository: Send + Sync {
    async fn create_fund(&self, fund_identifier: &str, fund_name: &str) -> anyhow::Result<Fund>;
    async fn read_all_funds(&self) -> anyhow::Result<Vec<Fund>>;
    async fn read_fund(&self, id: &str) -> anyhow::Result<Option<Fund>>;
    async fn update_fund(&self, fund: Fund) -> anyhow::Result<Fund>;
    async fn find_fund_by_identifier(&self, identifier: &str) -> anyhow::Result<Option<Fund>>;
    async fn create_batch(&self, funds: Vec<Fund>) -> anyhow::Result<Vec<Fund>>;
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
    async fn create_fund(&self, fund_identifier: &str, fund_name: &str) -> anyhow::Result<Fund> {
        // Domain layer creates and validates the fund
        let fund = Fund::new(fund_identifier.to_string(), fund_name.to_string())?;

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

    async fn read_all_funds(&self) -> anyhow::Result<Vec<Fund>> {
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

        Ok(rows.into_iter().map(Fund::from).collect())
    }

    async fn read_fund(&self, id: &str) -> anyhow::Result<Option<Fund>> {
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

        Ok(row.map(Fund::from))
    }

    async fn update_fund(&self, fund: Fund) -> anyhow::Result<Fund> {
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

    async fn find_fund_by_identifier(&self, identifier: &str) -> anyhow::Result<Option<Fund>> {
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

        Ok(row.map(Fund::from))
    }

    async fn create_batch(&self, funds: Vec<Fund>) -> anyhow::Result<Vec<Fund>> {
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
        "BANK_PAYED" => FundPaymentGroupStatus::BankPaid,
        _ => FundPaymentGroupStatus::Active,
    }
}

fn group_status_to_str(s: FundPaymentGroupStatus) -> &'static str {
    match s {
        FundPaymentGroupStatus::Active => "ACTIVE",
        FundPaymentGroupStatus::BankPaid => "BANK_PAYED",
    }
}

impl TryFrom<FundPaymentGroupRow> for FundPaymentGroup {
    type Error = anyhow::Error;

    fn try_from(row: FundPaymentGroupRow) -> anyhow::Result<Self> {
        let status = parse_group_status(&row.status);
        let payment_date = chrono::NaiveDate::parse_from_str(&row.payment_date, "%Y-%m-%d")
            .with_context(|| format!("Invalid payment_date in DB: {}", row.payment_date))?;
        Ok(FundPaymentGroup::restore(
            row.id,
            row.fund_id,
            payment_date,
            row.total_amount,
            Vec::new(), // Lines are fetched separately in repository
            status,
        ))
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

            let mut group = FundPaymentGroup::try_from(row)?;
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

            let mut group = FundPaymentGroup::try_from(row)?;
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

    /// Persist a fully-constructed FundPaymentGroup with its lines, preserving status/is_locked.
    /// Used for overpayment refund groups (BankPaid status + negative amount, REF-100).
    async fn persist_group(&self, group: FundPaymentGroup) -> anyhow::Result<FundPaymentGroup> {
        let payment_date_str = group.payment_date.format("%Y-%m-%d").to_string();
        let status_str = match group.status {
            crate::context::fund::FundPaymentGroupStatus::Active => "ACTIVE",
            crate::context::fund::FundPaymentGroupStatus::BankPaid => "BANK_PAYED",
        };

        tracing::info!(
            group_id = %group.id,
            fund_id = %group.fund_id,
            total_amount = group.total_amount,
            status = %status_str,
            line_count = group.lines.len(),
            "Persisting fund payment group (bypass validation)"
        );

        let mut tx = self
            .pool
            .begin()
            .await
            .context("Failed to begin transaction")?;

        sqlx::query!(
            r#"
            INSERT INTO fund_payment_group (
                id, fund_id, payment_date, total_amount, status, is_deleted
            )
            VALUES ($1, $2, $3, $4, $5, 0)
            "#,
            group.id,
            group.fund_id,
            payment_date_str,
            group.total_amount,
            status_str,
        )
        .execute(&mut *tx)
        .await
        .context("Failed to insert fund payment group")?;

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

        Ok(group)
    }
}

#[cfg(test)]
mod tests {
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

    use super::*;

    async fn make_pool() -> sqlx::SqlitePool {
        let opts = SqliteConnectOptions::new()
            .in_memory(true)
            .foreign_keys(false);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(opts)
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    async fn setup_fund_repo() -> SqliteFundRepository {
        SqliteFundRepository {
            pool: make_pool().await,
        }
    }

    async fn setup_payment_repos() -> (SqliteFundRepository, SqliteFundPaymentRepository) {
        let pool = make_pool().await;
        (
            SqliteFundRepository { pool: pool.clone() },
            SqliteFundPaymentRepository { pool },
        )
    }

    // --- SqliteFundRepository ---

    #[tokio::test]
    async fn create_and_read_fund() {
        let repo = setup_fund_repo().await;
        let fund = repo.create_fund("75", "CPAM 75").await.unwrap();
        assert!(!fund.id.is_empty());

        let found = repo.read_fund(&fund.id).await.unwrap().unwrap();
        assert_eq!(found.fund_identifier, "75");
        assert_eq!(found.name, "CPAM 75");
    }

    #[tokio::test]
    async fn read_fund_returns_none_for_unknown_id() {
        let repo = setup_fund_repo().await;
        assert!(repo.read_fund("no-such-id").await.unwrap().is_none());
    }

    #[tokio::test]
    async fn read_all_funds_returns_all_active() {
        let repo = setup_fund_repo().await;
        repo.create_fund("75", "CPAM 75").await.unwrap();
        repo.create_fund("59", "CPAM 59").await.unwrap();
        let all = repo.read_all_funds().await.unwrap();
        assert_eq!(all.len(), 2);
    }

    #[tokio::test]
    async fn create_fund_rejects_duplicate_identifier() {
        let repo = setup_fund_repo().await;
        repo.create_fund("75", "CPAM 75").await.unwrap();
        let err = repo.create_fund("75", "CPAM 75 bis").await.unwrap_err();
        assert!(err.to_string().contains("already exists"));
    }

    #[tokio::test]
    async fn update_fund_persists_name_change() {
        let repo = setup_fund_repo().await;
        let fund = repo.create_fund("75", "CPAM 75").await.unwrap();
        let updated =
            Fund::with_id(fund.id.clone(), "75".to_string(), "CPAM Paris".to_string()).unwrap();
        repo.update_fund(updated).await.unwrap();

        let read = repo.read_fund(&fund.id).await.unwrap().unwrap();
        assert_eq!(read.name, "CPAM Paris");
    }

    #[tokio::test]
    async fn find_fund_by_identifier_returns_match() {
        let repo = setup_fund_repo().await;
        repo.create_fund("75", "CPAM 75").await.unwrap();

        let found = repo.find_fund_by_identifier("75").await.unwrap().unwrap();
        assert_eq!(found.name, "CPAM 75");
    }

    #[tokio::test]
    async fn find_fund_by_identifier_returns_none_when_absent() {
        let repo = setup_fund_repo().await;
        assert!(repo
            .find_fund_by_identifier("no-such")
            .await
            .unwrap()
            .is_none());
    }

    #[tokio::test]
    async fn delete_fund_soft_deletes() {
        let repo = setup_fund_repo().await;
        let fund = repo.create_fund("75", "CPAM 75").await.unwrap();
        repo.delete_fund(&fund.id).await.unwrap();

        assert!(repo.read_fund(&fund.id).await.unwrap().is_none());
        assert!(repo.read_all_funds().await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn create_batch_inserts_all_funds() {
        let repo = setup_fund_repo().await;
        let funds = vec![
            Fund::new("A".to_string(), "Fund A".to_string()).unwrap(),
            Fund::new("B".to_string(), "Fund B".to_string()).unwrap(),
        ];
        let created = repo.create_batch(funds).await.unwrap();
        assert_eq!(created.len(), 2);
        assert_eq!(repo.read_all_funds().await.unwrap().len(), 2);
    }

    // --- SqliteFundPaymentRepository ---

    #[tokio::test]
    async fn create_group_and_read_group() {
        let (fund_repo, payment_repo) = setup_payment_repos().await;
        let fund = fund_repo.create_fund("75", "CPAM 75").await.unwrap();

        let group = payment_repo
            .create_group(fund.id.clone(), "2026-01-15".to_string(), 10000, vec![])
            .await
            .unwrap();

        assert!(!group.id.is_empty());
        let read = payment_repo.read_group(&group.id).await.unwrap().unwrap();
        assert_eq!(read.fund_id, fund.id);
        assert_eq!(read.total_amount, 10000);
        assert_eq!(read.status, FundPaymentGroupStatus::Active);
    }

    #[tokio::test]
    async fn read_group_returns_none_for_unknown_id() {
        let (_, payment_repo) = setup_payment_repos().await;
        assert!(payment_repo
            .read_group("no-such-id")
            .await
            .unwrap()
            .is_none());
    }

    #[tokio::test]
    async fn read_all_groups_returns_all_active() {
        let (fund_repo, payment_repo) = setup_payment_repos().await;
        let fund = fund_repo.create_fund("75", "CPAM 75").await.unwrap();

        payment_repo
            .create_group(fund.id.clone(), "2026-01-15".to_string(), 10000, vec![])
            .await
            .unwrap();
        payment_repo
            .create_group(fund.id.clone(), "2026-02-15".to_string(), 20000, vec![])
            .await
            .unwrap();

        assert_eq!(payment_repo.read_all_groups().await.unwrap().len(), 2);
    }

    #[tokio::test]
    async fn read_lines_by_group_returns_empty_when_no_lines() {
        let (fund_repo, payment_repo) = setup_payment_repos().await;
        let fund = fund_repo.create_fund("75", "CPAM 75").await.unwrap();
        let group = payment_repo
            .create_group(fund.id.clone(), "2026-01-15".to_string(), 10000, vec![])
            .await
            .unwrap();

        let lines = payment_repo.read_lines_by_group(&group.id).await.unwrap();
        assert!(lines.is_empty());
    }

    #[tokio::test]
    async fn update_group_persists_changes() {
        let (fund_repo, payment_repo) = setup_payment_repos().await;
        let fund = fund_repo.create_fund("75", "CPAM 75").await.unwrap();
        let group = payment_repo
            .create_group(fund.id.clone(), "2026-01-15".to_string(), 10000, vec![])
            .await
            .unwrap();

        let updated = FundPaymentGroup::with_id(
            group.id.clone(),
            fund.id.clone(),
            "2026-01-20".to_string(),
            20000,
            vec![],
        )
        .unwrap();
        payment_repo.update_group(updated).await.unwrap();

        let read = payment_repo.read_group(&group.id).await.unwrap().unwrap();
        assert_eq!(read.total_amount, 20000);
    }

    #[tokio::test]
    async fn update_group_status_to_bank_paid() {
        let (fund_repo, payment_repo) = setup_payment_repos().await;
        let fund = fund_repo.create_fund("75", "CPAM 75").await.unwrap();
        let group = payment_repo
            .create_group(fund.id.clone(), "2026-01-15".to_string(), 10000, vec![])
            .await
            .unwrap();

        payment_repo
            .update_group_status(&group.id, FundPaymentGroupStatus::BankPaid)
            .await
            .unwrap();

        let read = payment_repo.read_group(&group.id).await.unwrap().unwrap();
        assert_eq!(read.status, FundPaymentGroupStatus::BankPaid);
        assert!(read.is_locked);
    }

    #[tokio::test]
    async fn delete_group_soft_deletes() {
        let (fund_repo, payment_repo) = setup_payment_repos().await;
        let fund = fund_repo.create_fund("75", "CPAM 75").await.unwrap();
        let group = payment_repo
            .create_group(fund.id.clone(), "2026-01-15".to_string(), 10000, vec![])
            .await
            .unwrap();

        payment_repo.delete_group(&group.id).await.unwrap();
        assert!(payment_repo.read_group(&group.id).await.unwrap().is_none());
        assert!(payment_repo.read_all_groups().await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn exists_group_returns_true_when_matching() {
        let (fund_repo, payment_repo) = setup_payment_repos().await;
        let fund = fund_repo.create_fund("75", "CPAM 75").await.unwrap();
        payment_repo
            .create_group(fund.id.clone(), "2026-01-15".to_string(), 10000, vec![])
            .await
            .unwrap();

        assert!(payment_repo
            .exists_group(&fund.id, "2026-01-15", 10000)
            .await
            .unwrap());
    }

    #[tokio::test]
    async fn exists_group_returns_false_when_absent() {
        let (fund_repo, payment_repo) = setup_payment_repos().await;
        let fund = fund_repo.create_fund("75", "CPAM 75").await.unwrap();

        assert!(!payment_repo
            .exists_group(&fund.id, "2026-01-15", 10000)
            .await
            .unwrap());
    }

    #[tokio::test]
    async fn persist_group_stores_bank_paid_status() {
        let (fund_repo, payment_repo) = setup_payment_repos().await;
        let fund = fund_repo.create_fund("75", "CPAM 75").await.unwrap();

        let group = FundPaymentGroup::restore(
            "refund-group-1".to_string(),
            fund.id.clone(),
            chrono::NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
            -5000,
            vec![],
            FundPaymentGroupStatus::BankPaid,
        );

        let stored = payment_repo.persist_group(group).await.unwrap();
        let read = payment_repo.read_group(&stored.id).await.unwrap().unwrap();
        assert_eq!(read.status, FundPaymentGroupStatus::BankPaid);
        assert!(read.is_locked);
    }

    #[tokio::test]
    async fn create_batch_groups_inserts_all() {
        let (fund_repo, payment_repo) = setup_payment_repos().await;
        let fund = fund_repo.create_fund("75", "CPAM 75").await.unwrap();

        let groups = vec![
            FundPaymentGroup::new(fund.id.clone(), "2026-01-15".to_string(), 10000, vec![])
                .unwrap(),
            FundPaymentGroup::new(fund.id.clone(), "2026-02-15".to_string(), 20000, vec![])
                .unwrap(),
        ];
        let created = payment_repo.create_batch_groups(groups).await.unwrap();
        assert_eq!(created.len(), 2);
        assert_eq!(payment_repo.read_all_groups().await.unwrap().len(), 2);
    }

    #[tokio::test]
    async fn create_group_with_procedure_lines_reads_back() {
        let (fund_repo, payment_repo) = setup_payment_repos().await;
        let fund = fund_repo.create_fund("75", "CPAM 75").await.unwrap();

        let group = payment_repo
            .create_group(
                fund.id.clone(),
                "2026-01-15".to_string(),
                10000,
                vec!["proc-1".to_string(), "proc-2".to_string()],
            )
            .await
            .unwrap();

        assert_eq!(group.lines.len(), 2);
        let lines = payment_repo.read_lines_by_group(&group.id).await.unwrap();
        assert_eq!(lines.len(), 2);
    }

    #[tokio::test]
    async fn create_lines_inserts_and_returns() {
        let (fund_repo, payment_repo) = setup_payment_repos().await;
        let fund = fund_repo.create_fund("75", "CPAM 75").await.unwrap();
        let group = payment_repo
            .create_group(fund.id.clone(), "2026-01-15".to_string(), 10000, vec![])
            .await
            .unwrap();

        let new_lines =
            vec![FundPaymentLine::new(group.id.clone(), "proc-99".to_string()).unwrap()];
        let created = payment_repo.create_lines(new_lines).await.unwrap();
        assert_eq!(created.len(), 1);

        let lines = payment_repo.read_lines_by_group(&group.id).await.unwrap();
        assert_eq!(lines.len(), 1);
    }

    #[tokio::test]
    async fn delete_lines_by_group_removes_all_lines() {
        let (fund_repo, payment_repo) = setup_payment_repos().await;
        let fund = fund_repo.create_fund("75", "CPAM 75").await.unwrap();
        let group = payment_repo
            .create_group(
                fund.id.clone(),
                "2026-01-15".to_string(),
                10000,
                vec!["proc-a".to_string(), "proc-b".to_string()],
            )
            .await
            .unwrap();

        payment_repo.delete_lines_by_group(&group.id).await.unwrap();

        let lines = payment_repo.read_lines_by_group(&group.id).await.unwrap();
        assert!(lines.is_empty());
    }

    #[tokio::test]
    async fn create_batch_groups_with_lines_reads_back() {
        let (fund_repo, payment_repo) = setup_payment_repos().await;
        let fund = fund_repo.create_fund("75", "CPAM 75").await.unwrap();

        let mut g1 =
            FundPaymentGroup::new(fund.id.clone(), "2026-01-15".to_string(), 10000, vec![])
                .unwrap();
        g1.lines = vec![FundPaymentLine::new(g1.id.clone(), "proc-x".to_string()).unwrap()];

        let created = payment_repo.create_batch_groups(vec![g1]).await.unwrap();
        assert_eq!(created.len(), 1);

        let lines = payment_repo
            .read_lines_by_group(&created[0].id)
            .await
            .unwrap();
        assert_eq!(lines.len(), 1);
    }
}

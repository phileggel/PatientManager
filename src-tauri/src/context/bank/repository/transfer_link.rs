use anyhow::Context;
use sqlx::SqlitePool;
use uuid::Uuid;

/// Repository for junction tables linking bank transfers to fund groups and procedures.
/// Operates on IDs only — no cross-context domain objects.
#[async_trait::async_trait]
pub trait BankTransferLinkRepository: Send + Sync {
    /// Link a bank transfer to one or more fund payment groups
    async fn link_fund_groups(
        &self,
        bank_transfer_id: &str,
        group_ids: &[String],
    ) -> anyhow::Result<()>;

    /// Get fund payment group IDs linked to a bank transfer
    async fn get_fund_group_ids(&self, bank_transfer_id: &str) -> anyhow::Result<Vec<String>>;

    /// Remove all fund group links for a bank transfer
    async fn unlink_all_fund_groups(&self, bank_transfer_id: &str) -> anyhow::Result<()>;

    /// Get the bank transfer ID linked to a fund payment group (if any)
    async fn get_transfer_for_fund_group(
        &self,
        fund_payment_group_id: &str,
    ) -> anyhow::Result<Option<String>>;

    /// Link a bank transfer to one or more procedures
    async fn link_procedures(
        &self,
        bank_transfer_id: &str,
        procedure_ids: &[String],
    ) -> anyhow::Result<()>;

    /// Get procedure IDs linked to a bank transfer
    async fn get_procedure_ids(&self, bank_transfer_id: &str) -> anyhow::Result<Vec<String>>;

    /// Remove all procedure links for a bank transfer
    async fn unlink_all_procedures(&self, bank_transfer_id: &str) -> anyhow::Result<()>;
}

pub struct SqliteBankTransferLinkRepository {
    pool: SqlitePool,
}

impl SqliteBankTransferLinkRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

#[async_trait::async_trait]
impl BankTransferLinkRepository for SqliteBankTransferLinkRepository {
    async fn link_fund_groups(
        &self,
        bank_transfer_id: &str,
        group_ids: &[String],
    ) -> anyhow::Result<()> {
        for group_id in group_ids {
            let id = Uuid::new_v4().to_string();
            sqlx::query!(
                r#"
                INSERT INTO bank_transfer_fund_group_link (id, bank_transfer_id, fund_payment_group_id)
                VALUES ($1, $2, $3)
                "#,
                id,
                bank_transfer_id,
                group_id,
            )
            .execute(&self.pool)
            .await
            .context("Failed to insert bank_transfer_fund_group_link")?;
        }
        Ok(())
    }

    async fn get_fund_group_ids(&self, bank_transfer_id: &str) -> anyhow::Result<Vec<String>> {
        let rows = sqlx::query!(
            r#"
            SELECT fund_payment_group_id
            FROM bank_transfer_fund_group_link
            WHERE bank_transfer_id = $1
            "#,
            bank_transfer_id,
        )
        .fetch_all(&self.pool)
        .await
        .context("Failed to read fund group links")?;

        Ok(rows.into_iter().map(|r| r.fund_payment_group_id).collect())
    }

    async fn unlink_all_fund_groups(&self, bank_transfer_id: &str) -> anyhow::Result<()> {
        sqlx::query!(
            r#"DELETE FROM bank_transfer_fund_group_link WHERE bank_transfer_id = ?"#,
            bank_transfer_id,
        )
        .execute(&self.pool)
        .await
        .context("Failed to delete fund group links")?;
        Ok(())
    }

    async fn get_transfer_for_fund_group(
        &self,
        fund_payment_group_id: &str,
    ) -> anyhow::Result<Option<String>> {
        let row = sqlx::query!(
            r#"
            SELECT bank_transfer_id
            FROM bank_transfer_fund_group_link
            WHERE fund_payment_group_id = $1
            LIMIT 1
            "#,
            fund_payment_group_id,
        )
        .fetch_optional(&self.pool)
        .await
        .context("Failed to read transfer for fund group")?;

        Ok(row.map(|r| r.bank_transfer_id))
    }

    async fn link_procedures(
        &self,
        bank_transfer_id: &str,
        procedure_ids: &[String],
    ) -> anyhow::Result<()> {
        for procedure_id in procedure_ids {
            let id = Uuid::new_v4().to_string();
            sqlx::query!(
                r#"
                INSERT INTO bank_transfer_procedure_link (id, bank_transfer_id, procedure_id)
                VALUES ($1, $2, $3)
                "#,
                id,
                bank_transfer_id,
                procedure_id,
            )
            .execute(&self.pool)
            .await
            .context("Failed to insert bank_transfer_procedure_link")?;
        }
        Ok(())
    }

    async fn get_procedure_ids(&self, bank_transfer_id: &str) -> anyhow::Result<Vec<String>> {
        let rows = sqlx::query!(
            r#"
            SELECT procedure_id
            FROM bank_transfer_procedure_link
            WHERE bank_transfer_id = $1
            "#,
            bank_transfer_id,
        )
        .fetch_all(&self.pool)
        .await
        .context("Failed to read procedure links")?;

        Ok(rows.into_iter().map(|r| r.procedure_id).collect())
    }

    async fn unlink_all_procedures(&self, bank_transfer_id: &str) -> anyhow::Result<()> {
        sqlx::query!(
            r#"DELETE FROM bank_transfer_procedure_link WHERE bank_transfer_id = ?"#,
            bank_transfer_id,
        )
        .execute(&self.pool)
        .await
        .context("Failed to delete procedure links")?;
        Ok(())
    }
}

use anyhow::Context;
use serde::{Deserialize, Serialize};
use specta::Type;
use sqlx::SqlitePool;
use uuid::Uuid;

/// A mapping between a bank label (as seen on statements) and a fund
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct BankFundLabelMapping {
    pub id: String,
    pub bank_account_id: String,
    pub bank_label: String,
    pub fund_id: Option<String>,
}

/// Repository trait for bank fund label mappings
#[async_trait::async_trait]
pub trait BankFundLabelMappingRepository: Send + Sync {
    /// Find all active mappings for a bank account
    async fn find_mappings_for_account(
        &self,
        bank_account_id: &str,
    ) -> anyhow::Result<Vec<BankFundLabelMapping>>;

    /// Save a new mapping (or update if label already mapped for this account)
    async fn save_mapping(
        &self,
        bank_account_id: &str,
        bank_label: &str,
        fund_id: &str,
    ) -> anyhow::Result<BankFundLabelMapping>;
}

pub struct SqliteBankFundLabelMappingRepository {
    pool: SqlitePool,
}

impl SqliteBankFundLabelMappingRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

#[async_trait::async_trait]
impl BankFundLabelMappingRepository for SqliteBankFundLabelMappingRepository {
    async fn find_mappings_for_account(
        &self,
        bank_account_id: &str,
    ) -> anyhow::Result<Vec<BankFundLabelMapping>> {
        let rows = sqlx::query!(
            r#"
            SELECT id, bank_account_id, bank_label, fund_id
            FROM bank_fund_label_mapping
            WHERE bank_account_id = $1 AND is_deleted = 0
            "#,
            bank_account_id,
        )
        .fetch_all(&self.pool)
        .await
        .context("Failed to fetch label mappings")?;

        Ok(rows
            .into_iter()
            .map(|r| BankFundLabelMapping {
                id: r.id,
                bank_account_id: r.bank_account_id,
                bank_label: r.bank_label,
                fund_id: r.fund_id,
            })
            .collect())
    }

    async fn save_mapping(
        &self,
        bank_account_id: &str,
        bank_label: &str,
        fund_id: &str,
    ) -> anyhow::Result<BankFundLabelMapping> {
        // Map "REJECTED" to NULL for database
        let db_fund_id = if fund_id == "REJECTED" {
            None
        } else {
            Some(fund_id.to_string())
        };

        // Check if mapping already exists for this account+label
        let existing = sqlx::query!(
            r#"
            SELECT id FROM bank_fund_label_mapping
            WHERE bank_account_id = $1 AND bank_label = $2 AND is_deleted = 0
            "#,
            bank_account_id,
            bank_label,
        )
        .fetch_optional(&self.pool)
        .await
        .context("Failed to check existing mapping")?;

        if let Some(row) = existing {
            // Update existing mapping
            sqlx::query!(
                r#"
                UPDATE bank_fund_label_mapping
                SET fund_id = $1
                WHERE id = $2
                "#,
                db_fund_id,
                row.id,
            )
            .execute(&self.pool)
            .await
            .context("Failed to update label mapping")?;

            Ok(BankFundLabelMapping {
                id: row.id,
                bank_account_id: bank_account_id.to_string(),
                bank_label: bank_label.to_string(),
                fund_id: db_fund_id,
            })
        } else {
            // Create new mapping
            let id = Uuid::new_v4().to_string();
            sqlx::query!(
                r#"
                INSERT INTO bank_fund_label_mapping (id, bank_account_id, bank_label, fund_id, is_deleted)
                VALUES ($1, $2, $3, $4, 0)
                "#,
                id,
                bank_account_id,
                bank_label,
                db_fund_id,
            )
            .execute(&self.pool)
            .await
            .context("Failed to insert label mapping")?;

            Ok(BankFundLabelMapping {
                id,
                bank_account_id: bank_account_id.to_string(),
                bank_label: bank_label.to_string(),
                fund_id: db_fund_id,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use sqlx::sqlite::SqlitePoolOptions;

    use super::*;

    async fn setup_test_repo() -> (SqliteBankFundLabelMappingRepository, SqlitePool) {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("Failed to connect to in-memory database");

        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("Failed to run migrations");

        let repo = SqliteBankFundLabelMappingRepository::new(pool.clone());
        (repo, pool)
    }

    async fn create_test_bank_account(pool: &SqlitePool) -> String {
        let id = Uuid::new_v4().to_string();
        sqlx::query!(
            "INSERT INTO bank_account (id, name, is_deleted) VALUES ($1, 'Test Account', 0)",
            id,
        )
        .execute(pool)
        .await
        .expect("Failed to create test bank account");
        id
    }

    async fn create_test_fund(pool: &SqlitePool) -> String {
        let id = Uuid::new_v4().to_string();
        sqlx::query!(
            "INSERT INTO fund (id, fund_identifier, name, is_deleted) VALUES ($1, '93', 'CPAM 93', 0)",
            id,
        )
        .execute(pool)
        .await
        .expect("Failed to create test fund");
        id
    }

    #[tokio::test]
    async fn test_save_and_find_mapping() {
        let (repo, pool) = setup_test_repo().await;
        let account_id = create_test_bank_account(&pool).await;
        let fund_id = create_test_fund(&pool).await;

        let mapping = repo
            .save_mapping(&account_id, "CPAM93", &fund_id)
            .await
            .unwrap();
        assert_eq!(mapping.bank_label, "CPAM93");
        assert_eq!(mapping.fund_id, Some(fund_id));

        let found = repo.find_mappings_for_account(&account_id).await.unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].bank_label, "CPAM93");
    }

    #[tokio::test]
    async fn test_update_existing_mapping() {
        let (repo, pool) = setup_test_repo().await;
        let account_id = create_test_bank_account(&pool).await;
        let fund_id = create_test_fund(&pool).await;

        let first = repo
            .save_mapping(&account_id, "CPAM93", &fund_id)
            .await
            .unwrap();

        // Create a second fund
        let fund_id2 = Uuid::new_v4().to_string();
        sqlx::query!(
            "INSERT INTO fund (id, fund_identifier, name, is_deleted) VALUES ($1, '94', 'CPAM 94', 0)",
            fund_id2,
        )
        .execute(&pool)
        .await
        .unwrap();

        // Save same label with different fund
        let updated = repo
            .save_mapping(&account_id, "CPAM93", &fund_id2)
            .await
            .unwrap();

        assert_eq!(updated.id, first.id); // Same ID (updated)
        assert_eq!(updated.fund_id, Some(fund_id2));

        let found = repo.find_mappings_for_account(&account_id).await.unwrap();
        assert_eq!(found.len(), 1);
    }

    #[tokio::test]
    async fn test_empty_account_returns_empty() {
        let (repo, _pool) = setup_test_repo().await;
        let found = repo.find_mappings_for_account("nonexistent").await.unwrap();
        assert!(found.is_empty());
    }
}

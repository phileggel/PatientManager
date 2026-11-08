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
#[cfg_attr(test, mockall::automock)]
#[async_trait::async_trait]
pub trait BankFundLabelMappingRepository: Send + Sync {
    /// Find all mappings for a bank account
    async fn find_mappings_for_account(
        &self,
        bank_account_id: &str,
    ) -> anyhow::Result<Vec<BankFundLabelMapping>>;

    /// BAS-041 — every mapping, all accounts, ordered by account then label.
    async fn find_all_mappings(&self) -> anyhow::Result<Vec<BankFundLabelMapping>>;

    /// BAS-042 — set a mapping's fund (`None` = rejected, BAS-030).
    /// `None` when no mapping has this id.
    async fn reassign_mapping(
        &self,
        id: &str,
        fund_id: Option<String>,
    ) -> anyhow::Result<Option<BankFundLabelMapping>>;

    /// BAS-043 — really delete a mapping; `false` when none has this id.
    async fn delete_mapping(&self, id: &str) -> anyhow::Result<bool>;

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
            WHERE bank_account_id = $1
              -- BAS-041D: a label whose fund is gone is unknown, so asked again
              AND (fund_id IS NULL OR EXISTS (SELECT 1 FROM fund WHERE fund.id = fund_id))
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

    async fn find_all_mappings(&self) -> anyhow::Result<Vec<BankFundLabelMapping>> {
        let rows = sqlx::query!(
            r#"
            SELECT id, bank_account_id, bank_label, fund_id
            FROM bank_fund_label_mapping
            -- BAS-041D: a label whose fund is gone is left out of the list
            WHERE fund_id IS NULL OR EXISTS (SELECT 1 FROM fund WHERE fund.id = fund_id)
            ORDER BY bank_account_id, bank_label
            "#,
        )
        .fetch_all(&self.pool)
        .await
        .context("Failed to fetch all label mappings")?;

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

    async fn reassign_mapping(
        &self,
        id: &str,
        fund_id: Option<String>,
    ) -> anyhow::Result<Option<BankFundLabelMapping>> {
        let updated = sqlx::query!(
            r#"
            UPDATE bank_fund_label_mapping
            SET fund_id = $1
            WHERE id = $2
            RETURNING id AS "id!", bank_account_id AS "bank_account_id!", bank_label AS "bank_label!", fund_id AS "fund_id?"
            "#,
            fund_id,
            id,
        )
        .fetch_optional(&self.pool)
        .await
        .context("Failed to reassign label mapping")?;

        Ok(updated.map(|r| BankFundLabelMapping {
            id: r.id,
            bank_account_id: r.bank_account_id,
            bank_label: r.bank_label,
            fund_id: r.fund_id,
        }))
    }

    async fn delete_mapping(&self, id: &str) -> anyhow::Result<bool> {
        let result = sqlx::query!("DELETE FROM bank_fund_label_mapping WHERE id = $1", id,)
            .execute(&self.pool)
            .await
            .context("Failed to delete label mapping")?;

        Ok(result.rows_affected() > 0)
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
            WHERE bank_account_id = $1 AND bank_label = $2
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
                INSERT INTO bank_fund_label_mapping (id, bank_account_id, bank_label, fund_id)
                VALUES ($1, $2, $3, $4)
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
            "INSERT INTO bank_account (id, name) VALUES ($1, 'Test Account')",
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
            "INSERT INTO fund (id, fund_identifier, name) VALUES ($1, '93', 'CPAM 93')",
            id,
        )
        .execute(pool)
        .await
        .expect("Failed to create test fund");
        id
    }

    /// BAS-041D — a label whose fund is gone is left out of both reads, so the next
    /// import asks for it again; an ignored label (no fund) stays.
    #[tokio::test]
    async fn test_590_a_label_whose_fund_is_gone_is_left_out() {
        let (repo, pool) = setup_test_repo().await;
        let account = create_test_bank_account(&pool).await;
        let fund = create_test_fund(&pool).await;
        for (id, label, fund_id) in [
            ("l-live", "LIVE", Some(fund.as_str())),
            ("l-gone", "GONE", Some("gone-fund")),
            ("l-ignored", "IGNORED", None),
        ] {
            sqlx::query("INSERT INTO bank_fund_label_mapping (id, bank_account_id, bank_label, fund_id) VALUES (?, ?, ?, ?)")
                .bind(id)
                .bind(&account)
                .bind(label)
                .bind(fund_id)
                .execute(&pool)
                .await
                .expect("seed");
        }

        let mut for_account: Vec<String> = repo
            .find_mappings_for_account(&account)
            .await
            .unwrap()
            .into_iter()
            .map(|m| m.id)
            .collect();
        let mut all: Vec<String> = repo
            .find_all_mappings()
            .await
            .unwrap()
            .into_iter()
            .map(|m| m.id)
            .collect();

        for_account.sort();
        all.sort();
        assert_eq!(for_account, ["l-ignored", "l-live"]);
        assert_eq!(all, ["l-ignored", "l-live"]);
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
            "INSERT INTO fund (id, fund_identifier, name) VALUES ($1, '94', 'CPAM 94')",
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

    /// R8: rejected labels are stored with fund_id = NULL (ADR-009)
    #[tokio::test]
    async fn test_save_rejected_mapping_stores_null_fund_id() {
        let (repo, pool) = setup_test_repo().await;
        let account_id = create_test_bank_account(&pool).await;

        let mapping = repo
            .save_mapping(&account_id, "CHARGES", "REJECTED")
            .await
            .unwrap();

        assert_eq!(mapping.bank_label, "CHARGES");
        assert_eq!(
            mapping.fund_id, None,
            "REJECTED sentinel must be stored as NULL"
        );

        let found = repo.find_mappings_for_account(&account_id).await.unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].fund_id, None);
    }

    /// R9: re-saving a confirmed mapping (idempotent upsert) preserves the same UUID
    #[tokio::test]
    async fn test_save_label_mappings_idempotent() {
        let (repo, pool) = setup_test_repo().await;
        let account_id = create_test_bank_account(&pool).await;
        let fund_id = create_test_fund(&pool).await;

        let first = repo
            .save_mapping(&account_id, "CPAM93", &fund_id)
            .await
            .unwrap();

        // Re-save the same label → same fund (idempotent)
        let second = repo
            .save_mapping(&account_id, "CPAM93", &fund_id)
            .await
            .unwrap();

        assert_eq!(first.id, second.id, "Upsert must preserve UUID");

        let found = repo.find_mappings_for_account(&account_id).await.unwrap();
        assert_eq!(
            found.len(),
            1,
            "Only one row should exist after idempotent save"
        );
    }
}

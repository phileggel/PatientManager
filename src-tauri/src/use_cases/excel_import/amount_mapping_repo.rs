use anyhow::Context;
use serde::{Deserialize, Serialize};
use specta::Type;
use sqlx::SqlitePool;
use uuid::Uuid;

/// A saved mapping between a procedure amount (millièmes d'euro) and a procedure type id
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ExcelAmountMapping {
    pub amount: i64,
    pub procedure_type_id: String,
}

/// Request to save or update a single amount → procedure type mapping
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SaveExcelAmountMappingRequest {
    pub amount: i64,
    pub procedure_type_id: String,
}

/// Repository trait for Excel amount → procedure type mappings
#[async_trait::async_trait]
pub trait ExcelAmountMappingRepository: Send + Sync {
    /// Return all saved mappings
    async fn find_all(&self) -> anyhow::Result<Vec<ExcelAmountMapping>>;

    /// Upsert a batch of amount → procedure type mappings
    async fn save_mappings(
        &self,
        mappings: Vec<SaveExcelAmountMappingRequest>,
    ) -> anyhow::Result<()>;
}

pub struct SqliteExcelAmountMappingRepository {
    pool: SqlitePool,
}

impl SqliteExcelAmountMappingRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

#[async_trait::async_trait]
impl ExcelAmountMappingRepository for SqliteExcelAmountMappingRepository {
    async fn find_all(&self) -> anyhow::Result<Vec<ExcelAmountMapping>> {
        // Only return mappings whose procedure type still exists (not deleted),
        // plus the special 'imported-from-excel' sentinel which has no DB row.
        let rows = sqlx::query!(
            r#"
            SELECT m.amount, m.procedure_type_id
            FROM excel_amount_type_mapping m
            WHERE m.procedure_type_id = 'imported-from-excel'
               OR EXISTS (
                   SELECT 1 FROM procedure_type
                   WHERE id = m.procedure_type_id AND is_deleted = 0
               )
            "#
        )
        .fetch_all(&self.pool)
        .await
        .context("Failed to fetch excel amount mappings")?;

        Ok(rows
            .into_iter()
            .map(|r| ExcelAmountMapping {
                amount: r.amount,
                procedure_type_id: r.procedure_type_id,
            })
            .collect())
    }

    async fn save_mappings(
        &self,
        mappings: Vec<SaveExcelAmountMappingRequest>,
    ) -> anyhow::Result<()> {
        for m in mappings {
            let existing = sqlx::query!(
                "SELECT id FROM excel_amount_type_mapping WHERE amount = $1",
                m.amount,
            )
            .fetch_optional(&self.pool)
            .await
            .context("Failed to check existing amount mapping")?;

            if let Some(row) = existing {
                sqlx::query!(
                    "UPDATE excel_amount_type_mapping SET procedure_type_id = $1 WHERE id = $2",
                    m.procedure_type_id,
                    row.id,
                )
                .execute(&self.pool)
                .await
                .context("Failed to update amount mapping")?;
            } else {
                let id = Uuid::new_v4().to_string();
                sqlx::query!(
                    r#"
                    INSERT INTO excel_amount_type_mapping (id, amount, procedure_type_id)
                    VALUES ($1, $2, $3)
                    "#,
                    id,
                    m.amount,
                    m.procedure_type_id,
                )
                .execute(&self.pool)
                .await
                .context("Failed to insert amount mapping")?;
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use sqlx::sqlite::SqlitePoolOptions;

    use super::*;

    async fn setup_test_repo() -> (SqliteExcelAmountMappingRepository, SqlitePool) {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("Failed to connect to in-memory database");

        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("Failed to run migrations");

        let repo = SqliteExcelAmountMappingRepository::new(pool.clone());
        (repo, pool)
    }

    async fn create_test_procedure_type(pool: &SqlitePool, id: &str) {
        sqlx::query!(
            "INSERT INTO procedure_type (id, name, default_amount, is_deleted) VALUES ($1, 'Test Type', 24000, 0)",
            id,
        )
        .execute(pool)
        .await
        .expect("Failed to create test procedure type");
    }

    #[tokio::test]
    async fn test_find_all_empty() {
        let (repo, _pool) = setup_test_repo().await;
        let result = repo.find_all().await.unwrap();
        assert!(result.is_empty());
    }

    #[tokio::test]
    async fn test_save_and_find() {
        let (repo, pool) = setup_test_repo().await;
        create_test_procedure_type(&pool, "type-abc").await;
        create_test_procedure_type(&pool, "type-xyz").await;

        repo.save_mappings(vec![
            SaveExcelAmountMappingRequest {
                amount: 24000,
                procedure_type_id: "type-abc".to_string(),
            },
            SaveExcelAmountMappingRequest {
                amount: 30000,
                procedure_type_id: "type-xyz".to_string(),
            },
        ])
        .await
        .unwrap();

        let all = repo.find_all().await.unwrap();
        assert_eq!(all.len(), 2);
        let m = all.iter().find(|m| m.amount == 24000).unwrap();
        assert_eq!(m.procedure_type_id, "type-abc");
    }

    #[tokio::test]
    async fn test_upsert_updates_existing() {
        let (repo, pool) = setup_test_repo().await;
        create_test_procedure_type(&pool, "type-abc").await;
        create_test_procedure_type(&pool, "type-new").await;

        repo.save_mappings(vec![SaveExcelAmountMappingRequest {
            amount: 24000,
            procedure_type_id: "type-abc".to_string(),
        }])
        .await
        .unwrap();

        repo.save_mappings(vec![SaveExcelAmountMappingRequest {
            amount: 24000,
            procedure_type_id: "type-new".to_string(),
        }])
        .await
        .unwrap();

        let all = repo.find_all().await.unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].procedure_type_id, "type-new");
    }

    #[tokio::test]
    async fn test_deleted_type_filtered_out() {
        let (repo, pool) = setup_test_repo().await;
        create_test_procedure_type(&pool, "type-active").await;
        create_test_procedure_type(&pool, "type-deleted").await;

        repo.save_mappings(vec![
            SaveExcelAmountMappingRequest {
                amount: 24000,
                procedure_type_id: "type-active".to_string(),
            },
            SaveExcelAmountMappingRequest {
                amount: 30000,
                procedure_type_id: "type-deleted".to_string(),
            },
        ])
        .await
        .unwrap();

        // Soft-delete the second type
        sqlx::query!("UPDATE procedure_type SET is_deleted = 1 WHERE id = 'type-deleted'")
            .execute(&pool)
            .await
            .unwrap();

        let all = repo.find_all().await.unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].procedure_type_id, "type-active");
    }

    #[tokio::test]
    async fn test_imported_from_excel_always_returned() {
        let (repo, _pool) = setup_test_repo().await;

        repo.save_mappings(vec![SaveExcelAmountMappingRequest {
            amount: 24000,
            procedure_type_id: "imported-from-excel".to_string(),
        }])
        .await
        .unwrap();

        let all = repo.find_all().await.unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].procedure_type_id, "imported-from-excel");
    }
}

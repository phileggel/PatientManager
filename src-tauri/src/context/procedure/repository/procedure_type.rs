use anyhow::{anyhow, Context};
use sqlx::SqlitePool;

use crate::context::procedure::domain::ProcedureType;

/// Internal row type for procedure type database mapping
#[derive(sqlx::FromRow)]
pub struct ProcedureTypeRow {
    pub id: String,
    pub name: String,
    pub default_amount: i64,
    pub category: Option<String>,
    pub is_deleted: i64,
}

// Conversion function from row type to domain object
impl From<ProcedureTypeRow> for ProcedureType {
    fn from(row: ProcedureTypeRow) -> Self {
        ProcedureType::restore(row.id, row.name, row.default_amount, row.category)
    }
}

/// ProcedureTypeRepository trait defines the contract for procedure type data access
///
/// Implementations of this trait handle persistence and retrieval of procedure type data.
/// The application layer uses this trait without knowing about concrete implementations (e.g., database).
#[async_trait::async_trait]
pub trait ProcedureTypeRepository: Send + Sync {
    async fn create_procedure_type(
        &self,
        name: String,
        default_amount: i64,
        category: Option<String>,
    ) -> anyhow::Result<ProcedureType>;
    async fn read_all_procedure_types(&self) -> anyhow::Result<Vec<ProcedureType>>;
    async fn read_procedure_type(&self, id: &str) -> anyhow::Result<Option<ProcedureType>>;
    async fn update_procedure_type(
        &self,
        procedure_type: ProcedureType,
    ) -> anyhow::Result<ProcedureType>;
    async fn delete_procedure_type(&self, id: &str) -> anyhow::Result<()>;
    async fn find_by_name(&self, name: &str) -> anyhow::Result<Option<ProcedureType>>;
}

pub struct SqliteProcedureTypeRepository {
    pool: SqlitePool,
}

impl SqliteProcedureTypeRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

#[async_trait::async_trait]
impl ProcedureTypeRepository for SqliteProcedureTypeRepository {
    async fn create_procedure_type(
        &self,
        name: String,
        default_amount: i64,
        category: Option<String>,
    ) -> anyhow::Result<ProcedureType> {
        // Domain layer creates and validates the procedure type
        let procedure_type = ProcedureType::new(name, default_amount, category)?;

        tracing::trace!(procedure_type_id = %procedure_type.id, name = ?procedure_type.name, "Inserting procedure type into database");

        sqlx::query!(
            r#"
            INSERT INTO procedure_type (id, name, default_amount, category, is_deleted)
            VALUES ($1, $2, $3, $4, 0)
            "#,
            procedure_type.id,
            procedure_type.name,
            procedure_type.default_amount,
            procedure_type.category,
        )
        .execute(&self.pool)
        .await?;

        tracing::trace!(procedure_type_id = %procedure_type.id, "Procedure type inserted successfully");

        Ok(procedure_type)
    }

    async fn read_all_procedure_types(&self) -> anyhow::Result<Vec<ProcedureType>> {
        tracing::trace!("Fetching all active procedure types from database");

        let rows = sqlx::query_as!(
            ProcedureTypeRow,
            r#"
            SELECT id, name, default_amount, category, is_deleted
            FROM procedure_type
            WHERE is_deleted = 0
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(ProcedureType::from).collect())
    }

    async fn read_procedure_type(&self, id: &str) -> anyhow::Result<Option<ProcedureType>> {
        tracing::trace!(procedure_type_id = %id, "Fetching procedure type from database");

        let row = sqlx::query_as!(
            ProcedureTypeRow,
            r#"
            SELECT id, name, default_amount, category, is_deleted
            FROM procedure_type
            WHERE id = $1 AND is_deleted = 0
            "#,
            id,
        )
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(ProcedureType::from))
    }

    async fn update_procedure_type(
        &self,
        procedure_type: ProcedureType,
    ) -> anyhow::Result<ProcedureType> {
        tracing::trace!(procedure_type_id = %procedure_type.id, "Updating procedure type in database");

        sqlx::query!(
            r#"
            UPDATE procedure_type
            SET name = $1, default_amount = $2, category = $3
            WHERE id = $4
            "#,
            procedure_type.name,
            procedure_type.default_amount,
            procedure_type.category,
            procedure_type.id,
        )
        .execute(&self.pool)
        .await?;

        tracing::trace!("Procedure type updated successfully");
        Ok(procedure_type.clone())
    }

    async fn delete_procedure_type(&self, id: &str) -> anyhow::Result<()> {
        tracing::trace!(procedure_type_id = %id, "Soft-deleting procedure type from database");

        sqlx::query!(
            r#"UPDATE procedure_type SET is_deleted = 1 WHERE id = ?"#,
            id
        )
        .execute(&self.pool)
        .await
        .with_context(|| anyhow!("Failed to soft-delete healthcare procedure type"))?;

        Ok(())
    }

    async fn find_by_name(&self, name: &str) -> anyhow::Result<Option<ProcedureType>> {
        tracing::trace!(name = %name, "Fetching procedure type by name from database");

        let row = sqlx::query_as!(
            ProcedureTypeRow,
            r#"
            SELECT id, name, default_amount, category, is_deleted
            FROM procedure_type
            WHERE name = $1 AND is_deleted = 0
            "#,
            name,
        )
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(ProcedureType::from))
    }
}

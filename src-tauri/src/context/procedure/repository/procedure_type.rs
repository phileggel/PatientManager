use anyhow::{anyhow, Context};
use sqlx::SqlitePool;

use crate::context::procedure::domain::{ProcedureType, ProcedureTypeRepository};

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

pub struct SqliteProcedureTypeRepository {
    pool: SqlitePool,
}

impl SqliteProcedureTypeRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    /// Soft-delete one procedure type on a connection the caller owns — the
    /// write of a unit of work (ADR-003, PRO-280).
    pub async fn soft_delete_in(conn: &mut sqlx::SqliteConnection, id: &str) -> anyhow::Result<()> {
        tracing::trace!(procedure_type_id = %id, "Soft-deleting procedure type from database");

        sqlx::query!(
            r#"UPDATE procedure_type SET is_deleted = 1 WHERE id = ?"#,
            id
        )
        .execute(conn)
        .await
        .with_context(|| anyhow!("Failed to soft-delete healthcare procedure type"))?;

        Ok(())
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

    async fn find_by_name(&self, name: &str) -> anyhow::Result<Option<ProcedureType>> {
        tracing::trace!(name = %name, "Fetching procedure type by name from database");

        // R4 — SQLite's LOWER() folds ASCII only ("Échographie" stays apart from
        // "échographie"); Rust's to_lowercase() is Unicode-aware, as for patients.
        let needle = name.to_lowercase();
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

        Ok(rows
            .into_iter()
            .find(|row| row.name.to_lowercase() == needle)
            .map(ProcedureType::from))
    }
}

#[cfg(test)]
mod tests {
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

    use super::*;

    async fn repo() -> SqliteProcedureTypeRepository {
        let opts = SqliteConnectOptions::new().in_memory(true);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(opts)
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        SqliteProcedureTypeRepository::new(pool)
    }

    #[tokio::test]
    async fn debt_045_r4_a_name_differing_only_by_the_case_of_an_accented_letter_is_found() {
        let repo = repo().await;
        let stored = repo
            .create_procedure_type("Échographie".to_string(), 50000, None)
            .await
            .unwrap();

        let found = repo.find_by_name("échographie").await.unwrap();

        assert_eq!(found.map(|t| t.id), Some(stored.id));
    }

    #[tokio::test]
    async fn r4_another_name_is_not_found() {
        let repo = repo().await;
        repo.create_procedure_type("Échographie".to_string(), 50000, None)
            .await
            .unwrap();

        assert!(repo.find_by_name("Echographie").await.unwrap().is_none());
    }
}

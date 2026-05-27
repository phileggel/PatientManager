use serde::{Deserialize, Serialize};
use specta::Type;
use uuid::Uuid;

use super::super::error::ProcedureError;

/// Procedure Type aggregate root
///
/// Represents a type of healthcare service or procedure with a standard name and default amount.
/// Used to categorize procedures and provide default financial amounts.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ProcedureType {
    pub name: String,
    pub default_amount: i64,
    pub category: Option<String>,

    /// Metadata - not a domain property
    pub id: String,
}

impl ProcedureType {
    /// Creates a new ProcedureType with validation and generates ID.
    pub fn new(
        name: String,
        default_amount: i64,
        category: Option<String>,
    ) -> Result<Self, ProcedureError> {
        Self::validate_fields(&name, default_amount)?;

        Ok(Self {
            id: Uuid::new_v4().to_string(),
            name,
            default_amount,
            category,
        })
    }

    /// Creates a ProcedureType with an existing ID and validation.
    /// Used when updating from external input (API, imports, etc.).
    /// Does NOT generate a new ID.
    pub fn with_id(
        id: String,
        name: String,
        default_amount: i64,
        category: Option<String>,
    ) -> Result<Self, ProcedureError> {
        Self::validate_fields(&name, default_amount)?;

        Ok(Self {
            id,
            name,
            default_amount,
            category,
        })
    }

    /// Restores a ProcedureType from database storage (no validation).
    /// Data from storage is already validated.
    pub fn restore(
        id: String,
        name: String,
        default_amount: i64,
        category: Option<String>,
    ) -> Self {
        Self {
            id,
            name,
            default_amount,
            category,
        }
    }

    /// Validates procedure type fields.
    /// Used by factory methods to ensure domain invariants.
    fn validate_fields(name: &str, default_amount: i64) -> Result<(), ProcedureError> {
        if name.trim().is_empty() {
            return Err(ProcedureError::ProcedureTypeNameEmpty);
        }
        if default_amount < 0 {
            return Err(ProcedureError::DefaultAmountNegative);
        }
        Ok(())
    }
}

#[cfg_attr(test, mockall::automock)]
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

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
    /// Creates a new ProcedureType with validation and generates ID. The name
    /// is trimmed and a blank category read as none, as for an edit.
    pub fn new(
        name: String,
        default_amount: i64,
        category: Option<String>,
    ) -> Result<Self, ProcedureError> {
        let (name, category) = Self::read_input(name, category);
        Self::validate_fields(&name, default_amount)?;

        Ok(Self {
            id: Uuid::new_v4().to_string(),
            name,
            default_amount,
            category,
        })
    }

    /// What this stored procedure type becomes when a user edits it: the name
    /// trimmed, a blank category read as none, all three validated, the id kept.
    pub fn edit(
        &self,
        name: String,
        default_amount: i64,
        category: Option<String>,
    ) -> Result<Self, ProcedureError> {
        let (name, category) = Self::read_input(name, category);
        Self::validate_fields(&name, default_amount)?;
        Ok(Self {
            id: self.id.clone(),
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

    /// What a form sent, as the domain reads it: the name trimmed, a blank category as none.
    fn read_input(name: String, category: Option<String>) -> (String, Option<String>) {
        let category = category
            .map(|category| category.trim().to_string())
            .filter(|category| !category.is_empty());
        (name.trim().to_string(), category)
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

#[cfg(test)]
mod tests {
    use super::*;

    fn stored() -> ProcedureType {
        ProcedureType::restore(
            "pt-1".to_string(),
            "Consultation".to_string(),
            100_000,
            None,
        )
    }

    #[test]
    fn a_new_procedure_type_has_its_name_trimmed_and_a_blank_category_read_as_none() {
        let created = ProcedureType::new(" Bilan ".to_string(), 50_000, Some("  ".to_string()))
            .expect("padded values are valid input");
        assert_eq!(created.name, "Bilan");
        assert_eq!(created.category, None);
    }

    #[test]
    fn an_edit_trims_and_keeps_the_id() {
        let edited = stored()
            .edit(" Bilan ".to_string(), 50_000, Some(" Soin ".to_string()))
            .expect("padded values are valid input");
        assert_eq!(edited.id, "pt-1");
        assert_eq!(edited.name, "Bilan");
        assert_eq!(edited.default_amount, 50_000);
        assert_eq!(edited.category.as_deref(), Some("Soin"));
    }

    #[test]
    fn an_edit_refuses_a_blank_name() {
        let result = stored().edit("  ".to_string(), 50_000, None);
        assert!(matches!(
            result,
            Err(ProcedureError::ProcedureTypeNameEmpty)
        ));
    }

    #[test]
    fn an_edit_refuses_a_negative_amount() {
        let result = stored().edit("Bilan".to_string(), -1, None);
        assert!(matches!(result, Err(ProcedureError::DefaultAmountNegative)));
    }

    #[test]
    fn new_rejects_empty_name() {
        let result = ProcedureType::new("".to_string(), 100_000, None);
        assert!(matches!(
            result,
            Err(ProcedureError::ProcedureTypeNameEmpty)
        ));
    }

    #[test]
    fn new_rejects_whitespace_only_name() {
        let result = ProcedureType::new("   ".to_string(), 100_000, None);
        assert!(matches!(
            result,
            Err(ProcedureError::ProcedureTypeNameEmpty)
        ));
    }

    #[test]
    fn new_rejects_negative_default_amount() {
        let result = ProcedureType::new("Consultation".to_string(), -1, None);
        assert!(matches!(result, Err(ProcedureError::DefaultAmountNegative)));
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

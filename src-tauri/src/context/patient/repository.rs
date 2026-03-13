use anyhow::Context;
use sqlx::SqlitePool;

use crate::context::patient::*;
use chrono::NaiveDate;

/// Internal row type for patient database mapping
#[derive(sqlx::FromRow)]
pub struct PatientRow {
    pub id: String,
    pub is_anonymous: i64,
    pub name: Option<String>,
    pub ssn: Option<String>,
    pub latest_procedure_type: Option<String>,
    pub latest_fund: Option<String>,
    pub latest_date: Option<String>,
    pub latest_procedure_amount: Option<i64>,
    pub is_deleted: i64,
}

// Conversion function from row type to domain object
impl From<PatientRow> for Patient {
    fn from(row: PatientRow) -> Self {
        let latest_date_parsed = row
            .latest_date
            .and_then(|date_str| NaiveDate::parse_from_str(&date_str, "%Y-%m-%d").ok());

        Patient::restore(
            row.id,
            row.is_anonymous != 0,
            row.name,
            row.ssn,
            row.latest_procedure_type,
            row.latest_fund,
            latest_date_parsed,
            row.latest_procedure_amount,
        )
    }
}

/// PatientRepository trait defines the contract for patient data access
#[async_trait::async_trait]
pub trait PatientRepository: Send + Sync {
    async fn create_patient(&self, patient: Patient) -> anyhow::Result<Patient>;
    async fn read_all_patients(&self) -> anyhow::Result<Vec<Patient>>;
    async fn read_patient(&self, id: &str) -> anyhow::Result<Option<Patient>>;
    async fn update_patient(&self, patient: Patient) -> anyhow::Result<Patient>;
    async fn find_patient_by_ssn(&self, ssn: &str) -> anyhow::Result<Option<Patient>>;
    async fn create_batch(&self, patients: Vec<Patient>) -> anyhow::Result<Vec<Patient>>;
    async fn delete_patient(&self, id: &str) -> anyhow::Result<()>;
}

pub struct SqlitePatientRepository {
    pool: SqlitePool,
}

impl SqlitePatientRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

#[async_trait::async_trait]
impl PatientRepository for SqlitePatientRepository {
    async fn create_patient(&self, patient: Patient) -> anyhow::Result<Patient> {
        tracing::trace!(patient_id = %patient.id, name = ?patient.name, "Inserting patient into database");

        sqlx::query!(
            r#"
            INSERT INTO patient (id, is_anonymous, name, ssn, latest_procedure_type, latest_fund, latest_date, latest_procedure_amount, is_deleted)
            VALUES ($1, $2, $3, $4, NULL, NULL, NULL, NULL, 0)
            "#,
            patient.id,
            patient.is_anonymous,
            patient.name,
            patient.ssn,
        )
        .execute(&self.pool)
        .await?;

        tracing::trace!(patient_id = %patient.id, "Patient inserted successfully");

        Ok(Patient::restore(
            patient.id,
            patient.is_anonymous,
            patient.name,
            patient.ssn,
            None,
            None,
            None,
            None,
        ))
    }

    async fn read_all_patients(&self) -> anyhow::Result<Vec<Patient>> {
        tracing::trace!("Fetching all patients from database");

        let rows = sqlx::query_as!(
            PatientRow,
            r#"
            SELECT id, is_anonymous, name, ssn, latest_procedure_type, latest_fund, latest_date, latest_procedure_amount, is_deleted
            FROM patient
            WHERE is_deleted = 0
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(Patient::from).collect())
    }

    async fn read_patient(&self, patient_id: &str) -> anyhow::Result<Option<Patient>> {
        tracing::trace!(patient_id = %patient_id, "Fetching patient from database");

        let row = sqlx::query_as!(
            PatientRow,
            r#"
            SELECT id, is_anonymous, name, ssn, latest_procedure_type, latest_fund, latest_date, latest_procedure_amount, is_deleted
            FROM patient
            WHERE id = $1 AND is_deleted = 0
            "#,
            patient_id,
        )
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(Patient::from))
    }

    async fn update_patient(&self, patient: Patient) -> anyhow::Result<Patient> {
        let patient_id = &patient.id;

        let latest_date_str = patient
            .latest_date
            .map(|d| d.format("%Y-%m-%d").to_string());

        tracing::trace!(patient_id = %patient_id, name = ?patient.name, "Updating patient in database");

        sqlx::query!(
            r#"
            UPDATE patient
            SET
                is_anonymous = $2,
                name = $3,
                ssn = $4,
                latest_procedure_type = $5,
                latest_fund = $6,
                latest_date = $7,
                latest_procedure_amount = $8
            WHERE id = $1
            "#,
            patient_id,
            patient.is_anonymous,
            patient.name,
            patient.ssn,
            patient.latest_procedure_type,
            patient.latest_fund,
            latest_date_str,
            patient.latest_procedure_amount,
        )
        .execute(&self.pool)
        .await
        .with_context(|| format!("Failed to update patient {}", patient_id))?;

        tracing::trace!("Patient {patient_id} updated.");
        Ok(patient.clone())
    }

    async fn find_patient_by_ssn(&self, ssn: &str) -> anyhow::Result<Option<Patient>> {
        tracing::trace!(ssn = %ssn, "Fetching patient by SSN from database");

        let row = sqlx::query_as!(
            PatientRow,
            r#"
            SELECT id, is_anonymous, name, ssn, latest_procedure_type, latest_fund, latest_date, latest_procedure_amount, is_deleted
            FROM patient
            WHERE ssn = $1 AND is_deleted = 0
            "#,
            ssn,
        )
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(Patient::from))
    }

    async fn create_batch(&self, patients: Vec<Patient>) -> anyhow::Result<Vec<Patient>> {
        let mut tx = self.pool.begin().await?;
        let mut created_patients = Vec::new();

        for patient in patients {
            tracing::trace!(
                patient_id = %patient.id,
                name = ?patient.name,
                "Inserting patient into database within transaction"
            );

            sqlx::query!(
                r#"
                INSERT INTO patient (id, is_anonymous, name, ssn, latest_procedure_type, latest_fund, latest_date, latest_procedure_amount, is_deleted)
                VALUES ($1, $2, $3, $4, NULL, NULL, NULL, NULL, 0)
                "#,
                patient.id,
                patient.is_anonymous,
                patient.name,
                patient.ssn,
            )
            .execute(&mut *tx)
            .await?;

            created_patients.push(patient);
        }

        tx.commit().await?;
        tracing::trace!(
            count = created_patients.len(),
            "Batch patients created successfully"
        );

        Ok(created_patients)
    }

    async fn delete_patient(&self, id: &str) -> anyhow::Result<()> {
        tracing::trace!(patient_id = %id, "Soft-deleting patient from database");

        sqlx::query!(r#"UPDATE patient SET is_deleted = 1 WHERE id = ?"#, id)
            .execute(&self.pool)
            .await
            .with_context(|| format!("Failed to soft-delete patient {}", id))?;

        tracing::trace!(patient_id = %id, "Patient soft-deleted successfully");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use sqlx::sqlite::SqlitePoolOptions;

    use super::*;
    use crate::context::patient::test_helpers::{make_patient, make_patient_with_id};

    async fn setup_test_repo() -> SqlitePatientRepository {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("Failed to connect to in-memory database");

        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("Failed to run migrations");

        SqlitePatientRepository { pool }
    }

    #[tokio::test]
    async fn test_add_patient() -> anyhow::Result<()> {
        let db = setup_test_repo().await;
        let new_patient = Patient::new(false, Some("Marie Dupont".to_string()), None)?;

        let saved_patient = db.create_patient(new_patient.clone()).await?;

        assert_eq!(saved_patient.id, new_patient.id);
        assert!(!saved_patient.is_anonymous);
        assert_eq!(saved_patient.name, Some("Marie Dupont".to_string()));
        assert!(saved_patient.ssn.is_none());
        assert!(saved_patient.latest_procedure_type.is_none());
        assert!(saved_patient.latest_fund.is_none());
        assert!(saved_patient.latest_date.is_none());
        assert!(saved_patient.latest_procedure_amount.is_none());

        Ok(())
    }

    #[tokio::test]
    async fn test_read_all_patients() {
        let db = setup_test_repo().await;
        let new_patient1 = make_patient_with_id("patient-1");
        let new_patient2 = make_patient_with_id("patient-2");

        let patient1 = db.create_patient(new_patient1.clone()).await.unwrap();
        let patient2 = db.create_patient(new_patient2.clone()).await.unwrap();

        let patients = db.read_all_patients().await.unwrap();
        assert_eq!(patients.len(), 2);

        let ids: Vec<String> = patients.iter().map(|p| p.id.clone()).collect();
        assert!(ids.contains(&patient1.id));
        assert!(ids.contains(&patient2.id));
    }

    #[tokio::test]
    async fn test_update_patient() {
        let db = setup_test_repo().await;
        let new_patient = Patient::new(false, Some("Initial".to_string()), None).unwrap();

        let saved_patient = db.create_patient(new_patient).await.unwrap();

        let test_date = NaiveDate::from_ymd_opt(2024, 1, 15).unwrap();

        let updated_patient = Patient {
            id: saved_patient.id.clone(),
            is_anonymous: true,
            name: Some("Marie Dupont".to_string()),
            ssn: Some("1234567890123".to_string()),
            temp_id: None,
            latest_procedure_type: Some("type-123".to_string()),
            latest_fund: Some("fund-456".to_string()),
            latest_date: Some(test_date),
            latest_procedure_amount: Some(150000),
        };

        db.update_patient(updated_patient).await.unwrap();

        let patients = db.read_all_patients().await.unwrap();
        assert_eq!(patients.len(), 1);
        assert!(patients[0].is_anonymous);
        assert_eq!(patients[0].name, Some("Marie Dupont".to_string()));
        assert_eq!(patients[0].ssn, Some("1234567890123".to_string()));
        assert_eq!(
            patients[0].latest_procedure_type,
            Some("type-123".to_string())
        );
        assert_eq!(patients[0].latest_fund, Some("fund-456".to_string()));
        assert_eq!(patients[0].latest_date, Some(test_date));
        assert_eq!(patients[0].latest_procedure_amount, Some(150000));
    }

    #[tokio::test]
    async fn test_find_patient_by_ssn_exists() {
        let db = setup_test_repo().await;
        let new_patient = make_patient();

        let created = db.create_patient(new_patient).await.unwrap();
        let found = db.find_patient_by_ssn("1234567890123").await.unwrap();

        assert!(found.is_some());
        let found_patient = found.unwrap();
        assert_eq!(found_patient.id, created.id);
        assert_eq!(found_patient.ssn, Some("1234567890123".to_string()));
    }

    #[tokio::test]
    async fn test_find_patient_by_ssn_not_found() {
        let db = setup_test_repo().await;
        let found = db.find_patient_by_ssn("9876543210987").await.unwrap();
        assert!(found.is_none());
    }

    #[tokio::test]
    async fn test_find_patient_by_ssn_excludes_deleted() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("Failed to connect to in-memory database");

        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("Failed to run migrations");

        let db = SqlitePatientRepository { pool: pool.clone() };

        let new_patient = make_patient();

        let created = db.create_patient(new_patient).await.unwrap();

        sqlx::query!("UPDATE patient SET is_deleted = 1 WHERE id = ?", created.id)
            .execute(&pool)
            .await
            .unwrap();

        let found = db.find_patient_by_ssn("1234567890123").await.unwrap();
        assert!(found.is_none());
    }

    #[tokio::test]
    async fn test_create_batch() {
        let db = setup_test_repo().await;

        let patients = vec![
            make_patient_with_id("patient-1"),
            make_patient_with_id("patient-2"),
        ];

        let created = db.create_batch(patients).await.unwrap();
        assert_eq!(created.len(), 2);
        assert_eq!(created[0].name, Some("Marie Dupont".to_string()));
        assert_eq!(created[1].name, Some("Marie Dupont".to_string()));
        assert!(!created[0].id.is_empty());
        assert!(!created[1].id.is_empty());

        let all_patients = db.read_all_patients().await.unwrap();
        assert_eq!(all_patients.len(), 2);
    }

    #[tokio::test]
    async fn test_delete_patient() {
        let db = setup_test_repo().await;
        let new_patient = Patient::new(
            false,
            Some("Marie Dupont".to_string()),
            Some("1234567890123".to_string()),
        )
        .unwrap();

        let created = db.create_patient(new_patient).await.unwrap();
        let patient_id = created.id.clone();

        let found = db.read_patient(&patient_id).await.unwrap();
        assert!(found.is_some());

        db.delete_patient(&patient_id).await.unwrap();

        let deleted = db.read_patient(&patient_id).await.unwrap();
        assert!(deleted.is_none());

        let all_patients = db.read_all_patients().await.unwrap();
        assert!(!all_patients.iter().any(|p| p.id == patient_id));
    }

    #[tokio::test]
    async fn test_delete_patient_excludes_from_queries() {
        let db = setup_test_repo().await;

        let patient1 = Patient::new(
            false,
            Some("Marie Dupont".to_string()),
            Some("1234567890123".to_string()),
        )
        .unwrap();
        let patient2 = Patient::new(
            false,
            Some("Marie Dupont".to_string()),
            Some("9876543210987".to_string()),
        )
        .unwrap();

        let created1 = db.create_patient(patient1).await.unwrap();
        let created2 = db.create_patient(patient2).await.unwrap();

        let all_patients = db.read_all_patients().await.unwrap();
        assert_eq!(all_patients.len(), 2);

        db.delete_patient(&created1.id).await.unwrap();

        let remaining = db.read_all_patients().await.unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, created2.id);
    }
}

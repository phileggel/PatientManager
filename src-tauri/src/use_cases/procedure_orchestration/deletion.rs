//! PRO-280, PRO-290 — deleting a procedure type or a fund clears it from every
//! patient's latest-procedure defaults, in the same transaction.

use std::sync::Arc;

use crate::context::fund::{FundError, FundService};
use crate::context::patient::PatientService;
use crate::context::procedure::{ProcedureError, ProcedureType, ProcedureTypeService};
use crate::shared::logger::BACKEND;

use super::uow::DeletionTransactionManager;

pub struct DeletionOrchestrator {
    procedure_type_service: Arc<ProcedureTypeService>,
    fund_service: Arc<FundService>,
    patient_service: Arc<PatientService>,
    deletion: Arc<dyn DeletionTransactionManager>,
}

impl DeletionOrchestrator {
    pub fn new(
        procedure_type_service: Arc<ProcedureTypeService>,
        fund_service: Arc<FundService>,
        patient_service: Arc<PatientService>,
        deletion: Arc<dyn DeletionTransactionManager>,
    ) -> Self {
        Self {
            procedure_type_service,
            fund_service,
            patient_service,
            deletion,
        }
    }

    /// PRO-280 — soft-delete a procedure type; the patients whose latest type
    /// it is lose that default and its date. The reserved type is refused.
    pub async fn delete_procedure_type(&self, id: &str) -> Result<(), ProcedureError> {
        ProcedureType::ensure_mutable(id)?;
        let id = id.to_string();
        self.deletion
            .run(Box::new(move |uow| {
                Box::pin(async move {
                    uow.delete_procedure_type(&id).await?;
                    uow.clear_procedure_type_defaults(&id).await
                })
            }))
            .await
            .map_err(|e| {
                tracing::error!(target: BACKEND, err = ?e, "delete_procedure_type: unit of work failed");
                ProcedureError::DatabaseError
            })?;

        self.procedure_type_service.notify_procedure_types_updated();
        self.patient_service.notify_patients_updated();
        Ok(())
    }

    /// PRO-290 — soft-delete a fund; the patients whose latest fund it is lose
    /// that default.
    pub async fn delete_fund(&self, id: &str) -> Result<(), FundError> {
        let id = id.to_string();
        self.deletion
            .run(Box::new(move |uow| {
                Box::pin(async move {
                    uow.delete_fund(&id).await?;
                    uow.clear_fund_defaults(&id).await
                })
            }))
            .await
            .map_err(|e| {
                tracing::error!(target: BACKEND, err = ?e, "delete_fund: unit of work failed");
                FundError::DatabaseError
            })?;

        self.fund_service.notify_funds_updated();
        self.patient_service.notify_patients_updated();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use anyhow::anyhow;

    use super::*;
    use crate::context::fund::MockFundRepository;
    use crate::context::patient::MockPatientRepository;
    use crate::context::procedure::MockProcedureTypeRepository;
    use crate::shared::event_bus::EventBus;
    use crate::use_cases::procedure_orchestration::uow::{DeletionOperation, DeletionUnitOfWork};

    /// Records the writes an operation asks for; fails the run when told to.
    #[derive(Default)]
    struct RecordingDeletion {
        writes: Arc<Mutex<Vec<String>>>,
        fail: bool,
    }

    struct RecordingUnitOfWork {
        writes: Arc<Mutex<Vec<String>>>,
    }

    impl RecordingUnitOfWork {
        fn record(&self, write: String) -> anyhow::Result<()> {
            self.writes.lock().unwrap().push(write);
            Ok(())
        }
    }

    #[async_trait::async_trait]
    impl DeletionUnitOfWork for RecordingUnitOfWork {
        async fn delete_procedure_type(&mut self, id: &str) -> anyhow::Result<()> {
            self.record(format!("delete_procedure_type {id}"))
        }
        async fn clear_procedure_type_defaults(&mut self, id: &str) -> anyhow::Result<()> {
            self.record(format!("clear_procedure_type_defaults {id}"))
        }
        async fn delete_fund(&mut self, id: &str) -> anyhow::Result<()> {
            self.record(format!("delete_fund {id}"))
        }
        async fn clear_fund_defaults(&mut self, id: &str) -> anyhow::Result<()> {
            self.record(format!("clear_fund_defaults {id}"))
        }
    }

    #[async_trait::async_trait]
    impl DeletionTransactionManager for RecordingDeletion {
        async fn run(&self, operation: DeletionOperation) -> anyhow::Result<()> {
            if self.fail {
                return Err(anyhow!("transaction failed"));
            }
            let mut uow = RecordingUnitOfWork {
                writes: self.writes.clone(),
            };
            operation(&mut uow).await
        }
    }

    fn orchestrator(deletion: RecordingDeletion) -> DeletionOrchestrator {
        let bus = Arc::new(EventBus::new());
        DeletionOrchestrator::new(
            Arc::new(ProcedureTypeService::new(
                Arc::new(MockProcedureTypeRepository::new()),
                bus.clone(),
            )),
            Arc::new(FundService::new(
                Arc::new(MockFundRepository::new()),
                bus.clone(),
            )),
            Arc::new(PatientService::new(
                Arc::new(MockPatientRepository::new()),
                bus,
            )),
            Arc::new(deletion),
        )
    }

    #[tokio::test]
    async fn pro_280_deleting_a_procedure_type_clears_the_patients_defaults_in_one_unit() {
        let deletion = RecordingDeletion::default();
        let writes = deletion.writes.clone();

        orchestrator(deletion)
            .delete_procedure_type("type-1")
            .await
            .unwrap();

        assert_eq!(
            *writes.lock().unwrap(),
            vec![
                "delete_procedure_type type-1",
                "clear_procedure_type_defaults type-1"
            ]
        );
    }

    #[tokio::test]
    async fn pro_290_deleting_a_fund_clears_the_patients_defaults_in_one_unit() {
        let deletion = RecordingDeletion::default();
        let writes = deletion.writes.clone();

        orchestrator(deletion).delete_fund("fund-1").await.unwrap();

        assert_eq!(
            *writes.lock().unwrap(),
            vec!["delete_fund fund-1", "clear_fund_defaults fund-1"]
        );
    }

    #[tokio::test]
    async fn the_reserved_procedure_type_is_refused_before_any_write() {
        let deletion = RecordingDeletion::default();
        let writes = deletion.writes.clone();

        let result = orchestrator(deletion)
            .delete_procedure_type(ProcedureType::RESERVED_ID)
            .await;

        assert!(matches!(
            result,
            Err(ProcedureError::ReservedTypeNotMutable)
        ));
        assert!(writes.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_failed_unit_of_work_is_a_database_error() {
        let failing = || RecordingDeletion {
            fail: true,
            ..Default::default()
        };

        let type_result = orchestrator(failing())
            .delete_procedure_type("type-1")
            .await;
        let fund_result = orchestrator(failing()).delete_fund("fund-1").await;

        assert!(matches!(type_result, Err(ProcedureError::DatabaseError)));
        assert!(matches!(fund_result, Err(FundError::DatabaseError)));
    }
}

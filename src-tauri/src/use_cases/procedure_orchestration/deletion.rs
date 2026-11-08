//! PRO-280, PRO-290 — deleting a procedure type or a fund clears it from every
//! patient's latest-procedure defaults, in the same transaction.

use std::sync::Arc;

use crate::context::fund::FundService;
use crate::context::patient::PatientService;
use crate::context::procedure::{ProcedureType, ProcedureTypeService};
use crate::shared::logger::BACKEND;

use super::error::{ProcedureOrchestrationError, ProcedureOrchestrationTask};
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

    /// R6, PRO-280 — delete a procedure type; the patients whose latest type it
    /// is lose that default and its date. The reserved type is refused, and so is
    /// a type procedures use (R24).
    pub async fn delete_procedure_type(&self, id: &str) -> Result<(), ProcedureOrchestrationError> {
        ProcedureType::ensure_mutable(id)?;
        let id = id.to_string();
        self.deletion
            .run(Box::new(move |uow| {
                Box::pin(async move {
                    if !uow.delete_procedure_type(&id).await? {
                        let procedure_count = uow.count_procedures_of_type(&id).await?;
                        if procedure_count > 0 {
                            return Err(ProcedureOrchestrationTask::ProcedureTypeInUse { procedure_count }.into());
                        }
                        if uow.procedure_type_exists(&id).await? {
                            anyhow::bail!("procedure type refused by a reference nothing counts");
                        }
                        // An unknown id changes nothing.
                        return Ok(());
                    }
                    uow.clear_procedure_type_defaults(&id).await
                })
            }))
            .await
            .map_err(|e| match e.downcast::<ProcedureOrchestrationTask>() {
                Ok(refusal) => refusal,
                Err(e) => {
                    tracing::error!(target: BACKEND, err = ?e, "delete_procedure_type: unit of work failed");
                    ProcedureOrchestrationTask::DatabaseError
                }
            })?;

        self.procedure_type_service.notify_procedure_types_updated();
        self.patient_service.notify_patients_updated();
        Ok(())
    }

    /// PRO-290, PRO-291 — delete a fund; the patients whose latest fund it is lose
    /// that default. A fund procedures or fund payment groups use is refused.
    pub async fn delete_fund(&self, id: &str) -> Result<(), ProcedureOrchestrationError> {
        let id = id.to_string();
        self.deletion
            .run(Box::new(move |uow| {
                Box::pin(async move {
                    if !uow.delete_fund(&id).await? {
                        let (procedure_count, payment_group_count) =
                            uow.count_fund_uses(&id).await?;
                        if procedure_count + payment_group_count > 0 {
                            return Err(ProcedureOrchestrationTask::FundInUse {
                                procedure_count,
                                payment_group_count,
                            }
                            .into());
                        }
                        if uow.fund_exists(&id).await? {
                            anyhow::bail!("fund refused by a reference nothing counts");
                        }
                        // An unknown id changes nothing.
                        return Ok(());
                    }
                    uow.clear_fund_defaults(&id).await
                })
            }))
            .await
            .map_err(|e| match e.downcast::<ProcedureOrchestrationTask>() {
                Ok(refusal) => refusal,
                Err(e) => {
                    tracing::error!(target: BACKEND, err = ?e, "delete_fund: unit of work failed");
                    ProcedureOrchestrationTask::DatabaseError
                }
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
    use crate::context::procedure::ProcedureError;
    use crate::shared::event_bus::EventBus;
    use crate::use_cases::procedure_orchestration::uow::{DeletionOperation, DeletionUnitOfWork};

    /// Records the writes an operation asks for; fails the run when told to.
    #[derive(Default)]
    struct RecordingDeletion {
        writes: Arc<Mutex<Vec<String>>>,
        fail: bool,
        /// The type's row is absent (unknown id) or refused by a procedure.
        not_deleted: bool,
        /// How many procedures use the type.
        procedures_using: usize,
        /// (procedures, fund payment groups) that use the fund.
        fund_uses: (usize, usize),
        /// The refused row is still stored (a reference nothing counts).
        still_stored: bool,
    }

    struct RecordingUnitOfWork {
        writes: Arc<Mutex<Vec<String>>>,
        not_deleted: bool,
        procedures_using: usize,
        fund_uses: (usize, usize),
        still_stored: bool,
    }

    impl RecordingUnitOfWork {
        fn record(&self, write: String) -> anyhow::Result<()> {
            self.writes.lock().unwrap().push(write);
            Ok(())
        }
    }

    #[async_trait::async_trait]
    impl DeletionUnitOfWork for RecordingUnitOfWork {
        async fn delete_procedure_type(&mut self, id: &str) -> anyhow::Result<bool> {
            self.record(format!("delete_procedure_type {id}"))?;
            Ok(!self.not_deleted)
        }
        async fn count_procedures_of_type(&mut self, id: &str) -> anyhow::Result<usize> {
            self.record(format!("count_procedures_of_type {id}"))?;
            Ok(self.procedures_using)
        }
        async fn clear_procedure_type_defaults(&mut self, id: &str) -> anyhow::Result<()> {
            self.record(format!("clear_procedure_type_defaults {id}"))
        }
        async fn delete_fund(&mut self, id: &str) -> anyhow::Result<bool> {
            self.record(format!("delete_fund {id}"))?;
            Ok(!self.not_deleted)
        }
        async fn count_fund_uses(&mut self, id: &str) -> anyhow::Result<(usize, usize)> {
            self.record(format!("count_fund_uses {id}"))?;
            Ok(self.fund_uses)
        }
        async fn procedure_type_exists(&mut self, id: &str) -> anyhow::Result<bool> {
            self.record(format!("procedure_type_exists {id}"))?;
            Ok(self.still_stored)
        }
        async fn fund_exists(&mut self, id: &str) -> anyhow::Result<bool> {
            self.record(format!("fund_exists {id}"))?;
            Ok(self.still_stored)
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
                not_deleted: self.not_deleted,
                procedures_using: self.procedures_using,
                fund_uses: self.fund_uses,
                still_stored: self.still_stored,
            };
            operation(&mut uow).await
        }
    }

    fn orchestrator(deletion: RecordingDeletion) -> DeletionOrchestrator {
        orchestrator_on(deletion, Arc::new(EventBus::new()))
    }

    fn orchestrator_on(deletion: RecordingDeletion, bus: Arc<EventBus>) -> DeletionOrchestrator {
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

    /// R24 — a type procedures use is refused with their count, and nothing else is
    /// written.
    #[tokio::test]
    async fn test_589_a_type_in_use_is_refused_with_the_count() {
        let deletion = RecordingDeletion {
            not_deleted: true,
            procedures_using: 3,
            ..Default::default()
        };
        let writes = deletion.writes.clone();

        let result = orchestrator(deletion).delete_procedure_type("type-1").await;

        assert!(matches!(
            result,
            Err(ProcedureOrchestrationError::Task(
                ProcedureOrchestrationTask::ProcedureTypeInUse { procedure_count: 3 }
            ))
        ));
        assert_eq!(
            *writes.lock().unwrap(),
            vec![
                "delete_procedure_type type-1",
                "count_procedures_of_type type-1"
            ]
        );
    }

    /// An unknown id is not an error, and nothing else is written.
    #[tokio::test]
    async fn test_589_an_unknown_type_changes_nothing() {
        let deletion = RecordingDeletion {
            not_deleted: true,
            ..Default::default()
        };
        let writes = deletion.writes.clone();

        let result = orchestrator(deletion).delete_procedure_type("type-1").await;

        assert!(result.is_ok(), "{result:?}");
        assert_eq!(
            *writes.lock().unwrap(),
            vec![
                "delete_procedure_type type-1",
                "count_procedures_of_type type-1",
                "procedure_type_exists type-1"
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

    /// PRO-291 — a fund procedures or payment groups use is refused with both counts,
    /// and nothing else is written.
    #[tokio::test]
    async fn test_590_a_fund_in_use_is_refused_with_the_counts() {
        let deletion = RecordingDeletion {
            not_deleted: true,
            fund_uses: (2, 1),
            ..Default::default()
        };
        let writes = deletion.writes.clone();

        let result = orchestrator(deletion).delete_fund("fund-1").await;

        assert!(matches!(
            result,
            Err(ProcedureOrchestrationError::Task(
                ProcedureOrchestrationTask::FundInUse {
                    procedure_count: 2,
                    payment_group_count: 1
                }
            ))
        ));
        assert_eq!(
            *writes.lock().unwrap(),
            vec!["delete_fund fund-1", "count_fund_uses fund-1"]
        );
    }

    /// An unknown fund is not an error, and nothing else is written.
    #[tokio::test]
    async fn test_590_an_unknown_fund_changes_nothing() {
        let deletion = RecordingDeletion {
            not_deleted: true,
            ..Default::default()
        };
        let writes = deletion.writes.clone();

        let result = orchestrator(deletion).delete_fund("fund-1").await;

        assert!(result.is_ok(), "{result:?}");
        assert_eq!(
            *writes.lock().unwrap(),
            vec![
                "delete_fund fund-1",
                "count_fund_uses fund-1",
                "fund_exists fund-1"
            ]
        );
    }

    /// A refusal nothing counts is a fault, never a silent success.
    #[tokio::test]
    async fn test_590_a_refusal_nothing_counts_is_a_database_error() {
        let refused = || RecordingDeletion {
            not_deleted: true,
            still_stored: true,
            ..Default::default()
        };

        let fund = orchestrator(refused()).delete_fund("fund-1").await;
        let procedure_type = orchestrator(refused())
            .delete_procedure_type("type-1")
            .await;

        assert!(matches!(
            fund,
            Err(ProcedureOrchestrationError::Task(
                ProcedureOrchestrationTask::DatabaseError
            ))
        ));
        assert!(matches!(
            procedure_type,
            Err(ProcedureOrchestrationError::Task(
                ProcedureOrchestrationTask::DatabaseError
            ))
        ));
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
            Err(ProcedureOrchestrationError::Procedure(
                ProcedureError::ReservedTypeNotMutable
            ))
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

        assert!(matches!(
            type_result,
            Err(ProcedureOrchestrationError::Task(
                ProcedureOrchestrationTask::DatabaseError
            ))
        ));
        assert!(matches!(
            fund_result,
            Err(ProcedureOrchestrationError::Task(
                ProcedureOrchestrationTask::DatabaseError
            ))
        ));
    }

    /// PRO-292, PRO-293 — a deletion and an unknown fund are both signaled through
    /// `FundUpdated`; a refusal is not.
    #[tokio::test]
    async fn test_590_a_fund_deletion_is_signaled_and_a_refusal_is_not() {
        use crate::shared::event_bus::FundUpdated;
        let cases = [
            (RecordingDeletion::default(), 1),
            (
                RecordingDeletion {
                    not_deleted: true,
                    ..Default::default()
                },
                1,
            ),
            (
                RecordingDeletion {
                    not_deleted: true,
                    fund_uses: (1, 0),
                    ..Default::default()
                },
                0,
            ),
        ];
        for (deletion, events) in cases {
            let bus = Arc::new(EventBus::new());
            let mut changed = bus.subscribe::<FundUpdated>().expect("subscribe");

            let _ = orchestrator_on(deletion, bus).delete_fund("fund-1").await;

            let mut received = 0;
            while changed.try_recv().is_ok() {
                received += 1;
            }
            assert_eq!(received, events);
        }
    }
}

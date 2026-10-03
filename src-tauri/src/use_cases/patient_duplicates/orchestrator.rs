use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use chrono::NaiveDate;

use crate::context::patient::{Patient, PatientService};
use crate::context::procedure::ProcedureService;
use crate::shared::logger::BACKEND;

use super::error::{PatientDuplicatesError, PatientDuplicatesTask};
use super::pairs::{candidate_pairs, fold_name, pair_key, DuplicatePair, PatientSummary};
use super::uow::PatientMergeTransactionManager;

pub struct PatientDuplicatesOrchestrator {
    patient_service: Arc<PatientService>,
    procedure_service: Arc<ProcedureService>,
    patient_merge: Arc<dyn PatientMergeTransactionManager>,
}

impl PatientDuplicatesOrchestrator {
    pub fn new(
        patient_service: Arc<PatientService>,
        procedure_service: Arc<ProcedureService>,
        patient_merge: Arc<dyn PatientMergeTransactionManager>,
    ) -> Self {
        Self {
            patient_service,
            procedure_service,
            patient_merge,
        }
    }

    /// PDU-010 to PDU-013.
    pub async fn list_pairs(&self) -> Result<Vec<DuplicatePair>, PatientDuplicatesError> {
        let patients = self.patient_service.get_all_patients().await?;
        let procedures = self.procedure_service.read_all_procedures().await?;
        let dismissed: HashSet<(String, String)> = self
            .patient_service
            .read_duplicate_dismissals()
            .await?
            .iter()
            .map(|(a, b)| pair_key(a, b))
            .collect();

        // PDU-012 — per patient: how many procedures, and the latest date.
        let mut activity: HashMap<String, (u32, Option<NaiveDate>)> = HashMap::new();
        for procedure in procedures {
            let entry = activity.entry(procedure.patient_id).or_default();
            entry.0 = entry.0.saturating_add(1);
            entry.1 = entry.1.max(Some(procedure.procedure_date));
        }

        let summaries = patients
            .into_iter()
            .filter(|patient| !patient.is_anonymous)
            .filter_map(|patient| {
                let (procedure_count, latest_procedure_date) =
                    activity.get(&patient.id).copied().unwrap_or_default();
                Some(PatientSummary {
                    name: patient.name?,
                    id: patient.id,
                    ssn: patient.ssn,
                    procedure_count,
                    latest_procedure_date,
                })
            })
            .collect();
        Ok(candidate_pairs(summaries, &dismissed))
    }

    /// PDU-021 to PDU-026 — merge `other_id` into `kept_id`.
    pub async fn merge(&self, kept_id: &str, other_id: &str) -> Result<(), PatientDuplicatesError> {
        let (kept, other) = self.read_pair(kept_id, other_id).await?;
        if !same_name(&kept, &other) {
            return Err(PatientDuplicatesTask::NotACandidatePair.into());
        }

        let merged = kept.absorb(&other);
        let other_id = other.id;
        self.patient_merge
            .run(Box::new(move |uow| {
                Box::pin(async move {
                    uow.reassign_procedures(&other_id, &merged.id).await?;
                    uow.update_patient(&merged).await?;
                    uow.delete_patient(&other_id).await?;
                    uow.delete_dismissals_of(&other_id).await
                })
            }))
            .await
            .map_err(|e| {
                tracing::error!(target: BACKEND, err = ?e, "merge: unit of work failed");
                PatientDuplicatesTask::MergeFailed
            })?;

        self.patient_service.notify_patients_updated();
        self.procedure_service.notify_procedures_updated();
        tracing::info!(target: BACKEND, "Patients merged");
        Ok(())
    }

    /// PDU-030 to PDU-032.
    pub async fn dismiss(
        &self,
        first_id: &str,
        second_id: &str,
    ) -> Result<(), PatientDuplicatesError> {
        self.read_pair(first_id, second_id).await?;
        Ok(self
            .patient_service
            .dismiss_duplicate(first_id, second_id)
            .await?)
    }

    /// PDU-025, PDU-032 — two different patients that both exist and are not deleted.
    async fn read_pair(
        &self,
        first_id: &str,
        second_id: &str,
    ) -> Result<(Patient, Patient), PatientDuplicatesError> {
        if first_id == second_id {
            return Err(PatientDuplicatesTask::SamePatient.into());
        }
        Ok((self.read(first_id).await?, self.read(second_id).await?))
    }

    async fn read(&self, id: &str) -> Result<Patient, PatientDuplicatesError> {
        self.patient_service
            .read_patient(id)
            .await?
            .ok_or_else(|| PatientDuplicatesTask::PatientNotFound.into())
    }
}

/// PDU-010's name rule, for two patients read on their own.
fn same_name(a: &Patient, b: &Patient) -> bool {
    if a.is_anonymous || b.is_anonymous {
        return false;
    }
    match (a.name.as_deref(), b.name.as_deref()) {
        (Some(a), Some(b)) => {
            let folded = fold_name(a);
            !folded.is_empty() && folded == fold_name(b)
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::super::uow::{PatientMergeOperation, PatientMergeUnitOfWork};
    use super::*;
    use crate::context::patient::MockPatientRepository;
    use crate::context::procedure::{
        MockProcedureRepository, PaymentMethod, Procedure, ProcedureStatus,
    };
    use crate::shared::event_bus::{EventBus, PatientUpdated, ProcedureUpdated};

    fn patient(id: &str, name: &str, ssn: Option<&str>) -> Patient {
        Patient::restore(
            id.to_string(),
            false,
            Some(name.to_string()),
            ssn.map(str::to_string),
            None,
            None,
            None,
            None,
        )
    }

    fn procedure(id: &str, patient_id: &str, date: &str) -> Procedure {
        Procedure::restore(
            id.to_string(),
            patient_id.to_string(),
            None,
            "type-1".to_string(),
            date.parse().expect("date"),
            100_000,
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::None,
        )
    }

    /// Records what the merge asked for, in order; nothing is stored.
    #[derive(Default)]
    struct RecordingMerge {
        calls: Arc<Mutex<Vec<String>>>,
    }

    struct RecordingUnitOfWork {
        calls: Arc<Mutex<Vec<String>>>,
    }

    impl RecordingUnitOfWork {
        fn record(&self, call: String) {
            if let Ok(mut calls) = self.calls.lock() {
                calls.push(call);
            }
        }
    }

    #[async_trait::async_trait]
    impl PatientMergeUnitOfWork for RecordingUnitOfWork {
        async fn reassign_procedures(&mut self, from_id: &str, to_id: &str) -> anyhow::Result<()> {
            self.record(format!("reassign {from_id} -> {to_id}"));
            Ok(())
        }
        async fn update_patient(&mut self, patient: &Patient) -> anyhow::Result<()> {
            self.record(format!(
                "update {} ssn={}",
                patient.id,
                patient.ssn.as_deref().unwrap_or("none")
            ));
            Ok(())
        }
        async fn delete_patient(&mut self, patient_id: &str) -> anyhow::Result<()> {
            self.record(format!("delete {patient_id}"));
            Ok(())
        }
        async fn delete_dismissals_of(&mut self, patient_id: &str) -> anyhow::Result<()> {
            self.record(format!("delete dismissals of {patient_id}"));
            Ok(())
        }
    }

    #[async_trait::async_trait]
    impl PatientMergeTransactionManager for RecordingMerge {
        async fn run(&self, operation: PatientMergeOperation) -> anyhow::Result<()> {
            let mut uow = RecordingUnitOfWork {
                calls: self.calls.clone(),
            };
            operation(&mut uow).await
        }
    }

    fn orchestrator(
        patients: MockPatientRepository,
        procedures: MockProcedureRepository,
    ) -> (PatientDuplicatesOrchestrator, Arc<Mutex<Vec<String>>>) {
        orchestrator_on(Arc::new(EventBus::new()), patients, procedures)
    }

    fn orchestrator_on(
        bus: Arc<EventBus>,
        patients: MockPatientRepository,
        procedures: MockProcedureRepository,
    ) -> (PatientDuplicatesOrchestrator, Arc<Mutex<Vec<String>>>) {
        let merge = RecordingMerge::default();
        let calls = merge.calls.clone();
        (
            PatientDuplicatesOrchestrator::new(
                Arc::new(PatientService::new(Arc::new(patients), bus.clone())),
                Arc::new(ProcedureService::new(Arc::new(procedures), bus)),
                Arc::new(merge),
            ),
            calls,
        )
    }

    fn recorded(calls: &Arc<Mutex<Vec<String>>>) -> Vec<String> {
        calls.lock().map(|calls| calls.clone()).unwrap_or_default()
    }

    fn task(result: Result<(), PatientDuplicatesError>) -> Option<PatientDuplicatesTask> {
        match result {
            Err(PatientDuplicatesError::Task(task)) => Some(task),
            _ => None,
        }
    }

    fn patients_by_id(stored: Vec<Patient>) -> MockPatientRepository {
        let mut repo = MockPatientRepository::new();
        repo.expect_read_patient()
            .returning(move |id| Ok(stored.iter().find(|patient| patient.id == id).cloned()));
        repo
    }

    #[tokio::test]
    async fn test_pdu_012_a_pair_carries_each_patients_count_and_latest_date() {
        let mut patients = MockPatientRepository::new();
        patients.expect_read_all_patients().returning(|| {
            Ok(vec![
                patient("a", "Marie Dupont", None),
                patient("b", "marie dupont", Some("1234567890123")),
                patient("c", "Jean Martin", None),
            ])
        });
        patients
            .expect_read_duplicate_dismissals()
            .returning(|| Ok(vec![]));
        let mut procedures = MockProcedureRepository::new();
        procedures.expect_read_all_procedures().returning(|| {
            Ok(vec![
                procedure("1", "b", "2026-01-10"),
                procedure("2", "b", "2026-03-10"),
                procedure("3", "c", "2026-02-01"),
            ])
        });

        let (orchestrator, _) = orchestrator(patients, procedures);
        let pairs = orchestrator.list_pairs().await.expect("pairs");

        assert_eq!(pairs.len(), 1);
        let pair = pairs.first().expect("one pair");
        assert_eq!(
            (pair.first.id.as_str(), pair.second.id.as_str()),
            ("b", "a")
        );
        assert_eq!(pair.first.procedure_count, 2);
        assert_eq!(pair.first.latest_procedure_date, "2026-03-10".parse().ok());
        assert_eq!(pair.second.procedure_count, 0);
        assert_eq!(pair.second.latest_procedure_date, None);
    }

    #[tokio::test]
    async fn test_pdu_010_anonymous_patients_and_dismissed_pairs_are_left_out() {
        let mut anonymous = patient("x", "Marie Dupont", None);
        anonymous.is_anonymous = true;
        let mut patients = MockPatientRepository::new();
        patients.expect_read_all_patients().returning(move || {
            Ok(vec![
                patient("a", "Marie Dupont", None),
                patient("b", "Marie Dupont", None),
                anonymous.clone(),
            ])
        });
        patients
            .expect_read_duplicate_dismissals()
            .returning(|| Ok(vec![("a".to_string(), "b".to_string())]));
        let mut procedures = MockProcedureRepository::new();
        procedures
            .expect_read_all_procedures()
            .returning(|| Ok(vec![]));

        let (orchestrator, _) = orchestrator(patients, procedures);

        assert!(orchestrator.list_pairs().await.expect("pairs").is_empty());
    }

    #[tokio::test]
    async fn test_pdu_021_a_merge_asks_for_its_four_writes_in_one_unit() {
        let patients = patients_by_id(vec![
            patient("kept", "Marie Dupont", None),
            patient("other", "MARIE DUPONT", Some("1234567890123")),
        ]);

        let (orchestrator, calls) = orchestrator(patients, MockProcedureRepository::new());
        orchestrator.merge("kept", "other").await.expect("merge");

        assert_eq!(
            recorded(&calls),
            vec![
                "reassign other -> kept",
                "update kept ssn=1234567890123",
                "delete other",
                "delete dismissals of other",
            ]
        );
    }

    #[tokio::test]
    async fn test_pdu_025_a_merge_is_refused_and_nothing_is_written() {
        let stored = vec![
            patient("a", "Marie Dupont", None),
            patient("b", "Jean Martin", None),
        ];

        for (kept, other, expected) in [
            ("a", "a", PatientDuplicatesTask::SamePatient),
            ("a", "gone", PatientDuplicatesTask::PatientNotFound),
            ("gone", "a", PatientDuplicatesTask::PatientNotFound),
            ("a", "b", PatientDuplicatesTask::NotACandidatePair),
        ] {
            let (orchestrator, calls) = orchestrator(
                patients_by_id(stored.clone()),
                MockProcedureRepository::new(),
            );

            assert_eq!(task(orchestrator.merge(kept, other).await), Some(expected));
            assert!(recorded(&calls).is_empty());
        }
    }

    #[tokio::test]
    async fn test_pdu_028_a_merge_publishes_both_events_and_a_refused_one_none() {
        let bus = Arc::new(EventBus::new());
        let mut patients_changed = bus.subscribe::<PatientUpdated>().expect("subscribe");
        let mut procedures_changed = bus.subscribe::<ProcedureUpdated>().expect("subscribe");
        let stored = vec![
            patient("kept", "Marie Dupont", None),
            patient("other", "Marie Dupont", None),
            patient("else", "Jean Martin", None),
        ];
        let (orchestrator, _) =
            orchestrator_on(bus, patients_by_id(stored), MockProcedureRepository::new());

        assert!(orchestrator.merge("kept", "else").await.is_err());
        assert!(patients_changed.try_recv().is_err());
        assert!(procedures_changed.try_recv().is_err());

        orchestrator.merge("kept", "other").await.expect("merge");
        assert!(patients_changed.try_recv().is_ok());
        assert!(procedures_changed.try_recv().is_ok());
    }

    #[tokio::test]
    async fn test_pdu_025_an_anonymous_patient_is_not_a_candidate() {
        let mut anonymous = patient("b", "Marie Dupont", None);
        anonymous.is_anonymous = true;
        let stored = vec![patient("a", "Marie Dupont", None), anonymous];

        let (orchestrator, calls) =
            orchestrator(patients_by_id(stored), MockProcedureRepository::new());

        assert_eq!(
            task(orchestrator.merge("a", "b").await),
            Some(PatientDuplicatesTask::NotACandidatePair)
        );
        assert!(recorded(&calls).is_empty());
    }

    #[tokio::test]
    async fn test_pdu_032_any_two_patients_can_be_dismissed_and_no_event_is_published() {
        let bus = Arc::new(EventBus::new());
        let mut patients_changed = bus.subscribe::<PatientUpdated>().expect("subscribe");
        let mut patients = patients_by_id(vec![
            patient("a", "Marie Dupont", None),
            patient("b", "Jean Martin", None),
        ]);
        patients
            .expect_save_duplicate_dismissal()
            .times(1)
            .returning(|_, _| Ok(()));

        let (orchestrator, _) = orchestrator_on(bus, patients, MockProcedureRepository::new());

        assert!(orchestrator.dismiss("a", "b").await.is_ok());
        assert!(patients_changed.try_recv().is_err());
    }

    #[tokio::test]
    async fn test_pdu_030_a_dismissal_is_recorded_for_the_pair() {
        let mut patients = patients_by_id(vec![
            patient("a", "Marie Dupont", None),
            patient("b", "Marie Dupont", None),
        ]);
        patients
            .expect_save_duplicate_dismissal()
            .withf(|first, second| first == "a" && second == "b")
            .times(1)
            .returning(|_, _| Ok(()));

        let (orchestrator, _) = orchestrator(patients, MockProcedureRepository::new());

        assert!(orchestrator.dismiss("a", "b").await.is_ok());
    }

    #[tokio::test]
    async fn test_pdu_032_a_dismissal_is_refused_for_one_patient_or_a_missing_one() {
        let stored = vec![patient("a", "Marie Dupont", None)];

        let (same, _) = orchestrator(
            patients_by_id(stored.clone()),
            MockProcedureRepository::new(),
        );
        assert_eq!(
            task(same.dismiss("a", "a").await),
            Some(PatientDuplicatesTask::SamePatient)
        );

        let (missing, _) = orchestrator(patients_by_id(stored), MockProcedureRepository::new());
        assert_eq!(
            task(missing.dismiss("a", "gone").await),
            Some(PatientDuplicatesTask::PatientNotFound)
        );
    }
}

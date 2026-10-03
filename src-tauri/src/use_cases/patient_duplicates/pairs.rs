//! Which patients form a candidate pair (PDU-010 to PDU-013). Pure: no I/O.

use std::cmp::Ordering;
use std::collections::{BTreeMap, HashSet};

use chrono::NaiveDate;
use serde::Serialize;
use specta::Type;
use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};

/// PDU-012 — what the list shows of one patient of a pair.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
pub struct PatientSummary {
    pub id: String,
    pub name: String,
    pub ssn: Option<String>,
    /// Procedures that are not deleted.
    pub procedure_count: u32,
    #[specta(type = Option<String>)]
    pub latest_procedure_date: Option<NaiveDate>,
}

/// PDU-010 — two patients that carry the same name.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
pub struct DuplicatePair {
    /// The name as recorded on the first patient (PDU-012).
    pub name: String,
    pub first: PatientSummary,
    pub second: PatientSummary,
}

/// PDU-010 — the form two names are compared in: surrounding spaces, case and
/// accents ignored.
pub fn fold_name(name: &str) -> String {
    name.trim()
        .nfd()
        .filter(|c| !is_combining_mark(*c))
        .collect::<String>()
        .to_lowercase()
}

/// A pair has no direction: the smaller identifier first.
pub fn pair_key(a: &str, b: &str) -> (String, String) {
    if a <= b {
        (a.to_string(), b.to_string())
    } else {
        (b.to_string(), a.to_string())
    }
}

/// PDU-013 — within a pair: most procedures first, then the one with an INS,
/// then by identifier.
fn precedence(a: &PatientSummary, b: &PatientSummary) -> Ordering {
    let has_ssn = |p: &PatientSummary| p.ssn.as_deref().is_some_and(|ssn| !ssn.trim().is_empty());
    b.procedure_count
        .cmp(&a.procedure_count)
        .then_with(|| has_ssn(b).cmp(&has_ssn(a)))
        .then_with(|| a.id.cmp(&b.id))
}

/// PDU-010, PDU-011, PDU-013 — every two patients that share a name, minus the
/// dismissed pairs, ordered by name.
pub fn candidate_pairs(
    patients: Vec<PatientSummary>,
    dismissed: &HashSet<(String, String)>,
) -> Vec<DuplicatePair> {
    let mut by_name: BTreeMap<String, Vec<PatientSummary>> = BTreeMap::new();
    for patient in patients {
        let key = fold_name(&patient.name);
        if !key.is_empty() {
            by_name.entry(key).or_default().push(patient);
        }
    }

    let mut pairs = Vec::new();
    for mut group in by_name.into_values() {
        group.sort_by(precedence);
        for (i, first) in group.iter().enumerate() {
            for second in group.iter().skip(i + 1) {
                if dismissed.contains(&pair_key(&first.id, &second.id)) {
                    continue;
                }
                pairs.push(DuplicatePair {
                    name: first.name.clone(),
                    first: first.clone(),
                    second: second.clone(),
                });
            }
        }
    }
    pairs
}

#[cfg(test)]
mod tests {
    use super::*;

    fn patient(id: &str, name: &str, ssn: Option<&str>, procedures: u32) -> PatientSummary {
        PatientSummary {
            id: id.to_string(),
            name: name.to_string(),
            ssn: ssn.map(str::to_string),
            procedure_count: procedures,
            latest_procedure_date: None,
        }
    }

    fn ids(pairs: &[DuplicatePair]) -> Vec<(&str, &str)> {
        pairs
            .iter()
            .map(|p| (p.first.id.as_str(), p.second.id.as_str()))
            .collect()
    }

    #[test]
    fn test_pdu_010_same_name_ignoring_case_accents_and_spaces_is_a_pair() {
        let pairs = candidate_pairs(
            vec![
                patient("a", "Dubois Élodie", None, 0),
                patient("b", "  dubois elodie ", None, 0),
                patient("c", "Dubois Elodie-Anne", None, 0),
            ],
            &HashSet::new(),
        );
        assert_eq!(ids(&pairs), vec![("a", "b")]);
    }

    #[test]
    fn test_pdu_010_a_dismissed_pair_is_not_proposed_in_either_direction() {
        let dismissed = HashSet::from([pair_key("b", "a")]);
        let pairs = candidate_pairs(
            vec![
                patient("a", "Martin", None, 0),
                patient("b", "Martin", None, 0),
            ],
            &dismissed,
        );
        assert!(pairs.is_empty());
    }

    #[test]
    fn test_pdu_011_three_patients_with_one_name_give_three_pairs() {
        let pairs = candidate_pairs(
            vec![
                patient("a", "Petit", None, 0),
                patient("b", "Petit", None, 0),
                patient("c", "Petit", None, 0),
            ],
            &HashSet::new(),
        );
        assert_eq!(ids(&pairs), vec![("a", "b"), ("a", "c"), ("b", "c")]);
    }

    #[test]
    fn test_pdu_013_pairs_are_ordered_by_name_ignoring_case_and_accents() {
        let pairs = candidate_pairs(
            vec![
                patient("z1", "Zola", None, 0),
                patient("z2", "Zola", None, 0),
                patient("e1", "Émile", None, 0),
                patient("e2", "emile", None, 0),
            ],
            &HashSet::new(),
        );
        assert_eq!(ids(&pairs), vec![("e1", "e2"), ("z1", "z2")]);
    }

    #[test]
    fn test_pdu_013_most_procedures_first_then_an_ins_then_the_identifier() {
        let by_count = candidate_pairs(
            vec![
                patient("a", "Martin", None, 1),
                patient("b", "Martin", None, 5),
            ],
            &HashSet::new(),
        );
        assert_eq!(ids(&by_count), vec![("b", "a")]);

        let by_ins = candidate_pairs(
            vec![
                patient("a", "Martin", None, 2),
                patient("b", "Martin", Some("1234567890123"), 2),
            ],
            &HashSet::new(),
        );
        assert_eq!(ids(&by_ins), vec![("b", "a")]);

        let by_id = candidate_pairs(
            vec![
                patient("b", "Martin", None, 2),
                patient("a", "Martin", None, 2),
            ],
            &HashSet::new(),
        );
        assert_eq!(ids(&by_id), vec![("a", "b")]);
    }

    #[test]
    fn test_pdu_012_the_pair_carries_the_name_of_its_first_patient() {
        let pairs = candidate_pairs(
            vec![
                patient("a", "MARTIN Claire", None, 1),
                patient("b", "Martin Claire", None, 3),
            ],
            &HashSet::new(),
        );
        assert_eq!(
            pairs.first().map(|p| p.name.as_str()),
            Some("Martin Claire")
        );
    }
}

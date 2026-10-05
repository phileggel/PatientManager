//! Types the core and the command adapters both use: they live in the core (B47).

use serde::{Deserialize, Serialize};
use specta::Type;

/// Patient candidate for batch import - semantically different from Patient (lacks ID, created_at)
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct PatientCandidate {
    pub temp_id: String,
    pub name: Option<String>,
    pub ssn: Option<String>,
}

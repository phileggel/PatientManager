use serde::{Deserialize, Serialize};
use specta::Type;

/// Tauri command: Health check
#[tauri::command]
#[specta::specta]
pub fn check_health() -> HealthResponse {
    HealthResponse {
        status: "OK".to_string(),
    }
}

#[derive(Serialize, Deserialize, Type)]
pub struct HealthResponse {
    pub status: String,
}

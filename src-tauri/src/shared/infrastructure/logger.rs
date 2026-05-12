#[tauri::command]
#[specta::specta]
pub fn log_frontend(level: String, message: String) {
    match level.as_str() {
        "trace" => tracing::trace!(target: FRONTEND, "{}", message),
        "debug" => tracing::debug!(target: FRONTEND, "{}", message),
        "info" => tracing::info!(target: FRONTEND,  "{}", message),
        "warn" => tracing::warn!(target: FRONTEND,  "{}", message),
        "error" => tracing::error!(target: FRONTEND, "{}", message),
        _ => tracing::info!(target: FRONTEND,  "{}", message),
    }
}

pub const FRONTEND: &str = "frontend";
pub const BACKEND: &str = "backend";

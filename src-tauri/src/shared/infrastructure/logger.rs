#[tauri::command]
#[specta::specta]
pub fn log_frontend(level: String, message: String) {
    // One log line per message: a line break in a forwarded message could
    // otherwise start a line that reads as written by the backend (DGR-022).
    let message = message.replace(['\n', '\r'], " ");
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

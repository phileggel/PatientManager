#[cfg(feature = "app")]
#[tauri::command]
#[specta::specta]
pub fn log_frontend(level: String, message: String) {
    let message = frontend_line(&message);
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

/// The longest message written from the WebView, in bytes (#465).
#[cfg(any(feature = "app", test))]
const FRONTEND_LINE_MAX: usize = 2048;

/// A message from the WebView as the log writes it. One line per message: a
/// line break could otherwise start a line that reads as written by the backend
/// (DGR-022). Capped: the WebView is outside the trust boundary, and a message
/// of any size would otherwise reach the log file whole (#465).
#[cfg(any(feature = "app", test))]
fn frontend_line(message: &str) -> String {
    let line = message.replace(['\n', '\r'], " ");
    if line.len() <= FRONTEND_LINE_MAX {
        return line;
    }
    let mut end = FRONTEND_LINE_MAX;
    while !line.is_char_boundary(end) {
        end -= 1;
    }
    format!("{} [truncated]", &line[..end])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_frontend_line_with_line_breaks_is_one_line() {
        assert_eq!(frontend_line("a\nb\rc"), "a b c");
    }

    #[test]
    fn test_frontend_line_at_the_cap_is_kept_whole() {
        let message = "x".repeat(FRONTEND_LINE_MAX);
        assert_eq!(frontend_line(&message), message);
    }

    #[test]
    fn test_frontend_line_past_the_cap_is_truncated() {
        let line = frontend_line(&"x".repeat(FRONTEND_LINE_MAX * 10));
        assert_eq!(
            line,
            format!("{} [truncated]", "x".repeat(FRONTEND_LINE_MAX))
        );
    }

    #[test]
    fn test_frontend_line_past_the_cap_cuts_on_a_character_boundary() {
        // "é" is two bytes: the cap falls inside the last one
        let line = frontend_line(&format!("x{}", "é".repeat(FRONTEND_LINE_MAX)));
        assert!(line.ends_with(" [truncated]"));
        assert!(line.len() <= FRONTEND_LINE_MAX + " [truncated]".len());
    }
}

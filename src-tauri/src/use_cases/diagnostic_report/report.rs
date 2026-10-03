//! The content of the diagnostic report (DGR-020 to DGR-025, DGR-030): the
//! database's technical state comes from `DatabaseDiagnostics`, the log lines
//! from the log file.

use std::fmt::Write as _;
use std::path::Path;

use crate::shared::db_diagnostics::DatabaseDiagnostics;

/// How many trailing log lines the report carries (DGR-021).
const LOG_LINES: usize = 200;
/// Unambiguous characters for a support code read aloud or retyped: no 0/O, 1/I.
const CODE_ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/// How a backend line names its target in the log file (`shared::logger::BACKEND`).
const BACKEND_LOG_PREFIX: &str = "backend:";
/// Beside the log file: the version that wrote it (DGR-030).
const LOG_VERSION_MARKER: &str = "app.log.version";

/// DGR-020 — an eight-character code, `XXXX-XXXX`.
pub fn new_support_code() -> String {
    let bytes = uuid::Uuid::new_v4().into_bytes();
    // Bytes 6 and 8 of a v4 UUID carry fixed version and variant bits: the
    // code only uses bytes that are random in full.
    let random = bytes
        .iter()
        .enumerate()
        .filter(|(i, _)| *i != 6 && *i != 8)
        .map(|(_, byte)| *byte);
    let mut code = String::with_capacity(9);
    for (i, byte) in random.take(8).enumerate() {
        if i == 4 {
            code.push('-');
        }
        let pick = CODE_ALPHABET
            .iter()
            .cycle()
            .nth(usize::from(byte))
            .copied()
            .unwrap_or(b'A');
        code.push(char::from(pick));
    }
    code
}

/// DGR-030 — empty the log when another version wrote it, so the report's log
/// lines only ever come from code that never logs patient data (B44). Runs
/// before logging starts, so it reports failures to the caller instead.
pub fn reset_log_on_version_change(log_dir: &Path, version: &str) -> std::io::Result<()> {
    let marker = log_dir.join(LOG_VERSION_MARKER);
    let written_by = std::fs::read_to_string(&marker).unwrap_or_default();
    if written_by.trim() == version {
        return Ok(());
    }
    let log_file = log_dir.join("app.log");
    if log_file.exists() {
        std::fs::remove_file(&log_file)?;
    }
    std::fs::write(&marker, version)
}

/// DGR-021 — the whole report. DGR-025: a section that cannot be collected says
/// so and the report is still produced.
pub async fn build(
    database: &dyn DatabaseDiagnostics,
    log_file: &Path,
    support_code: &str,
) -> String {
    let mut out = String::new();
    let _ = writeln!(out, "PatientManager diagnostic report");
    let _ = writeln!(out, "Support code: {support_code}");
    let _ = writeln!(
        out,
        "Generated (UTC): {}",
        chrono::Utc::now().format("%Y-%m-%d %H:%M:%S")
    );
    let _ = writeln!(out, "App version: {}", env!("CARGO_PKG_VERSION"));
    let _ = writeln!(
        out,
        "System: {} {}",
        std::env::consts::OS,
        std::env::consts::ARCH
    );

    section(&mut out, "Migrations", database.migrations().await);
    section(
        &mut out,
        "Integrity check",
        database.integrity_check().await,
    );
    section(
        &mut out,
        "Foreign key check",
        database.foreign_key_check().await,
    );
    section(&mut out, "Row counts", database.row_counts().await);
    section(&mut out, "Last log lines", last_log_lines(log_file));
    out
}

fn section(out: &mut String, title: &str, lines: anyhow::Result<Vec<String>>) {
    let _ = writeln!(out, "\n== {title} ==");
    match lines {
        Ok(lines) if lines.is_empty() => {
            let _ = writeln!(out, "(none)");
        }
        Ok(lines) => {
            for line in lines {
                let _ = writeln!(out, "{line}");
            }
        }
        // The error text names a SQLite or I/O failure, never a row's content.
        Err(e) => {
            let _ = writeln!(out, "unavailable: {e}");
        }
    }
}

/// DGR-022 — only lines the backend wrote. A line forwarded from the screen
/// (`frontend` target) or written by a dependency can carry a file name or a
/// message, so it never reaches the report; backend lines carry no patient data
/// (B44). The line format is tracing's: `<time> <LEVEL> <target>: <message>`.
fn is_backend_line(line: &str) -> bool {
    line.split_whitespace().nth(2) == Some(BACKEND_LOG_PREFIX)
}

fn last_log_lines(log_file: &Path) -> anyhow::Result<Vec<String>> {
    let bytes = match std::fs::read(log_file) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(vec!["(no log file)".to_string()]);
        }
        // The kind only: an I/O error's text can carry the path.
        Err(e) => anyhow::bail!("the log file cannot be read ({})", e.kind()),
    };
    let text = String::from_utf8_lossy(&bytes);
    let lines: Vec<&str> = text.lines().filter(|line| is_backend_line(line)).collect();
    let skipped = lines.len().saturating_sub(LOG_LINES);
    Ok(lines
        .into_iter()
        .skip(skipped)
        .map(str::to_string)
        .collect())
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// The database's state as canned lines; `migrations` can be made to fail.
    pub(crate) struct FakeDatabase {
        pub migrations_fail: bool,
    }

    impl FakeDatabase {
        pub(crate) fn healthy() -> Self {
            Self {
                migrations_fail: false,
            }
        }
    }

    #[async_trait::async_trait]
    impl DatabaseDiagnostics for FakeDatabase {
        async fn migrations(&self) -> anyhow::Result<Vec<String>> {
            if self.migrations_fail {
                anyhow::bail!("no such table");
            }
            Ok(vec!["20260308 init ok".to_string()])
        }
        async fn integrity_check(&self) -> anyhow::Result<Vec<String>> {
            Ok(vec!["ok".to_string()])
        }
        async fn foreign_key_check(&self) -> anyhow::Result<Vec<String>> {
            Ok(vec!["0 violations".to_string()])
        }
        async fn row_counts(&self) -> anyhow::Result<Vec<String>> {
            Ok(vec!["fund: 1".to_string(), "patient: 1".to_string()])
        }
    }

    // Values a leak would carry: chosen so they cannot appear in the report by accident.
    const PATIENT_NAME: &str = "Zzyxa Qwortuipe";
    const PATIENT_SSN: &str = "2990199123456";
    const FUND_NAME: &str = "Caisse Vraiment Unique";

    #[tokio::test]
    async fn test_dgr_021_the_report_carries_version_schema_checks_and_counts() {
        let database = FakeDatabase::healthy();
        let dir = tempfile::tempdir().expect("tempdir");
        let log = dir.path().join("app.log");
        std::fs::write(
            &log,
            "2026-01-01T10:00:00Z  INFO backend: first line\n2026-01-01T10:00:01Z  WARN backend: last line\n",
        )
        .expect("write log");

        let report = build(&database, &log, "ABCD-EFGH").await;

        assert!(report.contains("Support code: ABCD-EFGH"));
        assert!(report.contains(&format!("App version: {}", env!("CARGO_PKG_VERSION"))));
        assert!(report.contains("== Migrations ==\n20260308 init ok\n"));
        assert!(report.contains("== Integrity check ==\nok\n"));
        assert!(report.contains("== Foreign key check ==\n0 violations\n"));
        assert!(report.contains("patient: 1\n"));
        assert!(report.contains("fund: 1\n"));
        assert!(report.contains(
            "== Last log lines ==\n2026-01-01T10:00:00Z  INFO backend: first line\n2026-01-01T10:00:01Z  WARN backend: last line\n"
        ));
    }

    #[tokio::test]
    async fn test_dgr_021_only_the_last_log_lines_are_kept() {
        let database = FakeDatabase::healthy();
        let dir = tempfile::tempdir().expect("tempdir");
        let log = dir.path().join("app.log");
        let lines: Vec<String> = (0..LOG_LINES + 5)
            .map(|i| format!("2026-01-01T10:00:00Z  INFO backend: line {i}"))
            .collect();
        std::fs::write(&log, lines.join("\n")).expect("write log");

        let report = build(&database, &log, "ABCD-EFGH").await;

        assert!(!report.contains(": line 4\n"), "older lines are left out");
        assert!(report.contains(": line 5\n"));
        assert!(report.contains(&format!(": line {}", LOG_LINES + 4)));
    }

    #[tokio::test]
    async fn test_dgr_022_a_line_forwarded_from_the_screen_never_reaches_the_report() {
        let database = FakeDatabase::healthy();
        let dir = tempfile::tempdir().expect("tempdir");
        let log = dir.path().join("app.log");
        std::fs::write(
            &log,
            format!(
                "2026-01-01T10:00:00Z  INFO backend: kept\n\
                 2026-01-01T10:00:01Z DEBUG frontend: import of {PATIENT_NAME}.xlsx\n\
                 2026-01-01T10:00:02Z DEBUG some_crate::module: {PATIENT_SSN}\n\
                 a continuation line naming {FUND_NAME}\n"
            ),
        )
        .expect("write log");

        let report = build(&database, &log, "ABCD-EFGH").await;

        assert!(report.contains("backend: kept\n"));
        for leaked in [PATIENT_NAME, PATIENT_SSN, FUND_NAME] {
            assert!(
                !report.contains(leaked),
                "the report must not contain {leaked}"
            );
        }
    }

    #[tokio::test]
    async fn test_dgr_025_a_section_that_fails_is_reported_and_the_rest_is_kept() {
        let database = FakeDatabase {
            migrations_fail: true,
        };
        let dir = tempfile::tempdir().expect("tempdir");

        let report = build(&database, &dir.path().join("app.log"), "ABCD-EFGH").await;

        assert!(report.contains("== Migrations ==\nunavailable: "));
        assert!(report.contains("patient: 1\n"));
        assert!(report.contains("== Last log lines ==\n(no log file)\n"));
    }

    #[tokio::test]
    async fn test_dgr_025_an_unreadable_log_is_reported_as_unavailable() {
        let database = FakeDatabase::healthy();
        let dir = tempfile::tempdir().expect("tempdir");
        // A folder where the log file should be: it exists and cannot be read as a file.
        let log = dir.path().join("app.log");
        std::fs::create_dir(&log).expect("create folder");

        let report = build(&database, &log, "ABCD-EFGH").await;

        assert!(report.contains("== Last log lines ==\nunavailable: the log file cannot be read"));
        assert!(
            report.contains("patient: 1\n"),
            "the other parts are still produced"
        );
    }

    #[test]
    fn test_dgr_020_every_character_is_drawn_from_the_whole_alphabet() {
        // The seventh character used to come from a UUID byte with fixed bits,
        // which left it sixteen possible values: over many codes, it takes more.
        let seventh: std::collections::BTreeSet<char> = (0..400)
            .filter_map(|_| new_support_code().chars().nth(7))
            .collect();
        assert!(
            seventh.len() > 16,
            "got only {} distinct characters",
            seventh.len()
        );
    }

    #[test]
    fn test_dgr_020_a_support_code_is_two_groups_of_four_unambiguous_characters() {
        let code = new_support_code();
        let (left, right) = code.split_once('-').expect("one dash");
        assert_eq!((left.len(), right.len()), (4, 4));
        assert!(code
            .bytes()
            .all(|b| b == b'-' || CODE_ALPHABET.contains(&b)));
        assert_ne!(
            code,
            new_support_code(),
            "codes differ from one report to the next"
        );
    }

    #[test]
    fn test_dgr_030_a_log_of_unknown_origin_is_emptied() {
        let dir = tempfile::tempdir().expect("tempdir");
        let log = dir.path().join("app.log");
        std::fs::write(&log, "written by an older version\n").expect("write log");

        reset_log_on_version_change(dir.path(), "1.2.3").expect("reset");

        let marker = std::fs::read_to_string(dir.path().join(LOG_VERSION_MARKER)).expect("marker");
        assert!(!log.exists(), "the older version's log is removed");
        assert_eq!(marker, "1.2.3");
    }

    #[test]
    fn test_dgr_030_a_log_marked_by_another_version_is_emptied() {
        let dir = tempfile::tempdir().expect("tempdir");
        let log = dir.path().join("app.log");
        reset_log_on_version_change(dir.path(), "1.2.2").expect("older start");
        std::fs::write(&log, "written by 1.2.2\n").expect("write log");

        reset_log_on_version_change(dir.path(), "1.2.3").expect("newer start");

        assert!(!log.exists(), "the other version's log is removed");
    }

    #[test]
    fn test_dgr_031_a_reset_that_cannot_be_done_is_reported_not_fatal() {
        let dir = tempfile::tempdir().expect("tempdir");
        let missing = dir.path().join("no-such-folder");

        let result = reset_log_on_version_change(&missing, "1.2.3");

        assert!(
            result.is_err(),
            "the caller gets the failure and decides to carry on"
        );
    }

    #[test]
    fn test_dgr_030_the_log_of_the_same_version_is_kept() {
        let dir = tempfile::tempdir().expect("tempdir");
        let log = dir.path().join("app.log");
        reset_log_on_version_change(dir.path(), "1.2.3").expect("first start");
        std::fs::write(&log, "written by this version\n").expect("write log");

        reset_log_on_version_change(dir.path(), "1.2.3").expect("second start");

        let kept = std::fs::read_to_string(&log).expect("log");
        assert_eq!(kept, "written by this version\n");
    }
}

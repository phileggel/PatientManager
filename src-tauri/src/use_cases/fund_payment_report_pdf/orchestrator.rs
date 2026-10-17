use std::path::{Path, PathBuf};

use super::error::ReportPdfError;
use super::renderer::render;
use super::request::ReportGenerationRequest;
use crate::shared::secure_path::{validate_user_path, PathPolicy};
use crate::BACKEND;

/// Orchestrate the post-reconciliation report PDF generation.
///
/// Validates the request payload, then renders the PDF. The Tauri command
/// in `api.rs` delegates here per the project's use-case orchestrator
/// convention (rule B22) — `api.rs` deserializes and serializes only;
/// orchestration belongs to this layer.
///
/// # Errors
///
/// - `ReportPdfError::InvalidRequest` if `request.validate()` fails.
/// - `ReportPdfError::PdfGenerationFailed` if rendering fails.
pub fn generate(request: &ReportGenerationRequest) -> Result<Vec<u8>, ReportPdfError> {
    request.validate()?;
    render(request)
}

/// Generate the report and write it to `path`.
///
/// Re-uses [`generate`] then writes the bytes via `std::fs::write`. Lives
/// here (not in `api.rs`) per B22 — `api.rs` stays a thin
/// deserialize/error-mapping shim.
///
/// On write failure the OS error is mapped to a fixed code via
/// [`io_error_code`] (no `e.to_string()` passthrough) — keeps platform-
/// specific path fragments out of the error surface that crosses the IPC
/// boundary.
///
/// # Errors
///
/// - `ReportPdfError::InvalidRequest` / `PdfGenerationFailed` from [`generate`].
/// - `ReportPdfError::WriteFailed` if the filesystem write fails.
pub fn save(request: &ReportGenerationRequest, path: &Path) -> Result<(), ReportPdfError> {
    let bytes = generate(request)?;
    // A new file only: anything already at the name, a link planted since the
    // name was chosen included, is refused rather than written through.
    std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .and_then(|mut file| std::io::Write::write_all(&mut file, &bytes))
        .map_err(|e| ReportPdfError::WriteFailed {
            detail: io_error_code(&e).to_string(),
        })?;
    Ok(())
}

/// Where a report named `filename` is written in `downloads_dir`: the first
/// free name ([`next_available_path`]), checked as every written path is —
/// never a link, never outside the folder (DEBT-048).
pub fn destination_in(downloads_dir: &Path, filename: &str) -> Result<PathBuf, ReportPdfError> {
    let free = next_available_path(&downloads_dir.join(filename)).ok_or_else(|| {
        tracing::warn!(target: BACKEND, "No free report name in the folder");
        ReportPdfError::WriteFailed {
            detail: "no_free_name".into(),
        }
    })?;
    validate_user_path(
        &free.to_string_lossy(),
        downloads_dir,
        PathPolicy::NewFileInExistingDir {
            extensions: &["pdf"],
        },
    )
    .map_err(|e| {
        tracing::warn!(target: BACKEND, error = %e, "Report path rejected");
        ReportPdfError::WriteFailed {
            detail: "path_rejected".into(),
        }
    })
}

/// How many ` (N)` names are tried before giving up.
const PROBE_LIMIT: usize = 1000;

/// Return `base` if nothing is at that name, otherwise insert ` (N)` before
/// the extension and probe `N = 1, 2, 3, …` until a free name is found.
///
/// Mirrors the OS Downloads collision UX (`name.pdf`, `name (1).pdf`, …) so
/// re-exporting never overwrites a previous file. A name is taken when
/// anything is there, a dangling symbolic link included, so a write never
/// follows a link (DEBT-048). `None` once [`PROBE_LIMIT`] names are taken.
fn next_available_path(base: &Path) -> Option<PathBuf> {
    let taken = |path: &Path| std::fs::symlink_metadata(path).is_ok();
    if !taken(base) {
        return Some(base.to_path_buf());
    }
    let stem = base.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    let ext = base.extension().and_then(|s| s.to_str()).unwrap_or("");
    let parent = base.parent().unwrap_or_else(|| Path::new(""));

    (1..=PROBE_LIMIT)
        .map(|n| {
            parent.join(if ext.is_empty() {
                format!("{stem} ({n})")
            } else {
                format!("{stem} ({n}).{ext}")
            })
        })
        .find(|candidate| !taken(candidate))
}

/// Map a `std::io::Error` to a fixed, platform-independent code.
///
/// Avoids echoing the OS error string verbatim, which on some platforms
/// embeds the failing path. Codes are stable and intended for direct
/// surfacing to the frontend / UI translation.
fn io_error_code(e: &std::io::Error) -> &'static str {
    use std::io::ErrorKind::*;
    match e.kind() {
        NotFound => "no_such_directory",
        PermissionDenied => "permission_denied",
        AlreadyExists => "already_exists",
        WriteZero => "write_incomplete",
        Interrupted => "interrupted",
        Unsupported => "unsupported",
        UnexpectedEof => "unexpected_eof",
        OutOfMemory => "out_of_memory",
        _ => "io_error",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::fund_payment_report_pdf::request::{
        valid_request, ReportGenerationRequest,
    };

    #[test]
    fn generate_succeeds_for_valid_request() {
        let req = valid_request();
        let bytes = generate(&req).expect("valid request must produce a PDF");
        assert_eq!(&bytes[..4], b"%PDF");
    }

    #[test]
    fn generate_propagates_invalid_request_error() {
        let req = ReportGenerationRequest {
            title: String::new(),
            ..valid_request()
        };
        let err = generate(&req).expect_err("empty title must fail validation");
        assert!(matches!(err, ReportPdfError::InvalidRequest { .. }));
    }

    #[test]
    fn save_writes_pdf_bytes_to_path() {
        let req = valid_request();
        let dir = tempfile::tempdir().expect("create tempdir");
        let path = dir.path().join("report.pdf");

        save(&req, &path).expect("valid request must save");

        let written = std::fs::read(&path).expect("file exists");
        assert_eq!(&written[..4], b"%PDF");
    }

    #[test]
    fn save_propagates_invalid_request_error() {
        let req = ReportGenerationRequest {
            title: String::new(),
            ..valid_request()
        };
        let dir = tempfile::tempdir().expect("create tempdir");
        let path = dir.path().join("report.pdf");
        let err = save(&req, &path).expect_err("empty title must fail validation");
        assert!(matches!(err, ReportPdfError::InvalidRequest { .. }));
        assert!(!path.exists(), "no file written when validation fails");
    }

    #[test]
    fn save_returns_write_failed_for_unwritable_path() {
        let req = valid_request();
        let dir = tempfile::tempdir().expect("create tempdir");
        let path = dir.path().join("missing-subdir").join("report.pdf");
        let err = save(&req, &path).expect_err("missing parent dir must fail write");
        match err {
            ReportPdfError::WriteFailed { detail: code } => {
                assert_eq!(code, "no_such_directory");
            }
            other => panic!("expected WriteFailed, got {other:?}"),
        }
    }

    #[test]
    fn debt_048_save_never_writes_over_what_is_at_the_name() {
        let req = valid_request();
        let dir = tempfile::tempdir().expect("create tempdir");
        let path = dir.path().join("report.pdf");
        std::fs::write(&path, b"kept").expect("seed");
        let err = save(&req, &path).expect_err("an existing entry must be refused");
        assert!(
            matches!(err, ReportPdfError::WriteFailed { ref detail } if detail == "already_exists"),
            "{err:?}"
        );
        assert_eq!(std::fs::read(&path).expect("read"), b"kept");
    }

    #[test]
    fn debt_048_a_report_is_written_in_its_folder_under_a_free_name() {
        let dir = tempfile::tempdir().expect("create tempdir");
        std::fs::write(dir.path().join("report.pdf"), b"x").expect("seed");
        let target = destination_in(dir.path(), "report.pdf").expect("a free name");
        assert_eq!(
            target.file_name().and_then(|n| n.to_str()),
            Some("report (1).pdf")
        );
        assert!(target.starts_with(std::fs::canonicalize(dir.path()).expect("canonical")));
    }

    #[test]
    fn next_available_path_returns_base_when_unused() {
        let dir = tempfile::tempdir().expect("create tempdir");
        let base = dir.path().join("report.pdf");
        assert_eq!(next_available_path(&base), Some(base));
    }

    #[test]
    fn next_available_path_appends_suffix_on_first_collision() {
        let dir = tempfile::tempdir().expect("create tempdir");
        let base = dir.path().join("report.pdf");
        std::fs::write(&base, b"x").expect("seed first collision");

        let next = next_available_path(&base);
        assert_eq!(next, Some(dir.path().join("report (1).pdf")));
    }

    #[test]
    fn next_available_path_increments_suffix_on_repeated_collisions() {
        let dir = tempfile::tempdir().expect("create tempdir");
        let base = dir.path().join("report.pdf");
        std::fs::write(&base, b"x").expect("seed");
        std::fs::write(dir.path().join("report (1).pdf"), b"x").expect("seed");
        std::fs::write(dir.path().join("report (2).pdf"), b"x").expect("seed");

        let next = next_available_path(&base);
        assert_eq!(next, Some(dir.path().join("report (3).pdf")));
    }

    #[cfg(unix)]
    #[test]
    fn debt_048_a_dangling_link_at_the_name_is_never_written_through() {
        let dir = tempfile::tempdir().expect("create tempdir");
        let base = dir.path().join("report.pdf");
        std::os::unix::fs::symlink(dir.path().join("elsewhere.pdf"), &base).expect("plant a link");

        assert_eq!(
            next_available_path(&base),
            Some(dir.path().join("report (1).pdf"))
        );
    }

    #[test]
    fn debt_065_no_free_name_after_the_probe_limit_is_none() {
        let dir = tempfile::tempdir().expect("create tempdir");
        let base = dir.path().join("report.pdf");
        std::fs::write(&base, b"x").expect("seed");
        for n in 1..=PROBE_LIMIT {
            std::fs::write(dir.path().join(format!("report ({n}).pdf")), b"x").expect("seed");
        }

        assert_eq!(next_available_path(&base), None);
    }

    #[test]
    fn next_available_path_handles_extensionless_name() {
        let dir = tempfile::tempdir().expect("create tempdir");
        let base = dir.path().join("report");
        std::fs::write(&base, b"x").expect("seed");

        let next = next_available_path(&base);
        assert_eq!(next, Some(dir.path().join("report (1)")));
    }

    #[test]
    fn io_error_code_maps_every_known_kind_to_a_stable_string() {
        use std::io::{Error, ErrorKind};

        assert_eq!(
            io_error_code(&Error::from(ErrorKind::NotFound)),
            "no_such_directory"
        );
        assert_eq!(
            io_error_code(&Error::from(ErrorKind::PermissionDenied)),
            "permission_denied"
        );
        assert_eq!(
            io_error_code(&Error::from(ErrorKind::AlreadyExists)),
            "already_exists"
        );
        assert_eq!(
            io_error_code(&Error::from(ErrorKind::WriteZero)),
            "write_incomplete"
        );
        assert_eq!(
            io_error_code(&Error::from(ErrorKind::Interrupted)),
            "interrupted"
        );
        assert_eq!(
            io_error_code(&Error::from(ErrorKind::Unsupported)),
            "unsupported"
        );
        assert_eq!(
            io_error_code(&Error::from(ErrorKind::UnexpectedEof)),
            "unexpected_eof"
        );
        assert_eq!(
            io_error_code(&Error::from(ErrorKind::OutOfMemory)),
            "out_of_memory"
        );
    }

    #[test]
    fn io_error_code_falls_back_to_io_error_for_unmapped_kinds() {
        use std::io::{Error, ErrorKind};
        assert_eq!(io_error_code(&Error::from(ErrorKind::Other)), "io_error");
        assert_eq!(
            io_error_code(&Error::from(ErrorKind::InvalidInput)),
            "io_error"
        );
    }
}

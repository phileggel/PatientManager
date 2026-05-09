use std::path::Path;

use super::error::ReportPdfError;
use super::renderer::render;
use super::request::ReportGenerationRequest;

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
    std::fs::write(path, &bytes)
        .map_err(|e| ReportPdfError::WriteFailed(io_error_code(&e).to_string()))?;
    Ok(())
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
        assert!(matches!(err, ReportPdfError::InvalidRequest(_)));
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
        assert!(matches!(err, ReportPdfError::InvalidRequest(_)));
        assert!(!path.exists(), "no file written when validation fails");
    }

    #[test]
    fn save_returns_write_failed_for_unwritable_path() {
        let req = valid_request();
        let dir = tempfile::tempdir().expect("create tempdir");
        // A path under a non-existent parent directory is unwritable on every
        // platform without `create_dir_all` — exercises the WriteFailed branch.
        let path = dir.path().join("missing-subdir").join("report.pdf");
        let err = save(&req, &path).expect_err("missing parent dir must fail write");
        match err {
            ReportPdfError::WriteFailed(code) => {
                // The mapped code is stable across platforms.
                assert_eq!(code, "no_such_directory");
            }
            other => panic!("expected WriteFailed, got {other:?}"),
        }
    }

    // io_error_code — direct coverage for every branch.
    //
    // The save() integration test only exercises `NotFound`; provoking the
    // other 7 specific kinds through real filesystem ops is platform-specific
    // and flaky. Synthesizing `io::Error::from(ErrorKind::*)` is the standard
    // way to verify the kind→code mapping without I/O.

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
        // `Other` is the canonical catch-all, but any kind not in the explicit
        // match arms above must hit the fallback. Asserting on `Other` and on
        // a less-common kind (`InvalidInput`) covers both intentional and
        // accidental fallback paths.
        assert_eq!(io_error_code(&Error::from(ErrorKind::Other)), "io_error");
        assert_eq!(
            io_error_code(&Error::from(ErrorKind::InvalidInput)),
            "io_error"
        );
    }
}

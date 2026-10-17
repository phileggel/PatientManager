use std::fs;
use std::path::Path;

use anyhow::{anyhow, Context};

/// Extract text content from a PDF file
///
/// Uses pdf-extract crate to extract text from PDF.
/// Returns the extracted text as a string.
///
/// # Arguments
/// * `file_path` - Path to the PDF file
pub fn extract_pdf_text<P: AsRef<Path>>(file_path: P) -> anyhow::Result<String> {
    let file_path = file_path.as_ref();

    if !file_path.exists() {
        return Err(anyhow!("File not found"));
    }

    if file_path.extension().and_then(|s| s.to_str()) != Some("pdf") {
        return Err(anyhow!("File is not a PDF"));
    }

    let bytes = fs::read(file_path).context("Failed to read the file")?;

    extract_pdf_text_from_bytes(&bytes)
}

/// What kind of failure an extraction error is, for a log: an I/O kind, or the
/// file not being readable as a PDF — never the error's text, which can carry a
/// fragment of the file (DEBT-061).
pub fn failure_kind(e: &anyhow::Error) -> String {
    match e.root_cause().downcast_ref::<std::io::Error>() {
        Some(io) => format!("io:{:?}", io.kind()),
        None => "not_a_readable_pdf".to_string(),
    }
}

/// Extract text content from PDF bytes
///
/// Uses pdf-extract crate to extract text from PDF bytes.
/// Returns the extracted text as a string.
///
/// # Arguments
/// * `bytes` - PDF file content as bytes
pub fn extract_pdf_text_from_bytes(bytes: &[u8]) -> anyhow::Result<String> {
    if bytes.is_empty() {
        return Err(anyhow!("PDF file is empty"));
    }

    pdf_extract::extract_text_from_mem(bytes).context("Failed to extract PDF text")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn debt_061_no_extraction_error_names_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let not_pdf = dir.path().join("someone-statement.txt");
        std::fs::write(&not_pdf, b"x").unwrap();
        let unreadable = dir.path().join("someone-statement.pdf");
        std::fs::create_dir(&unreadable).unwrap(); // a directory cannot be read as a file
        for path in [dir.path().join("someone-missing.pdf"), not_pdf, unreadable] {
            let err = format!("{:#}", extract_pdf_text(&path).expect_err("must fail"));
            assert!(!err.contains("someone"), "{err}");
        }
    }

    #[test]
    fn debt_061_a_failure_kind_is_a_fixed_word() {
        let dir = tempfile::tempdir().unwrap();
        let unreadable = dir.path().join("x.pdf");
        std::fs::create_dir(&unreadable).unwrap();
        let read = extract_pdf_text(&unreadable).expect_err("a directory");
        assert!(
            failure_kind(&read).starts_with("io:"),
            "{}",
            failure_kind(&read)
        );
        let garbage = extract_pdf_text_from_bytes(b"not a pdf").expect_err("garbage");
        assert_eq!(failure_kind(&garbage), "not_a_readable_pdf");
    }

    #[test]
    fn test_extract_pdf_text_file_not_found() {
        let err = extract_pdf_text("/nonexistent/file.pdf")
            .expect_err("expected file-not-found error")
            .to_string();
        assert!(err.contains("File not found"));
    }

    #[test]
    fn test_extract_pdf_text_invalid_extension() {
        use std::io::Write;
        let mut temp_file = tempfile::NamedTempFile::new().unwrap();
        temp_file.write_all(b"test").unwrap();

        let err = extract_pdf_text(temp_file.path())
            .expect_err("expected not-a-PDF error")
            .to_string();
        assert!(err.contains("File is not a PDF"));
    }
}

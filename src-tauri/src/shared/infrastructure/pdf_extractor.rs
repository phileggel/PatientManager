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
        return Err(anyhow!("File not found: {}", file_path.display()));
    }

    if file_path.extension().and_then(|s| s.to_str()) != Some("pdf") {
        return Err(anyhow!("File is not a PDF: {}", file_path.display()));
    }

    let bytes =
        fs::read(file_path).with_context(|| format!("Failed to read {}", file_path.display()))?;

    extract_pdf_text_from_bytes(&bytes)
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

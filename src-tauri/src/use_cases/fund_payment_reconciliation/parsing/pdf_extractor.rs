use std::fs;
use std::path::Path;

/// Extract text content from a PDF file
///
/// Uses pdf-extract crate to extract text from PDF.
/// Returns the extracted text as a string.
///
/// # Arguments
/// * `file_path` - Path to the PDF file
///
/// # Returns
/// * `Ok(String)` - Extracted text content
/// * `Err(String)` - Error message if extraction fails
pub fn extract_pdf_text<P: AsRef<Path>>(file_path: P) -> Result<String, String> {
    let file_path = file_path.as_ref();

    // Check if file exists
    if !file_path.exists() {
        return Err(format!("File not found: {}", file_path.display()));
    }

    // Check if file is a PDF
    if file_path.extension().and_then(|s| s.to_str()) != Some("pdf") {
        return Err("File is not a PDF".to_string());
    }

    // Read file
    let bytes = fs::read(file_path).map_err(|e| format!("Failed to read file: {}", e))?;

    // Extract text
    extract_pdf_text_from_bytes(&bytes)
}

/// Extract text content from PDF bytes
///
/// Uses pdf-extract crate to extract text from PDF bytes.
/// Returns the extracted text as a string.
///
/// # Arguments
/// * `bytes` - PDF file content as bytes
///
/// # Returns
/// * `Ok(String)` - Extracted text content
/// * `Err(String)` - Error message if extraction fails
pub fn extract_pdf_text_from_bytes(bytes: &[u8]) -> Result<String, String> {
    // Validate that we have some data
    if bytes.is_empty() {
        return Err("PDF file is empty".to_string());
    }

    // Extract text from memory
    let text = pdf_extract::extract_text_from_mem(bytes)
        .map_err(|e| format!("Failed to extract PDF text: {}", e))?;

    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_pdf_text_file_not_found() {
        let result = extract_pdf_text("/nonexistent/file.pdf");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("File not found"));
    }

    #[test]
    fn test_extract_pdf_text_invalid_extension() {
        use std::io::Write;
        let mut temp_file = tempfile::NamedTempFile::new().unwrap();
        temp_file.write_all(b"test").unwrap();

        let result = extract_pdf_text(temp_file.path());
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "File is not a PDF");
    }
}

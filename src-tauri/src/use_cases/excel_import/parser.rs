use crate::shared::logger::BACKEND;
use crate::use_cases::excel_import::error::ExcelImportError;
use crate::use_cases::excel_import::excel_codec as codec;
use crate::use_cases::excel_import::excel_codec::{
    convert_excel_date_to_iso, parse_text_date_to_iso, ExcelFund, ExcelPatient, ExcelProcedure,
    ParsedExcelData, ParsingIssues, SkippedRow,
};
use calamine::{Reader, Xlsx};
use std::collections::HashMap;
use std::fs::File;
use std::path::Path;
use uuid::Uuid;

/// Dynamic column index mapping for monthly procedure sheets.
///
/// Supports two formats detected from the header row (ligne 2):
/// - New: CODE | NOM DOCTOLIB | NOM SECU | CAISSE | ADRESSE | TARIF | DATE | ENVOI | T | REMBSE | Versé | En attente | ...
/// - Old: CODE | NOM           |           CAISSE | ADRESSE | TARIF | DATE | ENVOI | T | REMBSE | Versé | En attente | ...
struct ColIdx {
    patient: usize,
    fund: usize,
    amount: usize,
    date: usize,
    payment_method: usize,
    confirmed_payment_date: usize,
    paid_amount: usize,
    awaited_amount: usize,
}

impl ColIdx {
    /// Detect column indices from a header row.
    /// Returns None if essential columns (CAISSE, TARIF, DATE) are not found.
    ///
    /// Both formats share the same offsets relative to CAISSE:
    ///   T = CAISSE+5, REMBSE = CAISSE+6, Versé = CAISSE+7, En attente = CAISSE+8
    fn from_header_row(row: &[calamine::Data]) -> Option<Self> {
        use codec::monthly_header as h;

        let mut fund = None;
        let mut amount = None;
        let mut date = None;
        let mut payment_method = None;
        let mut confirmed_payment_date = None;
        let mut paid_amount = None;
        let mut awaited_amount = None;

        for (i, cell) in row.iter().enumerate() {
            let val = cell.to_string();
            let trimmed = val.trim();
            let upper = trimmed.to_uppercase();
            match upper.as_str() {
                s if s == h::FUND => fund = Some(i),
                s if s == h::AMOUNT => amount = Some(i),
                s if s == h::DATE => date = Some(i),
                s if s == h::PAYMENT_METHOD => payment_method = Some(i),
                s if s == h::CONFIRMED_PAYMENT_DATE => confirmed_payment_date = Some(i),
                _ => {}
            }
            // Case-sensitive matches for accented labels.
            match trimmed {
                s if s == h::PAID_AMOUNT => paid_amount = Some(i),
                s if s == h::AWAITED_AMOUNT => awaited_amount = Some(i),
                _ => {}
            }
        }

        let fund = fund?;
        let amount = amount?;
        let date = date?;

        // Default offsets relative to the fund column when optional labels
        // are absent from the header row. These are parser fallback logic
        // (heuristic), not document data mapping — they intentionally stay
        // inline rather than being promoted to the codec.
        Some(ColIdx {
            patient: h::PATIENT_COL,
            fund,
            amount,
            date,
            payment_method: payment_method.unwrap_or(fund + 5),
            confirmed_payment_date: confirmed_payment_date.unwrap_or(fund + 6),
            paid_amount: paid_amount.unwrap_or(fund + 7),
            awaited_amount: awaited_amount.unwrap_or(fund + 8),
        })
    }
}

/// Service for parsing Excel files
pub struct ExcelParserService;

impl ExcelParserService {
    /// Check if a string is an Excel error value (e.g., #N/A, #DIV/0!, #REF!)
    fn is_excel_error(value: &str) -> bool {
        let trimmed = value.trim();
        trimmed.starts_with('#') && (trimmed.ends_with('!') || trimmed == "#N/A")
    }

    /// Parse an Excel file and extract patients, funds, and procedures.
    ///
    /// Per-row issues are collected into `ParsingIssues`; only structural
    /// failures (missing file, unreadable workbook, sheet parse failure) are
    /// returned as a typed [`ExcelImportError`].
    pub async fn parse_excel(file_path: &str) -> Result<ParsedExcelData, ExcelImportError> {
        tracing::debug!("Starting Excel file parse");

        let path = Path::new(file_path);
        if !path.exists() {
            return Err(ExcelImportError::FileNotFound {
                path: file_path.to_string(),
            });
        }

        let file = File::open(file_path).map_err(|e| {
            tracing::error!(target: BACKEND, err = ?e, "Failed to open Excel file");
            ExcelImportError::InvalidFormat
        })?;
        let mut workbook = Xlsx::new(file).map_err(|e| {
            tracing::error!(target: BACKEND, err = ?e, "Failed to read file as xlsx workbook");
            ExcelImportError::InvalidFormat
        })?;

        tracing::debug!("Excel file opened successfully");

        let mut parsing_issues = ParsingIssues {
            skipped_rows: Vec::new(),
            missing_sheets: Vec::new(),
        };

        // Parse Patiente sheet (generates temp_ids)
        let patients =
            Self::parse_patients_sheet(&mut workbook, &mut parsing_issues).map_err(|e| {
                tracing::error!(target: BACKEND, err = ?e, "Failed to parse Patiente sheet");
                ExcelImportError::ParseError
            })?;
        tracing::debug!("Parsed {} patients from Patiente sheet", patients.len());

        // Fallback: if Patiente sheet was absent, extract patients from monthly sheets
        let patients = if patients.is_empty() {
            tracing::debug!("Patiente sheet absent — extracting patients from monthly sheets");
            Self::extract_patients_from_monthly_sheets(&mut workbook).map_err(|e| {
                tracing::error!(target: BACKEND, err = ?e, "Failed to extract patients from monthly sheets");
                ExcelImportError::ParseError
            })?
        } else {
            patients
        };

        // Parse Secu sheet (generates temp_ids)
        let funds = Self::parse_funds_sheet(&mut workbook, &mut parsing_issues).map_err(|e| {
            tracing::error!(target: BACKEND, err = ?e, "Failed to parse Secu sheet");
            ExcelImportError::ParseError
        })?;
        tracing::debug!("Parsed {} funds", funds.len());

        // Create lookup maps for procedures to reference patient/fund temp_ids
        // SSN-based lookup is primary (stable, avoids name variation issues)
        // Name-based lookup is fallback for patients without a valid SSN
        let patient_ssn_to_temp_id: HashMap<String, String> = patients
            .iter()
            .filter(|p| !p.ssn.is_empty())
            .map(|p| (p.ssn.clone(), p.temp_id.clone()))
            .collect();
        let patient_name_to_temp_id: HashMap<String, String> = patients
            .iter()
            .map(|p| (p.name.to_lowercase(), p.temp_id.clone()))
            .collect();
        let fund_identifier_to_temp_id: HashMap<String, String> = funds
            .iter()
            .map(|f| (f.fund_identifier.clone(), f.temp_id.clone()))
            .collect();

        // Parse monthly sheets (uses temp_ids from patients/funds)
        let mut procedures = Self::parse_procedures_sheets(
            &mut workbook,
            &mut parsing_issues,
            &patient_ssn_to_temp_id,
            &patient_name_to_temp_id,
            &fund_identifier_to_temp_id,
        )
        .map_err(|e| {
            tracing::error!(target: BACKEND, err = ?e, "Failed to parse monthly procedure sheets");
            ExcelImportError::ParseError
        })?;
        tracing::debug!("Parsed {} procedures", procedures.len());

        // Create tmp_ids for each unique procedure amount and assign to procedures
        let mut amount_to_procedure_type_tmp_id: HashMap<i64, String> = HashMap::new();
        for procedure in &procedures {
            amount_to_procedure_type_tmp_id
                .entry(procedure.amount)
                .or_insert_with(|| Uuid::new_v4().to_string());
        }

        // Update each procedure with its procedure_type_tmp_id
        for procedure in &mut procedures {
            if let Some(tmp_id) = amount_to_procedure_type_tmp_id.get(&procedure.amount) {
                procedure.procedure_type_tmp_id = tmp_id.clone();
            }
        }

        let result = ParsedExcelData {
            patients,
            funds,
            procedures,
            parsing_issues,
        };

        tracing::debug!(
            patients = result.patients.len(),
            funds = result.funds.len(),
            procedures = result.procedures.len(),
            "Excel parsing complete"
        );

        Ok(result)
    }

    /// Fallback: extract unique patients directly from monthly sheets.
    ///
    /// Used when the "Patiente" sheet is absent (old format).
    /// Deduplicates by SSN (col A = CODE). Patients without SSN are deduplicated by name.
    /// Deduplicates patients by SSN or name across sheets.
    fn extract_patients_from_monthly_sheets(
        workbook: &mut Xlsx<File>,
    ) -> anyhow::Result<Vec<ExcelPatient>> {
        let mut by_ssn: HashMap<String, ExcelPatient> = HashMap::new();
        let mut by_name: HashMap<String, ExcelPatient> = HashMap::new();

        for &(_, variations) in codec::MONTHLY_SHEET_VARIATIONS {
            for &variation in variations {
                if let Ok(range) = workbook.worksheet_range(variation) {
                    let mut col_idx: Option<ColIdx> = None;
                    for row in range.rows() {
                        if col_idx.is_none() {
                            if let Some(detected) = ColIdx::from_header_row(row) {
                                col_idx = Some(detected);
                            }
                            continue;
                        }
                        let Some(idx) = col_idx.as_ref() else {
                            continue;
                        };

                        let ssn = row.first().map(|c| c.to_string()).unwrap_or_default();
                        let ssn = ssn.trim().to_string();
                        let name = row
                            .get(idx.patient)
                            .map(|c| c.to_string())
                            .unwrap_or_default();
                        let name = name.trim().to_string();

                        if name.is_empty() || Self::is_excel_error(&name) {
                            continue;
                        }

                        // Validate SSN: must be exactly 13 numeric digits.
                        let is_valid_ssn = !ssn.is_empty()
                            && !Self::is_excel_error(&ssn)
                            && ssn.chars().all(|c| c.is_ascii_digit())
                            && ssn.len() == 13;

                        if is_valid_ssn {
                            by_ssn.entry(ssn.clone()).or_insert_with(|| ExcelPatient {
                                temp_id: Uuid::new_v4().to_string(),
                                name,
                                ssn,
                                latest_fund: None,
                            });
                        } else {
                            // Invalid or absent SSN: append code to name for traceability.
                            let display_name = if !ssn.is_empty() && !Self::is_excel_error(&ssn) {
                                format!("{name} (code: {ssn})")
                            } else {
                                name.clone()
                            };
                            // Use lowercase key for case-insensitive dedup across sheets
                            by_name
                                .entry(display_name.to_lowercase())
                                .or_insert_with(|| ExcelPatient {
                                    temp_id: Uuid::new_v4().to_string(),
                                    name: display_name,
                                    ssn: String::new(),
                                    latest_fund: None,
                                });
                        }
                    }
                    break; // found this month variation, stop trying others
                }
            }
        }

        let mut patients: Vec<ExcelPatient> = by_ssn.into_values().collect();
        patients.extend(by_name.into_values());
        tracing::debug!(
            "Extracted {} unique patients from monthly sheets",
            patients.len()
        );
        Ok(patients)
    }

    /// Parse patients from Patiente sheet
    fn parse_patients_sheet(
        workbook: &mut Xlsx<File>,
        parsing_issues: &mut ParsingIssues,
    ) -> anyhow::Result<Vec<ExcelPatient>> {
        let mut patients = Vec::new();
        let sheet_name = codec::PATIENTE_SHEET;

        let range = match workbook.worksheet_range(sheet_name) {
            Ok(r) => r,
            Err(_) => {
                tracing::debug!(sheet = sheet_name, "Sheet not found, skipping");
                parsing_issues.missing_sheets.push(sheet_name.to_string());
                return Ok(patients);
            }
        };

        for (row_idx, row) in range.rows().enumerate() {
            let row_number = (row_idx + 1) as u32;

            if row.len() < 4 {
                tracing::warn!(
                    row = row_number,
                    "Patiente row has less than 4 columns, skipping"
                );
                parsing_issues.skipped_rows.push(SkippedRow {
                    sheet: sheet_name.to_string(),
                    row_number,
                    reason: "Insufficient columns (need at least 4)".to_string(),
                });
                continue;
            }

            let name = row.first().map(|c| c.to_string()).unwrap_or_default();
            let ssn = row.get(2).map(|c| c.to_string()).unwrap_or_default();
            let latest_fund_str = row.get(3).map(|c| c.to_string()).unwrap_or_default();

            // Skip rows with Excel error values silently
            if Self::is_excel_error(&name) || Self::is_excel_error(&ssn) {
                continue;
            }

            // Treat NO_FUND_PLACEHOLDER or empty as no fund.
            let latest_fund = match latest_fund_str.trim() {
                s if s.is_empty() || s == codec::NO_FUND_PLACEHOLDER => None,
                fund => Some(fund.to_string()),
            };

            // Only require name, SSN and fund are optional
            if !name.is_empty() {
                patients.push(ExcelPatient {
                    temp_id: Uuid::new_v4().to_string(),
                    name,
                    ssn,
                    latest_fund,
                });
            } else {
                tracing::warn!(row = row_number, "Skipping invalid patient row");
                parsing_issues.skipped_rows.push(SkippedRow {
                    sheet: sheet_name.to_string(),
                    row_number,
                    reason: if name.is_empty() {
                        "Missing patient name".to_string()
                    } else {
                        "Missing SSN".to_string()
                    },
                });
            }
        }

        Ok(patients)
    }

    /// Parse funds from Secu sheet
    fn parse_funds_sheet(
        workbook: &mut Xlsx<File>,
        parsing_issues: &mut ParsingIssues,
    ) -> anyhow::Result<Vec<ExcelFund>> {
        let mut funds = Vec::new();
        let sheet_name = codec::SECU_SHEET;

        let range = match workbook.worksheet_range(sheet_name) {
            Ok(r) => r,
            Err(_) => {
                tracing::debug!(sheet = sheet_name, "Sheet not found, skipping");
                parsing_issues.missing_sheets.push(sheet_name.to_string());
                return Ok(funds);
            }
        };

        for (row_idx, row) in range.rows().enumerate() {
            let row_number = (row_idx + 1) as u32;

            if row.len() < 2 {
                tracing::warn!(
                    row = row_number,
                    "Secu row has less than 2 columns, skipping"
                );
                parsing_issues.skipped_rows.push(SkippedRow {
                    sheet: sheet_name.to_string(),
                    row_number,
                    reason: "Insufficient columns (need at least 2)".to_string(),
                });
                continue;
            }

            let fund_identifier = row.first().map(|c| c.to_string()).unwrap_or_default();
            let fund_name = row.get(1).map(|c| c.to_string()).unwrap_or_default();
            let fund_address_str = row.get(2).map(|c| c.to_string()).unwrap_or_default();

            // Skip rows with Excel error values silently
            if Self::is_excel_error(&fund_identifier) || Self::is_excel_error(&fund_name) {
                continue;
            }

            let fund_address = if !fund_address_str.trim().is_empty() {
                Some(fund_address_str)
            } else {
                None
            };

            if !fund_identifier.is_empty() && !fund_name.is_empty() {
                funds.push(ExcelFund {
                    temp_id: Uuid::new_v4().to_string(),
                    fund_identifier,
                    fund_name,
                    fund_address,
                });
            } else {
                tracing::warn!(row = row_number, "Skipping invalid fund row");
                parsing_issues.skipped_rows.push(SkippedRow {
                    sheet: sheet_name.to_string(),
                    row_number,
                    reason: if fund_identifier.is_empty() {
                        "Missing fund identifier".to_string()
                    } else {
                        "Missing fund name".to_string()
                    },
                });
            }
        }

        Ok(funds)
    }

    /// Parse procedures from monthly sheets (Jan-Déc)
    fn parse_procedures_sheets(
        workbook: &mut Xlsx<File>,
        parsing_issues: &mut ParsingIssues,
        patient_ssn_to_temp_id: &HashMap<String, String>,
        patient_name_to_temp_id: &HashMap<String, String>,
        fund_identifier_to_temp_id: &HashMap<String, String>,
    ) -> anyhow::Result<Vec<ExcelProcedure>> {
        let mut procedures = Vec::new();

        for &(canonical_month, variations) in codec::MONTHLY_SHEET_VARIATIONS {
            let mut found = false;
            for &variation in variations {
                if let Ok(range) = workbook.worksheet_range(variation) {
                    found = true;
                    tracing::debug!(
                        month = canonical_month,
                        sheet = variation,
                        "Found month sheet"
                    );
                    let total_rows = range.rows().count();
                    tracing::debug!(
                        month = canonical_month,
                        total_rows = total_rows,
                        "Processing month sheet"
                    );

                    let mut col_idx: Option<ColIdx> = None;
                    for (row_idx, row) in range.rows().enumerate() {
                        let row_number = (row_idx + 1) as u32;

                        // Detect header row by looking for "CAISSE", "TARIF", "DATE" labels
                        if col_idx.is_none() {
                            if let Some(detected) = ColIdx::from_header_row(row) {
                                tracing::debug!(
                                    month = canonical_month,
                                    row = row_number,
                                    fund_col = detected.fund,
                                    amount_col = detected.amount,
                                    "Detected column layout from header row"
                                );
                                col_idx = Some(detected);
                            }
                            continue;
                        }

                        let Some(idx) = col_idx.as_ref() else {
                            continue;
                        };

                        // Skip rows with insufficient columns for essential fields
                        if row.len() < idx.date + 1 {
                            continue;
                        }

                        let patient_name = row
                            .get(idx.patient)
                            .map(|c| c.to_string())
                            .unwrap_or_default();
                        let fund_identifier_raw =
                            row.get(idx.fund).map(|c| c.to_string()).unwrap_or_default();
                        // Treat NO_FUND_PLACEHOLDER as no fund (patient without fund).
                        let fund_identifier = match fund_identifier_raw.trim() {
                            s if s.is_empty() || s == codec::NO_FUND_PLACEHOLDER => String::new(),
                            id => id.to_string(),
                        };
                        let amount_str = row
                            .get(idx.amount)
                            .map(|c| c.to_string())
                            .unwrap_or_default();
                        let date_cell =
                            row.get(idx.date).map(|c| c.to_string()).unwrap_or_default();

                        // Extract payment fields using dynamic indices
                        let payment_method = row
                            .get(idx.payment_method)
                            .map(|c| c.to_string())
                            .and_then(|s| {
                                let trimmed = s.trim();
                                if trimmed.is_empty() {
                                    None
                                } else {
                                    Some(trimmed.to_string())
                                }
                            });
                        let confirmed_payment_date_cell = row
                            .get(idx.confirmed_payment_date)
                            .map(|c| c.to_string())
                            .unwrap_or_default();
                        let paid_amount = row
                            .get(idx.paid_amount)
                            .map(|c| c.to_string())
                            .and_then(|s| s.trim().parse::<f64>().ok())
                            .map(|v| (v * 1000.0).round() as i64);
                        let awaited_amount = row
                            .get(idx.awaited_amount)
                            .map(|c| c.to_string())
                            .and_then(|s| s.trim().parse::<f64>().ok())
                            .map(|v| (v * 1000.0).round() as i64);

                        // Convert date: try Excel serial number first, then text fallback
                        let trimmed_date = date_cell.trim();
                        let procedure_date = trimmed_date
                            .parse::<f64>()
                            .ok()
                            .and_then(convert_excel_date_to_iso)
                            .or_else(|| parse_text_date_to_iso(trimmed_date));

                        // Skip rows where the date is present but unparseable
                        let procedure_date = match procedure_date {
                            Some(d) => d,
                            None => {
                                if !trimmed_date.is_empty() {
                                    tracing::warn!(
                                        month = canonical_month,
                                        row = row_number,
                                        date_cell = trimmed_date,
                                        "Skipping row: unrecognized date format"
                                    );
                                    parsing_issues.skipped_rows.push(SkippedRow {
                                        sheet: canonical_month.to_string(),
                                        row_number,
                                        reason: format!(
                                            "Unrecognized date format: '{trimmed_date}'"
                                        ),
                                    });
                                }
                                continue;
                            }
                        };

                        // Convert confirmed_payment_date: try Excel serial number first, then text fallback
                        let trimmed_cpd = confirmed_payment_date_cell.trim();
                        let confirmed_payment_date = trimmed_cpd
                            .parse::<f64>()
                            .ok()
                            .and_then(convert_excel_date_to_iso)
                            .or_else(|| parse_text_date_to_iso(trimmed_cpd));

                        // Skip empty rows (no patient name AND no amount AND no date)
                        if [&patient_name, &amount_str, &procedure_date]
                            .iter()
                            .all(|s| s.trim().is_empty())
                        {
                            continue;
                        }

                        // Skip rows where patient_name is #N/A
                        if Self::is_excel_error(&patient_name) {
                            continue;
                        }

                        // Look up patient temp_id:
                        // 1. By SSN (col 0) — primary, avoids name variation issues
                        // 2. By name (case-insensitive) — fallback for patients without valid SSN
                        // 3. By name + "(code: SSN)" — fallback for invalid-SSN patients
                        let row_ssn = row.first().map(|c| c.to_string()).unwrap_or_default();
                        let row_ssn = row_ssn.trim();
                        let is_valid_ssn = !row_ssn.is_empty()
                            && !Self::is_excel_error(row_ssn)
                            && row_ssn.chars().all(|c| c.is_ascii_digit())
                            && row_ssn.len() == 13;
                        let patient_temp_id = if is_valid_ssn {
                            patient_ssn_to_temp_id.get(row_ssn).cloned()
                        } else {
                            patient_name_to_temp_id
                                .get(&patient_name.to_lowercase())
                                .cloned()
                                .or_else(|| {
                                    // Patient stored with "(code: SSN)" suffix (invalid SSN).
                                    if !row_ssn.is_empty() && !Self::is_excel_error(row_ssn) {
                                        let key = format!("{patient_name} (code: {row_ssn})")
                                            .to_lowercase();
                                        patient_name_to_temp_id.get(&key).cloned()
                                    } else {
                                        None
                                    }
                                })
                        };
                        let fund_temp_id =
                            fund_identifier_to_temp_id.get(&fund_identifier).cloned();

                        // Validate patient exists
                        if patient_name.is_empty() || patient_temp_id.is_none() {
                            let reason = if patient_name.is_empty() {
                                "Missing patient name".to_string()
                            } else {
                                format!("Patient '{}' not found in parsed patients", patient_name)
                            };
                            tracing::debug!(
                                month = canonical_month,
                                row = row_number,
                                reason = %reason,
                                "Skipping row: {}", reason
                            );
                            parsing_issues.skipped_rows.push(SkippedRow {
                                sheet: canonical_month.to_string(),
                                row_number,
                                reason,
                            });
                            continue;
                        }

                        // Validate fund exists if provided
                        if !fund_identifier.is_empty() && fund_temp_id.is_none() {
                            let reason =
                                format!("Fund '{}' not found in parsed funds", fund_identifier);
                            tracing::debug!(
                                month = canonical_month,
                                row = row_number,
                                reason = %reason,
                                "Skipping row: {}", reason
                            );
                            parsing_issues.skipped_rows.push(SkippedRow {
                                sheet: canonical_month.to_string(),
                                row_number,
                                reason,
                            });
                            continue;
                        }

                        let amount_euros: f64 = amount_str.parse().unwrap_or(0.0);
                        let amount = (amount_euros * 1000.0).round() as i64;
                        if amount <= 0 {
                            tracing::debug!(
                                month = canonical_month,
                                row = row_number,
                                amount_str = %amount_str,
                                parsed_amount = amount,
                                "Skipping procedure with invalid amount"
                            );
                            parsing_issues.skipped_rows.push(SkippedRow {
                                sheet: canonical_month.to_string(),
                                row_number,
                                reason: format!("Invalid amount: {}", amount_str),
                            });
                            continue;
                        }

                        tracing::trace!(
                            month = canonical_month,
                            row = row_number,
                            patient = %patient_name,
                            fund_id = %fund_identifier,
                            amount = amount,
                            date = %procedure_date,
                            "Successfully parsed procedure"
                        );

                        if let Some(patient_id) = patient_temp_id {
                            procedures.push(ExcelProcedure {
                                patient_temp_id: patient_id,
                                fund_temp_id,
                                procedure_type_tmp_id: String::new(), // Will be set after parsing
                                amount,
                                procedure_date,
                                sheet_month: canonical_month.to_string(),
                                payment_method,
                                confirmed_payment_date,
                                paid_amount,
                                awaited_amount,
                                source_row: row_number, // IFC-026 — 1-based row index in the source sheet
                            });
                        }
                    }
                    break; // Found the month, stop trying other variations
                }
            }

            // Only report as missing if none of the variations were found
            if !found {
                tracing::debug!(month = canonical_month, "Month sheet not found");
                parsing_issues
                    .missing_sheets
                    .push(canonical_month.to_string());
            }
        }

        Ok(procedures)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- ColIdx::from_header_row ---

    fn s(v: &str) -> calamine::Data {
        calamine::Data::String(v.to_string())
    }

    #[test]
    fn col_idx_parses_explicit_column_positions() {
        // All optional columns present; positions must be read from header, not defaulted
        let header = vec![
            s("CODE"),       // 0
            s("NOM"),        // 1 — patient always = 1
            s("NOM SECU"),   // 2
            s("CAISSE"),     // 3 → fund
            s("ADRESSE"),    // 4
            s("TARIF"),      // 5 → amount
            s("DATE"),       // 6 → date
            s("ENVOI"),      // 7
            s("T"),          // 8 → payment_method
            s("REMBSE"),     // 9 → confirmed_payment_date
            s("Versé"),      // 10 → paid_amount
            s("En attente"), // 11 → awaited_amount
        ];
        let col = ColIdx::from_header_row(&header).expect("valid header should parse");
        assert_eq!(col.fund, 3);
        assert_eq!(col.amount, 5);
        assert_eq!(col.date, 6);
        assert_eq!(col.payment_method, 8);
        assert_eq!(col.confirmed_payment_date, 9);
        assert_eq!(col.paid_amount, 10);
        assert_eq!(col.awaited_amount, 11);
        assert_eq!(col.patient, 1);
    }

    #[test]
    fn col_idx_applies_fund_relative_offsets_when_optional_columns_absent() {
        // Only the three required columns; optional columns should default to fund + fixed offset
        let header = vec![
            calamine::Data::Empty, // 0
            calamine::Data::Empty, // 1
            calamine::Data::Empty, // 2
            s("CAISSE"),           // 3 → fund
            calamine::Data::Empty, // 4
            s("TARIF"),            // 5 → amount
            s("DATE"),             // 6 → date
        ];
        let col = ColIdx::from_header_row(&header).expect("valid header should parse");
        // Defaults: T = fund+5, REMBSE = fund+6, Versé = fund+7, En attente = fund+8
        assert_eq!(col.payment_method, 8); // 3+5
        assert_eq!(col.confirmed_payment_date, 9); // 3+6
        assert_eq!(col.paid_amount, 10); // 3+7
        assert_eq!(col.awaited_amount, 11); // 3+8
    }

    #[test]
    fn col_idx_returns_none_when_required_column_missing() {
        // TARIF missing — amount cannot be located
        let header = vec![s("CAISSE"), s("DATE")];
        assert!(ColIdx::from_header_row(&header).is_none());
    }

    #[test]
    fn col_idx_returns_none_for_empty_header() {
        assert!(ColIdx::from_header_row(&[]).is_none());
    }

    #[test]
    fn col_idx_column_matching_is_case_insensitive_for_required_columns() {
        let header = vec![s("caisse"), s("tarif"), s("date")];
        assert!(ColIdx::from_header_row(&header).is_some());
    }

    // --- ExcelParserService::is_excel_error ---

    #[test]
    fn is_excel_error_detects_div_zero() {
        assert!(ExcelParserService::is_excel_error("#DIV/0!"));
    }

    #[test]
    fn is_excel_error_detects_n_a() {
        assert!(ExcelParserService::is_excel_error("#N/A"));
    }

    #[test]
    fn is_excel_error_detects_ref_error() {
        assert!(ExcelParserService::is_excel_error("#REF!"));
    }

    #[test]
    fn is_excel_error_rejects_normal_cell_value() {
        assert!(!ExcelParserService::is_excel_error("CPAM"));
    }

    #[test]
    fn is_excel_error_rejects_hash_without_bang_and_not_na() {
        // Starts with # but neither ends with ! nor equals "#N/A"
        assert!(!ExcelParserService::is_excel_error("#UNKNOWN"));
    }

    #[test]
    fn is_excel_error_trims_surrounding_whitespace() {
        assert!(ExcelParserService::is_excel_error("  #DIV/0!  "));
    }

    // --- ExcelParserService::parse_excel (integration: file system) ---

    #[tokio::test]
    async fn parse_excel_returns_error_for_nonexistent_file() {
        let result = ExcelParserService::parse_excel("/path/to/nonexistent/file.xlsx").await;
        assert!(matches!(
            result.unwrap_err(),
            ExcelImportError::FileNotFound { .. }
        ));
    }

    #[tokio::test]
    async fn parse_excel_returns_invalid_format_for_non_xlsx_file() {
        // Cargo.toml exists but is not an xlsx workbook: File::open succeeds,
        // Xlsx::new fails → InvalidFormat.
        let result = ExcelParserService::parse_excel("Cargo.toml").await;
        assert!(matches!(
            result.unwrap_err(),
            ExcelImportError::InvalidFormat
        ));
    }
}

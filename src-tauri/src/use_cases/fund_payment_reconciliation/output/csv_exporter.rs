//! CSV export module for reconciliation results
//!
//! Provides functionality to export reconciliation results (anomalies and not-found procedures)
//! to CSV format suitable for external analysis.

use crate::use_cases::fund_payment_reconciliation::api::{
    AnomalyType, ReconciliationMatch, ReconciliationResult,
};
use chrono::NaiveDate;
use std::io::Write;

/// Export reconciliation results to CSV format
pub fn export_to_csv(result: &ReconciliationResult) -> Result<String, String> {
    let mut csv_data = Vec::new();

    // Write UTF-8 BOM for Excel compatibility
    csv_data
        .write_all(&[0xEF, 0xBB, 0xBF])
        .map_err(|e| e.to_string())?;

    let mut writer = csv::Writer::from_writer(csv_data);

    // Write header
    writer
        .write_record([
            "Type",
            "SSN",
            "Patient Name",
            "Procedure Date",
            "Payment Date",
            "Payment Delay (days)",
            "Fund Name",
            "Amount PDF (€)",
            "Amount DB (€)",
            "Amount Difference (€)",
            "Anomalies",
        ])
        .map_err(|e| e.to_string())?;

    // Process all matches (both perfect and issues)
    for match_result in &result.matches {
        match match_result {
            // Skip perfect matches (no action needed, no export needed)
            ReconciliationMatch::PerfectSingleMatch { .. } => {}
            ReconciliationMatch::PerfectGroupMatch { .. } => {}
            // Export issue matches
            ReconciliationMatch::NotFoundIssue { pdf_line, .. } => {
                let procedure_date_str = format_procedure_date(pdf_line);
                let payment_date_str = pdf_line.payment_date.format("%Y-%m-%d").to_string();
                writer
                    .write_record([
                        "NOT_FOUND",
                        &pdf_line.ssn,
                        &pdf_line.patient_name,
                        &procedure_date_str,
                        &payment_date_str,
                        "N/A",
                        &pdf_line.fund_name,
                        &format_french_decimal(pdf_line.amount),
                        "N/A",
                        "N/A",
                        "Procédure non trouvée en base de données",
                    ])
                    .map_err(|e| e.to_string())?;
            }
            ReconciliationMatch::SingleMatchIssue { pdf_line, db_match } => {
                let amount_diff = pdf_line.amount - db_match.amount.unwrap_or(0);
                let delay = calculate_delay(&pdf_line.payment_date, &db_match.procedure_date);
                let procedure_date_str = format_procedure_date(pdf_line);
                let payment_date_str = pdf_line.payment_date.format("%Y-%m-%d").to_string();

                writer
                    .write_record([
                        "SINGLE_MATCH",
                        &pdf_line.ssn,
                        &pdf_line.patient_name,
                        &procedure_date_str,
                        &payment_date_str,
                        &delay,
                        &pdf_line.fund_name,
                        &format_french_decimal(pdf_line.amount),
                        &format_french_decimal(db_match.amount.unwrap_or(0)),
                        &format_french_decimal(amount_diff),
                        &format_anomalies(&db_match.anomalies),
                    ])
                    .map_err(|e| e.to_string())?;
            }
            ReconciliationMatch::GroupMatchIssue {
                pdf_line,
                db_matches,
            } => {
                let procedure_date_str = format_procedure_date(pdf_line);
                let payment_date_str = pdf_line.payment_date.format("%Y-%m-%d").to_string();
                for (i, db_match) in db_matches.iter().enumerate() {
                    let type_str = if i == 0 {
                        "GROUP_MATCH_START"
                    } else {
                        "GROUP_MATCH_PART"
                    };
                    let amount_diff = if i == 0 {
                        let total_db_amount: i64 =
                            db_matches.iter().map(|m| m.amount.unwrap_or(0)).sum();
                        pdf_line.amount - total_db_amount
                    } else {
                        0
                    };
                    let delay = calculate_delay(&pdf_line.payment_date, &db_match.procedure_date);

                    let amount = if i == 0 {
                        format_french_decimal(amount_diff)
                    } else {
                        "-".to_string()
                    };

                    writer
                        .write_record([
                            type_str,
                            &pdf_line.ssn,
                            &pdf_line.patient_name,
                            &procedure_date_str,
                            &payment_date_str,
                            &delay,
                            &pdf_line.fund_name,
                            &format_french_decimal(pdf_line.amount),
                            &format_french_decimal(db_match.amount.unwrap_or(0)),
                            &amount,
                            &format_anomalies(&db_match.anomalies),
                        ])
                        .map_err(|e| e.to_string())?;
                }
            }
            ReconciliationMatch::TooManyMatchIssue {
                pdf_line,
                candidate_ids,
            } => {
                let procedure_date_str = format_procedure_date(pdf_line);
                let payment_date_str = pdf_line.payment_date.format("%Y-%m-%d").to_string();
                writer
                    .write_record([
                        "TOO_MANY_CANDIDATES",
                        &pdf_line.ssn,
                        &pdf_line.patient_name,
                        &procedure_date_str,
                        &payment_date_str,
                        "N/A",
                        &pdf_line.fund_name,
                        &format_french_decimal(pdf_line.amount),
                        "N/A",
                        "N/A",
                        &format!("Trop de procédures ({} > 8 max)", candidate_ids.len()),
                    ])
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    let csv_vec = writer.into_inner().map_err(|e| e.to_string())?;
    let csv_string = String::from_utf8(csv_vec).map_err(|e| e.to_string())?;

    Ok(csv_string)
}

fn calculate_delay(payment_date: &NaiveDate, procedure_date: &NaiveDate) -> String {
    (*payment_date - *procedure_date).num_days().to_string()
}

fn format_procedure_date(
    pdf_line: &crate::use_cases::fund_payment_reconciliation::api::NormalizedPdfLine,
) -> String {
    if pdf_line.is_period {
        format!(
            "{} au {}",
            pdf_line.procedure_start_date.format("%Y-%m-%d"),
            pdf_line.procedure_end_date.format("%Y-%m-%d")
        )
    } else {
        pdf_line.procedure_start_date.format("%Y-%m-%d").to_string()
    }
}

/// Format an i64 millièmes amount as euros with French locale (comma separator)
/// e.g. 50000 → "50,00", 1234560 → "1234,56"
fn format_french_decimal(value: i64) -> String {
    let euros = value as f64 / 1000.0;
    format!("{:.2}", euros).replace(".", ",")
}

/// Format anomalies as semicolon-separated French labels
fn format_anomalies(anomalies: &[AnomalyType]) -> String {
    if anomalies.is_empty() {
        return "Aucune".to_string();
    }
    anomalies
        .iter()
        .map(|a| match a {
            AnomalyType::FundMismatch => "Caisse différente",
            AnomalyType::AmountMismatch => "Montant différent",
            AnomalyType::DateMismatch => "Date différente",
        })
        .collect::<Vec<_>>()
        .join("; ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::fund_payment_reconciliation::api::{
        AnomalyType, DbMatch, NormalizedPdfLine,
    };

    fn make_pdf_line(ssn: &str, amount: i64, is_period: bool) -> NormalizedPdfLine {
        NormalizedPdfLine {
            line_index: 0,
            payment_date: NaiveDate::from_ymd_opt(2025, 5, 15).unwrap(),
            invoice_number: "001".to_string(),
            fund_name: "CPAM n° 931".to_string(),
            patient_name: "Marie Dupont".to_string(),
            ssn: ssn.to_string(),
            nature: "SF".to_string(),
            procedure_start_date: NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            procedure_end_date: if is_period {
                NaiveDate::from_ymd_opt(2025, 5, 15).unwrap()
            } else {
                NaiveDate::from_ymd_opt(2025, 5, 10).unwrap()
            },
            is_period,
            amount,
        }
    }

    #[test]
    fn test_format_french_decimal() {
        assert_eq!(format_french_decimal(123450), "123,45");
        assert_eq!(format_french_decimal(1000500), "1000,50");
        assert_eq!(format_french_decimal(0), "0,00");
    }

    #[test]
    fn test_format_anomalies_single() {
        let anomalies = vec![AnomalyType::FundMismatch];
        assert_eq!(format_anomalies(&anomalies), "Caisse différente");
    }

    #[test]
    fn test_export_empty_result() {
        let result = ReconciliationResult { matches: vec![] };

        let csv = export_to_csv(&result).expect("CSV export failed");

        // Should contain UTF-8 BOM and header only
        assert!(csv.starts_with("\u{FEFF}"));
        assert!(csv.contains("Type,SSN,Patient Name"));
    }

    #[test]
    fn test_export_single_match_with_anomalies() {
        let pdf_line = make_pdf_line("1234567890123", 50000, false);
        let db_match = DbMatch {
            procedure_id: "proc-001".to_string(),
            procedure_date: NaiveDate::from_ymd_opt(2025, 5, 10).unwrap(),
            fund_id: Some("fund-001".to_string()),
            amount: Some(48000),
            anomalies: vec![AnomalyType::AmountMismatch],
        };

        let result = ReconciliationResult {
            matches: vec![ReconciliationMatch::SingleMatchIssue { pdf_line, db_match }],
        };

        let csv = export_to_csv(&result).expect("CSV export failed");

        assert!(csv.contains("SINGLE_MATCH"));
        assert!(csv.contains("1234567890123"));
        assert!(csv.contains("Marie Dupont"));
        assert!(csv.contains("50,00")); // French decimal
        assert!(csv.contains("48,00"));
        assert!(csv.contains("Montant différent"));
        assert!(csv.contains(",5,")); // delay: 2025-05-15 - 2025-05-10 = 5 days
    }

    #[test]
    fn test_export_not_found() {
        let not_found = NormalizedPdfLine {
            line_index: 1,
            payment_date: NaiveDate::from_ymd_opt(2025, 5, 20).unwrap(),
            invoice_number: "002".to_string(),
            fund_name: "MGEN".to_string(),
            patient_name: "Jean Martin".to_string(),
            ssn: "9876543210987".to_string(),
            nature: "SF".to_string(),
            procedure_start_date: NaiveDate::from_ymd_opt(2025, 5, 18).unwrap(),
            procedure_end_date: NaiveDate::from_ymd_opt(2025, 5, 19).unwrap(),
            is_period: true,
            amount: 100000,
        };

        let result = ReconciliationResult {
            matches: vec![ReconciliationMatch::NotFoundIssue {
                pdf_line: not_found,
                nearby_candidates: vec![],
            }],
        };

        let csv = export_to_csv(&result).expect("CSV export failed");

        assert!(csv.contains("NOT_FOUND"));
        assert!(csv.contains("9876543210987"));
        assert!(csv.contains("Jean Martin"));
        assert!(csv.contains("100,00"));
        assert!(csv.contains("Procédure non trouvée en base de données"));
    }
}

//! Splitting one PDF line into several procedures (FPA-255 to FPA-258).

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use specta::Type;

use super::error::FundPaymentReconciliationTask;
use super::fund_pdf_codec::NormalizedPdfLine;

/// One part of a split PDF line, as the card sent it: a procedure date as
/// typed (YYYY-MM-DD, or empty) and its amount in thousandths of a euro.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct SplitPart {
    pub procedure_date: String,
    pub billed_amount: Option<i64>,
}

/// Why a split is refused as a whole (FPA-255).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
pub enum SplitInvalidReason {
    /// The split holds no part.
    NoPart,
    /// The parts' amounts do not add up to the line's amount.
    TotalMismatch,
}

/// Why one part of a split is refused (FPA-256).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
pub enum SplitPartInvalidReason {
    /// No date, or a blank one.
    DateEmpty,
    /// A date that is not a valid YYYY-MM-DD date.
    DateInvalid,
    /// A date outside the line's start → end.
    DateOutOfRange,
    /// No amount.
    AmountEmpty,
    /// An amount of zero, or of the opposite sign to the line's.
    AmountWrongSign,
}

/// Reads a split against its line (FPA-255, FPA-256, FPA-258): the parts as (date, amount), or
/// every refusal at once — the split's own reasons, and each part's reasons at
/// that part's position.
pub fn read_split(
    line: &NormalizedPdfLine,
    parts: &[SplitPart],
) -> Result<Vec<(NaiveDate, i64)>, FundPaymentReconciliationTask> {
    let mut read = Vec::with_capacity(parts.len());
    let mut part_reasons = Vec::with_capacity(parts.len());
    for part in parts {
        let (date, amount, reasons) = read_part(line, part);
        if let (Some(date), Some(amount)) = (date, amount) {
            read.push((date, amount));
        }
        part_reasons.push(reasons);
    }

    let mut reasons = Vec::new();
    if parts.is_empty() {
        reasons.push(SplitInvalidReason::NoPart);
    }
    // The amounts come from the screen: an overflowing total is a mismatch, never a wrap.
    let total = parts
        .iter()
        .filter_map(|part| part.billed_amount)
        .try_fold(0i64, i64::checked_add);
    if !parts.is_empty() && total != Some(line.amount) {
        reasons.push(SplitInvalidReason::TotalMismatch);
    }

    if reasons.is_empty() && part_reasons.iter().all(Vec::is_empty) {
        Ok(read)
    } else {
        Err(FundPaymentReconciliationTask::SplitInvalid {
            reasons,
            parts: part_reasons,
        })
    }
}

fn read_part(
    line: &NormalizedPdfLine,
    part: &SplitPart,
) -> (Option<NaiveDate>, Option<i64>, Vec<SplitPartInvalidReason>) {
    let mut reasons = Vec::new();
    let typed = part.procedure_date.trim();
    let date = NaiveDate::parse_from_str(typed, "%Y-%m-%d").ok();
    match date {
        _ if typed.is_empty() => reasons.push(SplitPartInvalidReason::DateEmpty),
        None => reasons.push(SplitPartInvalidReason::DateInvalid),
        Some(date) if date < line.procedure_start_date || date > line.procedure_end_date => {
            reasons.push(SplitPartInvalidReason::DateOutOfRange)
        }
        Some(_) => {}
    }
    match part.billed_amount {
        None => reasons.push(SplitPartInvalidReason::AmountEmpty),
        Some(amount) if amount == 0 || amount.signum() != line.amount.signum() => {
            reasons.push(SplitPartInvalidReason::AmountWrongSign)
        }
        Some(_) => {}
    }
    (date, part.billed_amount, reasons)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(amount: i64) -> NormalizedPdfLine {
        NormalizedPdfLine {
            line_index: 4,
            payment_date: NaiveDate::from_ymd_opt(2026, 10, 5).unwrap(),
            invoice_number: "F-1".to_string(),
            fund_name: "CPAM n° 931".to_string(),
            patient_name: "Test Patient".to_string(),
            ssn: "1000000000000".to_string(),
            nature: "SEANCE".to_string(),
            procedure_start_date: NaiveDate::from_ymd_opt(2026, 9, 1).unwrap(),
            procedure_end_date: NaiveDate::from_ymd_opt(2026, 9, 30).unwrap(),
            is_period: true,
            amount,
        }
    }

    fn part(date: &str, amount: Option<i64>) -> SplitPart {
        SplitPart {
            procedure_date: date.to_string(),
            billed_amount: amount,
        }
    }

    fn refusal(
        err: FundPaymentReconciliationTask,
    ) -> (Vec<SplitInvalidReason>, Vec<Vec<SplitPartInvalidReason>>) {
        match err {
            FundPaymentReconciliationTask::SplitInvalid { reasons, parts } => (reasons, parts),
            other => panic!("expected SplitInvalid, got {other:?}"),
        }
    }

    #[test]
    fn fpa_255_a_balanced_split_within_the_period_is_read() {
        let parts = [
            part("2026-09-04", Some(45_000)),
            part("2026-09-11", Some(90_000)),
        ];
        let read = read_split(&line(135_000), &parts).unwrap();
        assert_eq!(
            read,
            vec![
                (NaiveDate::from_ymd_opt(2026, 9, 4).unwrap(), 45_000),
                (NaiveDate::from_ymd_opt(2026, 9, 11).unwrap(), 90_000),
            ]
        );
    }

    #[test]
    fn fpa_258_an_unbalanced_total_and_a_date_out_of_range_are_refused_together() {
        let parts = [
            part("2026-09-04", Some(45_000)),
            part("2026-10-02", Some(45_000)),
        ];
        let (reasons, parts) = refusal(read_split(&line(135_000), &parts).unwrap_err());
        assert_eq!(reasons, vec![SplitInvalidReason::TotalMismatch]);
        assert_eq!(
            parts,
            vec![vec![], vec![SplitPartInvalidReason::DateOutOfRange]]
        );
    }

    #[test]
    fn fpa_256_each_part_names_its_empty_or_malformed_fields() {
        let parts = [part(" ", None), part("04/09/2026", Some(135_000))];
        let (_, parts) = refusal(read_split(&line(135_000), &parts).unwrap_err());
        assert_eq!(
            parts,
            vec![
                vec![
                    SplitPartInvalidReason::DateEmpty,
                    SplitPartInvalidReason::AmountEmpty
                ],
                vec![SplitPartInvalidReason::DateInvalid],
            ]
        );
    }

    #[test]
    fn fpa_256_a_part_of_the_wrong_sign_is_refused_on_a_refund_line() {
        let parts = [
            part("2026-09-04", Some(-90_000)),
            part("2026-09-05", Some(10_000)),
        ];
        let (reasons, parts) = refusal(read_split(&line(-80_000), &parts).unwrap_err());
        assert!(reasons.is_empty());
        assert_eq!(
            parts,
            vec![vec![], vec![SplitPartInvalidReason::AmountWrongSign]]
        );
    }

    #[test]
    fn fpa_255_an_overflowing_total_is_a_mismatch() {
        let parts = [
            part("2026-09-04", Some(i64::MAX)),
            part("2026-09-05", Some(i64::MAX)),
        ];
        let (reasons, _) = refusal(read_split(&line(-2), &parts).unwrap_err());
        assert_eq!(reasons, vec![SplitInvalidReason::TotalMismatch]);
    }

    #[test]
    fn fpa_255_a_split_with_no_part_is_refused() {
        let (reasons, parts) = refusal(read_split(&line(135_000), &[]).unwrap_err());
        assert_eq!(reasons, vec![SplitInvalidReason::NoPart]);
        assert!(parts.is_empty());
    }
}

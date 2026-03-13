/// Date parsing utilities for French-formatted dates
use chrono::NaiveDate;

/// Parse a French-formatted date (DD/MM/YYYY) into a NaiveDate
pub fn convert_french_date_to_naive_date(date_str: &str) -> anyhow::Result<NaiveDate> {
    let date_str = date_str.trim();
    NaiveDate::parse_from_str(date_str, "%d/%m/%Y")
        .map_err(|e| anyhow::anyhow!("Invalid French date '{}': {}", date_str, e))
}

/// Parse an ISO-formatted date (YYYY-MM-DD) into a NaiveDate
/// TEMPORARY: Used for database procedures until dates are fully migrated to NaiveDate
/// TODO: Remove this function when Procedure domain stores NaiveDate instead of String
pub fn parse_iso_date_to_naive_date(date_str: &str) -> anyhow::Result<NaiveDate> {
    let date_str = date_str.trim();
    NaiveDate::parse_from_str(date_str, "%Y-%m-%d")
        .map_err(|e| anyhow::anyhow!("Invalid ISO date '{}': {}", date_str, e))
}

/// Parse a date range string (single date or "DD/MM/YYYY au DD/MM/YYYY")
pub fn parse_date_range(date_str: &str) -> anyhow::Result<(NaiveDate, NaiveDate)> {
    if date_str.contains(" au ") {
        let parts: Vec<&str> = date_str.split(" au ").collect();
        if let [start, end] = &parts[..] {
            return Ok((
                convert_french_date_to_naive_date(start)?,
                convert_french_date_to_naive_date(end)?,
            ));
        }
    }
    let date = convert_french_date_to_naive_date(date_str)?;
    Ok((date, date))
}

/// Subtract one day from a date
pub fn subtract_one_day(date: NaiveDate) -> anyhow::Result<NaiveDate> {
    date.checked_sub_days(chrono::Days::new(1))
        .ok_or_else(|| anyhow::anyhow!("Date underflow when subtracting 1 day from {:?}", date))
}

/// Add one day to a date
pub fn add_one_day(date: NaiveDate) -> anyhow::Result<NaiveDate> {
    date.checked_add_days(chrono::Days::new(1))
        .ok_or_else(|| anyhow::anyhow!("Date overflow when adding 1 day to {:?}", date))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_convert_french_date_valid() {
        let date = convert_french_date_to_naive_date("25/12/2025").unwrap();
        assert_eq!(date.to_string(), "2025-12-25");
    }

    #[test]
    fn test_parse_date_range_single() {
        let (start, end) = parse_date_range("25/12/2025").unwrap();
        assert_eq!(start, end);
    }

    #[test]
    fn test_parse_date_range_period() {
        let (start, end) = parse_date_range("01/12/2025 au 31/12/2025").unwrap();
        assert_eq!(start.to_string(), "2025-12-01");
        assert_eq!(end.to_string(), "2025-12-31");
    }
}

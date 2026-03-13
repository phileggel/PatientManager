//! This module exists to support chrono::NaiveDate serialization.
//! With the chrono feature enabled on sqlx and chrono's serde feature,
//! NaiveDate serializes to ISO string format "YYYY-MM-DD".
//! Use #[specta(type = String)] attribute on NaiveDate fields to tell
//! Specta to treat them as String in TypeScript bindings.

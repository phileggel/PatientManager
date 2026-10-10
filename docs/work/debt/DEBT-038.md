# 2026-10-05 — DEBT-038 — A patient's latest procedure date is typed as never null in TypeScript

**Found by:** contract-reviewer (branch `refactor/todo-016-patient-validator`)

**Where:** `src-tauri/src/context/patient/domain.rs` (`latest_date`), `src/bindings.ts`

**Observation:** `latest_date` is an `Option<NaiveDate>` carrying `#[specta(type = String)]`, so the generated binding says `string` where the wire sends `null` for a patient with no procedure. The compiler therefore lets frontend code read it without a null check. Fix: `#[specta(type = Option<String>)]`, regenerate, and handle the null where the compiler then points.

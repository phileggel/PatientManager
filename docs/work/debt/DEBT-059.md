# 2026-10-11 — DEBT-059 — The screen logs a new patient's name and SSN, and they reach the log file

**Found by:** `reviewer-security`, reading the whole command surface and the frontend on `main` at 3537c57 after the 0.24.3 release (the sweep before the release had read the batch's diff only, FLOW-061); the first point checked by the agent in the code

**Where:** `src/features/procedure/hooks/useCreateEntityForm.ts` (the two `logger` calls of `handleSubmit`), `src/features/procedure/ui/form/CreatePatientForm.tsx` (its only caller), `src/features/fund/gateway.ts` (`addFund`), `src/infra/logger.ts`, `src-tauri/src/shared/infrastructure/logger.rs` (`log_frontend`)

**Observation:** B44 forbids patient data in a log. When a patient is created from the procedure form, `useCreateEntityForm` logs the submitted form at `info`, and for a patient that form is the name and the SSN. `logger.ts` turns the object into text and sends it to `log_frontend`, which writes it to the application log: every patient created that way since the first public release (2026-03-13) has a log line with both. The error path of the same function logs the raw error. `addFund` logs the fund's identifier and name the same way, the values DEBT-051 took out of the backend's log calls, and they can hold a person's name (DEBT-058). What limits it: the log stays on the user's machine, and the diagnostic report keeps only the lines the backend wrote (DGR, the owner's decision of 2026-10-03), so it never carried these. `scripts/privacy-check.py` reads `logger.*` calls for the value of an SSN or a name and does not see an object that holds them. The sweep proposes a guard at the logger itself, since any call that logs an object is the same path: refuse objects, or redact the keys `name` and `ssn`. Lesser: three calls log a bank account's name. The lines already written stay in the existing log files until they rotate or are removed.

**Size:** M

**Waits on the owner:** when it is fixed, and what becomes of the lines already in the log files

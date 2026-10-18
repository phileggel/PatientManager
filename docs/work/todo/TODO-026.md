# TODO-026 — The procedure form greys its Save instead of naming the missing field

First slice of TODO-024 (owner, 2026-10-18: one todo per slice, the procedure form first). Read in the code: `ProcedureFormModal.tsx` keeps Save disabled until patient, type and date are filled (its test "submit button is disabled until…"), so PRO-120's per-field messages are never reached (DEBT-064); `CreatePatientForm.tsx:85` disables its button on an empty name. The backend answers one refusal at a time (`ProcedureError::PatientIdEmpty`, `ProcedureTypeIdEmpty`, `InvalidProcedureDate`); only the fund answers every reason at once (`FundInvalid { reasons }`, `src/features/fund/shared/presenter.ts`), the pattern to follow.

**Size:** L — mocks, a contract change, two pull requests (backend refusals and "unchanged", then the screens).

**User value:** in the procedure form and its inline new-patient form, the user presses Save and is told, under each field, what is missing; an edit with nothing changed closes the dialog without saving.

**Done when:** `docs/frontend-rules.md` states TODO-024's rule; Save in both forms is enabled while not saving; `add_procedure` and `update_procedure` refuse an empty patient, type or date together as `ProcedureInvalid { reasons }`, nothing written; each reason shows in red under its field and clears once that field is edited; `update_procedure` given the stored values answers "unchanged", writes nothing, and the dialog closes; patient creation refuses an empty name, shown under the name; PRO-120, PRO-250 and the procedure contract carry it; Rust tests per refusal and for "unchanged", Vitest per form; screenshots. Refined (2026-10-18): the files above, `src-tauri/src/context/procedure/error.rs`, `src-tauri/src/context/patient/error.rs`, `docs/error-model.md` read.

**Design:** validated (owner, 2026-10-18) — `screenshots/design/TODO-026-*.png`: Save enabled from the start; a message per field naming what to do; the date field's border turns red too.

**Open questions:** none

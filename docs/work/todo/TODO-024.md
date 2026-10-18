# TODO-024 — Every form says which field is missing, at the field

Filed from `reviewer-frontend`'s release sweep of 2026-10-17 (the procedure view's Save enabled with the type unchanged), widened by the owner on 2026-10-18: "we need to have a consistent way" — "either button is always on, but it is validate and possibly refuse with the missing fields info (red info under the field) or the button is greyed"; asked which, the owner chose the first. Today a greyed Submit never says which field is missing: no required marker, and PRO-120's per-field messages cannot be reached (DEBT-064). Candidates read (`disabled={!…}`, the design pass sorts which are form submits): `ProcedureFormModal`, `CreatePatientForm`, `RecordOverpaymentModal`, `ReconciliationModal`, `AddBankTransferForm`, `EditBankTransferModal`, `PeriodSelector`, `ProcedureList`.

**Size:** XL — a programme: a design pass over every form, a frontend rule, then one pull request per form or group. Its first slice is proposed at `/plan-queue`.

**User value:** in any form, the user presses Save and is told, under each field, what is missing; an edit with nothing changed says so instead of saving nothing.

**Done when:** (draft) a rule in `docs/frontend-rules.md` states it; every form's Submit is enabled while it is not saving; a click with a required field empty shows the red message under that field and sends nothing; an edit with nothing changed shows a message and sends nothing; the procedure form meets PRO-120 as written; each form has a Vitest test of the click on missing fields; screenshots.

**Design:** needed — the messages and the "nothing changed" answer, mocked for each form before anything is built.

**Open questions:**

- [ ] The size and the first slice, at `/plan-queue`.
- [ ] Where "nothing changed" is said: under the form, or as a snackbar?

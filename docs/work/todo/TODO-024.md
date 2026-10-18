# TODO-024 — Every form says which field is missing, at the field

Filed from `reviewer-frontend`'s release sweep of 2026-10-17 (the procedure view's Save enabled with the type unchanged), widened by the owner on 2026-10-18: "we need to have a consistent way" — "either button is always on, but it is validate and possibly refuse with the missing fields info (red info under the field) or the button is greyed"; asked which, the owner chose the first. Today a greyed Submit never says which field is missing: no required marker, and PRO-120's per-field messages cannot be reached (DEBT-064). Candidates read (`disabled={!…}`, the design pass sorts which are form submits): `ProcedureFormModal`, `CreatePatientForm`, `RecordOverpaymentModal`, `ReconciliationModal`, `AddBankTransferForm`, `EditBankTransferModal`, `PeriodSelector`, `ProcedureList`.

**Size:** XL — a programme: a design pass over every form, a frontend rule, then one pull request per form or group. Its first slice is proposed at `/plan-queue`.

**User value:** in any form, the user presses Save and is told, under each field, what is missing; an edit with nothing changed says so instead of saving nothing.

**Decided (owner, 2026-10-18):** the backend is the only judge. The screen does not validate: Submit sends the form; the command checks every field and answers all its refusals at once, each tied to its field (`docs/error-model.md`); the screen shows each in red under its field, and clears a message once its field is edited (display only). An edit with nothing changed is decided by the backend too: the update command compares what it receives with the stored row, writes nothing and answers "unchanged"; the screen closes the dialog. One story with DEBT-043 (the form validators moving to Rust) and TODO-018 (the procedure's refusals): the backend refuses, the screen shows the reason at the field.

**Done when:** (draft) a rule in `docs/frontend-rules.md` states it; every form's Submit is enabled while it is not saving; a submit with a required field empty is refused by the command with that field's reason, shown in red under the field, nothing written; an edit with nothing changed is answered "unchanged" by the command, nothing written, the dialog closed; PRO-120 and PRO-250 (the update now compares) and the contracts carry it; Rust tests per refusal and for "unchanged", a Vitest test per form of the field messages; screenshots.

**Design:** needed — the messages and the "nothing changed" answer, mocked for each form before anything is built.

**Open questions:**

- [ ] The size and the first slice, at `/plan-queue`.
- [x] Where "nothing changed" is said: nowhere — the backend answers "unchanged" and the dialog closes (owner, 2026-10-18).

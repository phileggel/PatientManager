# TODO-024 — The procedure view's Save stays enabled when the type has not changed

Filed by the agent from `reviewer-frontend`'s release sweep of 2026-10-17 (`ProcedureFormModal.tsx`, the view mode's `procedure-form-modal-save-type`): since DEBT-062 the view of a paid or reconciled procedure has a Save button, enabled whenever a type is selected, so it saves an unchanged type (harmless: the update is the same).

**Size:** S

**User value:** the Save button of a procedure's view only invites a save once the type was changed.

**Done when:** in view mode the Save button is disabled until the selected type differs from the procedure's; a Vitest test proves both states; screenshots.

**Design:** needed — a button's state changes (the mock of DEBT-062 showed it enabled).

**Open questions:**

- [ ] The owner confirms this entry.

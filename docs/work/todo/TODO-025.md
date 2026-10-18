# TODO-025 — The procedure list and patient search miss three things their spec promises

Filed at `/plan-queue` (2026-10-18) from DEBT-064's visible points, with the owner's yes. Read in the code: `ProcedureList.tsx` has no `onDoubleClick`, only the Edit button opens a row (PRO-040); `StatusBadge.tsx` has no case for `PARTIALLY_RECONCILED` nor `PARTIALLY_FUND_PAYED`, which fall to the grey default (PRO-090); a patient search with no match shows no neutral message (PRO-150, PRO-160; `ComboboxField.tsx`).

**Size:** M — mocks, then one frontend pull request.

**User value:** a double-click opens a procedure; a partly paid procedure reads differently from an unpaid one; a patient search that finds nothing says so.

**Done when:** a double-click on a row opens the modal in its status's mode, as the Edit button does (PRO-040); the two partial statuses have a badge colour of their own, distinct from the neutral one (PRO-090); a patient search with no result shows the neutral message, with the creation button still shown in creation mode only (PRO-150, PRO-160); a Vitest test per rule; screenshots; DEBT-064 no longer lists these points. Refined (2026-10-18): `ProcedureList.tsx`, `StatusBadge.tsx`, `ComboboxField.tsx` / `useComboboxField.ts` read.

**Design:** validated (owner, 2026-10-18) — `screenshots/design/TODO-025-*.png`: the partial statuses outlined in their family colour; the no-result message above the create action.

**Open questions:** none

# TODO-029 — The refund form greys its Save instead of naming the missing field

Fourth slice of TODO-024 (owner, 2026-10-18). Read in the code: `RecordOverpaymentModal.tsx:221` disables its submit on a missing refund date, transfer type or bank account; the backend answers one refusal at a time (`InvalidRefundDateFormat`, `src/features/procedure/shared/presenter.ts`).

**Size:** M — proposed: mocks and one pull request across the overpayment command and its screen.

**User value:** in the refund form, the user presses Save and is told, under each field, what is missing.

**Done when:** (draft) the submit is enabled while not saving; the command refuses a missing date, transfer type or account together, nothing written; each reason shows under its field; `docs/spec/overpayment.md` and the contract carry it; Rust tests per refusal, a Vitest test of the field messages; screenshots.

**Design:** needed — the field messages, mocked.

**Open questions:**

- [ ] The size: proposed M, for the owner to confirm.

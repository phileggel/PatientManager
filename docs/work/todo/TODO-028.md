# TODO-028 — The fund payment forms grey their Save instead of naming the missing field

Third slice of TODO-024 (owner, 2026-10-18). Read in the code: `AddFundPaymentPanel.tsx:135` disables Save on a missing fund, date or selection, checked on screen by `fund-payment/shared/validatePayment.ts`, the other of DEBT-043's form validators; `EditFundPaymentModal.tsx` disables on `loading || isReadOnly` only. The backend does not refuse an empty selection today (FPM-200, DEBT-043).

**Size:** L — proposed: mocks, the fund contract, two pull requests.

**User value:** in the fund payment forms, the user presses Save and is told, under each field, what is missing; an edit with nothing changed closes the dialog without saving.

**Done when:** (draft) Save is enabled while not saving; the create and update commands answer `FundPaymentGroupInvalid { reasons }` (fund, date, at least one procedure), nothing written; each reason shows under its field; an unchanged edit answers "unchanged"; `validatePayment.ts` is gone from `src/` and from `arch-allowlist.json` (DEBT-043's fund half), the check before opening the procedure picker staying as display state; FPM-200 and the contract carry it; Rust tests per refusal, Vitest per form; screenshots.

**Design:** needed — the field messages, mocked.

**Open questions:**

- [ ] The size: proposed L, for the owner to confirm.

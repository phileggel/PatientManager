# TODO-027 — The bank transfer forms grey their Save instead of naming the missing field

Second slice of TODO-024 (owner, 2026-10-18). Read in the code: `AddBankTransferForm.tsx:129` and `EditBankTransferModal.tsx:82` disable Save on `!isValid`, computed on screen by `bank-transfer/shared/validateBankTransfer.ts`, one of DEBT-043's two form validators. `BankEntry::validate` answers one reason at a time (DEBT-043: `BankEntryInvalid { reasons }` changes the codes of every command that creates a bank entry, the matching paths included).

**Size:** L — proposed: mocks, the bank contract, two pull requests.

**User value:** in the bank transfer forms, the user presses Save and is told, under each field, what is missing; an edit with nothing changed closes the dialog without saving.

**Done when:** (draft) Save is enabled while not saving; the create and update commands answer `BankEntryInvalid { reasons }` (account, date, at least one item), nothing written; each reason shows under its field; an unchanged edit answers "unchanged"; `validateBankTransfer.ts` is gone from `src/` and from `arch-allowlist.json` (DEBT-043's bank half); the bank manual-match spec (R3) and the contract carry it; Rust tests per refusal, Vitest per form; screenshots.

**Design:** needed — the field messages, mocked.

**Open questions:**

- [ ] The size: proposed L, for the owner to confirm.

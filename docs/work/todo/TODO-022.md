# TODO-022 — (backend + frontend/fund-payment-match) — A group the fund takes back is recorded, not left out

Draft from the owner's words (chat, 2026-10-10 and 11), to confirm. In a fund statement, a group whose stated total is zero or negative is the fund taking money back. Since 0.24.2 such a group is read, named to the user and left out of the import (FPA-070 to FPA-072): the amount is recorded nowhere, and the user is asked to note it. The owner expected the application to handle the case; a manual refund already creates a group with a negative total (REF-100), by another path.

**Size:** L — a spec interview with the owner, then backend and frontend.

**User value:** the user imports a statement in which the fund takes money back, and the recovery is recorded and reconciled by the application instead of kept on a note.

**Done when:** (draft) a rule set written with `/spec-writer` says how a group whose stated total is not positive is imported; such a group is created with its procedures and no longer left out; the notice of FPA-071 is gone or says what was recorded; Rust tests cover the creation and its refusals, one E2E the import of a statement holding such a group.

**Design:** needed — mocks before anything is built.

**Open questions:**

- [ ] The owner confirms this entry: it is a draft.
- [ ] How is such a group reconciled with the bank, where it never appears as a credit — netted against another payment of the fund?
- [ ] Is the refund linked to the procedure it takes back, which then reads as overpaid, as a manual refund does (REF-130, REF-160)?
- [ ] A group whose total is exactly zero: a recovery, or a payment exactly offset?
- [ ] A group whose total is not positive but holds positive lines the fund settled by netting: what becomes of their procedures?
- [ ] Should the parser keep a person's name out of a fund label (DEBT-051), since these are the groups where it appears?

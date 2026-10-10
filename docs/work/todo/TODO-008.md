# TODO-008 — (frontend/fund-payment-match) — Create multiple procedures during auto-correction

Currently, the auto-correction flow only allows creating a single procedure. It should support creating multiple procedures in the same operation.

**User value:** the user creates every missing procedure of a fund payment line in one correction, not just one.

**Done when:** in the correction of a fund payment line with no matching procedure, the user can add several procedures, each with its date and amount; the correction is accepted only when the amounts add up to the line's amount; every created procedure joins the fund payment group and ends `Reconciliated` after confirmation, as FPA-250 does for one. The spec and the contract carry the rule; Rust tests cover the sum check and the creation, one E2E the flow.

**Design:** none

**Open questions:** none

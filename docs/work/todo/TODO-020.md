# TODO-020 — (backend) — `FundPayment` aggregate root above the groups

Fourth entry split from TODO-006. `FundPaymentGroup` is treated as the top-level object; the monthly document that holds all the groups, `FundPayment`, has no aggregate of its own.

**User value:** none directly — the fund payment document becomes a named concept the code and the specs share.

**Done when:** an ADR records the `FundPayment` aggregate and what it owns; the aggregate exists and the groups are reached through it; `docs/ubiquitous-language.md` carries the term; behaviour is unchanged. Comes after TODO-019.

**Design:** none

**Open questions:** none

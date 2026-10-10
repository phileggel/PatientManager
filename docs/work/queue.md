# Queue

Owned by the human (`docs/workflow.md` § 2): the entries of one batch, in the order to
work them. Written once per batch, in `/whats-next`, as the human validated it; no pull
request that ships an entry touches it. `just whats-next` says what has shipped.

<!-- One reference per line, as a plain list: `- TODO-NNN`, `- DEBT-NNN`, `- FLOW-NNN`, -->
<!-- or `- gh#NN` for a Dependabot pull request. -->

<!-- Exception (owner, 2026-10-04): the flow entries of this queue ship as bundles, one -->
<!-- pull request per bundle, each one story: FLOW-022 to FLOW-023 (the decided rules -->
<!-- written into `docs/workflow.md` and `CLAUDE.md`); FLOW-005 to FLOW-007 (the tools -->
<!-- nobody used are removed); FLOW-011 with FLOW-018 (the release path). Every other -->
<!-- entry ships alone. -->

<!-- Cut (owner, 2026-10-05 and 06): 0.24.1 ships with TODO-016 closed on its first three -->
<!-- features; its remainder is DEBT-043, for the next release. Moved to the next -->
<!-- batch, in the order they were queued, for `/whats-next` to propose again: -->
<!-- TODO-013, FLOW-020, TODO-008, TODO-018, DEBT-011, TODO-019, DEBT-003, TODO-020, -->
<!-- TODO-021. -->

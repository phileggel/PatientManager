# Queue

Owned by the human (`docs/workflow.md` § 2): the entries of one batch, in the order to
work them. Written once per batch, in `/whats-next`, as the human validated it; no pull
request that ships an entry touches it. `just whats-next` says what has shipped.

<!-- One reference per line, as a plain list: `- TODO-NNN`, `- DEBT-NNN`, `- FLOW-NNN`, -->
<!-- or `- gh#NN` for a Dependabot pull request. -->

<!-- Validated by the owner on 2026-10-10, for the batch after 0.24.1. -->
<!-- Bundles, one pull request each: FLOW-029 with FLOW-035 (both change `/whats-next` -->
<!-- and `/next-todo`); FLOW-030 with FLOW-033 and FLOW-034 (three decided sentences for -->
<!-- `docs/workflow.md` and `CLAUDE.md`). Every other entry ships alone. -->
<!-- FLOW-032: the fund contract first, then one pull request per contract. -->
<!-- DEBT-043: the two form validators only; the entry says so. -->
<!-- FLOW-037 added by the owner on 2026-10-10, after the flow bundles. -->
<!-- Cut (owner, 2026-10-10): the batch is released on what shipped, with two fixes met -->
<!-- in production (a PDF with no text; a statement with a refund-only group). Moved to -->
<!-- the next batch, in the order they were queued, for `/whats-next` to propose again: -->
<!-- FLOW-032, FLOW-031, FLOW-020, TODO-018, DEBT-011, TODO-019, TODO-008, DEBT-043. -->

- FLOW-029
- FLOW-035
- FLOW-030
- FLOW-033
- FLOW-034
- FLOW-037
- DEBT-036
- DEBT-044
- DEBT-038

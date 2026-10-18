# Queue

Owned by the human (`docs/workflow.md` § 2): the entries of one batch, in the order to
work them. Written once per batch, in `/plan-queue`, as the human validated it; no pull
request that ships an entry touches it; the audit's pull request empties the list and
its notes. `just queue` says what has shipped.

<!-- One reference per line, as a plain list: `- TODO-NNN`, `- DEBT-NNN`, `- FLOW-NNN`, -->
<!-- or `- gh#NN` for a Dependabot pull request. -->

<!-- Batch of 2026-10-18, user-facing (owner). TODO-026 is TODO-024's first slice; the -->
<!-- other slices are TODO-027 to TODO-029, left for the batch after with TODO-018. -->
<!-- Order: gh#320 first (tools); TODO-025 before TODO-026 (small fixes a user notices -->
<!-- early), on the same screen; TODO-008 last, its new form following TODO-026's rule. -->

- gh#320
- TODO-025
- TODO-026
- TODO-008

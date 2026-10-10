# FLOW-030 — The agent named the release before the release tool did

- Kind: quality
- Observed: the batch was called "0.25.0" in every status message and in four documents
  (the queue comment, DEBT-043 to DEBT-046, FLOW-019, a pull request title). `just release`
  proposed 0.24.1: no commit of the batch is a `feat`. Corrected in this pull request,
  except the merged titles of #203 and #206, which stay.
- Proposal: a batch is named by its dates until `just release --dry-run` has proposed a
  version; `/whats-next` and the agent say "the next release". One line in
  `docs/workflow.md` § release.
- Decision (owner, 2026-10-06): accepted. A batch is named by its dates until
  `just release --dry-run` has proposed a version; the line goes into `docs/workflow.md`.
- Costs: nothing. Protects: documents that name a release that never existed.

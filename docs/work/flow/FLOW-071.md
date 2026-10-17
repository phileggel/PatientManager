# FLOW-071 — Release sweep of 2026-10-12: what the guides and infra lanes found

- Kind: quality
- Size: S
- Observed: the release sweep before the release after 0.24.4, run in the new scope
  (the files changed since `v0.24.4`). `reviewer-guides`, 🟡: `CLAUDE.md` § Commands still
  says "the security release sweep" where the sweep is now every lane; `CLAUDE.md` § Who
  decides what states the trivial-question rule without its criterion (the options differ
  in cost, risk or what is seen); `docs/workflow.md` § Release sweep and `/run-queue` name
  "the sweep's pull request" that no step creates. 🔵: "so answered" in the Banked bullet
  does not say by whom; the § 12 Decision sentence runs long; the two size-check steps
  could be one sentence; the headless sleep of `/run-entry` exit 6 names no end.
  `reviewer-infra`, clean, with four CI proposals: cache the `just` and `sqlx-cli` installs;
  a `::notice::` when a lane stopped on the usage limit; a scheduled re-run after the reset;
  CI minutes per workflow in the audit, `timeout-minutes` set from the observed p95.
- Proposal: one docs pull request fixes the three 🟡 and the 🔵 wordings; the sweep's pull
  request is the one that files what the sweep found, and § Release sweep says so. The CI
  proposals are weighed one by one: the install cache and the notice cost a few lines
  each; the scheduled re-run needs `actions: write` and is the owner's.
- Costs: a docs pull request; the CI proposals a workflow change each.
- Re-checked 2026-10-13 (audit of the 0.24.5 batch, `flow-auditor`): no Decision line. Left.
- Re-checked 2026-10-17 (audit of the 0.24.7 batch, `flow-auditor`): no Decision. #297 is the sweep's own pull request and repeats each lane's files read, so half of its proposal is practice. Left.
- Decision (owner, 2026-10-17): accepted, in one guides pull request with FLOW-077; the CI proposals weighed one by one (banked).
- Re-checked 2026-10-18 (audit of the v0.24.8 batch, `flow-auditor`): decided, not worked; overlaps FLOW-085, one guides pull request should carry both. Left.

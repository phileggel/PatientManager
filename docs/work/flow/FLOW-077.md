# FLOW-077 — Release sweep of 2026-10-17: what the guides and infra lanes found

- Kind: quality
- Size: S
- Observed: the release sweep of 2026-10-17 on the guides and tooling changed since `v0.24.5`. `reviewer-guides`, 🟡: `docs/workflow.md` § 2 Todo entries lists what the agent writes on a todo without the `Refined` line § 2 now gives `/plan-queue`; § 3 "and the code to the run" does not say which choices; `/plan-queue` does not say which kinds it files on the way (§ 2 "Who files"). 🔵: two reflowed lines; the skill's `Refined` sentence without "a todo's in its Done when line". `reviewer-infra`, 🟡: WebdriverIO 10's Node floor (≥ 22.19) against CI's `node-version: 22` — answered by the green E2E runs since #285. Four CI proposals: cache the WebDriver binaries; per-job durations in the audit; a Dependabot canary that runs E2E on a major bump; a `required-checks.json` against job-names check.
- Proposal: one guides pull request for the three 🟡 (the guides are at their ceiling: each needs its cut, FLOW-073); the CI proposals weighed one by one.
- Costs: a docs pull request; a workflow change per CI proposal taken.
- Re-checked 2026-10-17 (audit of the 0.24.7 batch, `flow-auditor`): new, no Decision. Left.

# Queue

Owned by the human (`docs/workflow.md` § 2): the entries of one batch, in the order to
work them. Written once per batch, in `/plan-queue`, as the human validated it; no pull
request that ships an entry touches it. `just queue` says what has shipped.

<!-- One reference per line, as a plain list: `- TODO-NNN`, `- DEBT-NNN`, `- FLOW-NNN`, -->
<!-- or `- gh#NN` for a Dependabot pull request. -->

<!-- Validated by the owner on 2026-10-14, for the batch after 0.24.5: four fixes a user -->
<!-- notices, the application work carried three times, two decided tools. A first -->
<!-- proposal of six flow entries and no `feat` or `fix` was rebalanced at the owner's -->
<!-- question ("your proposed queue is only flow?"). -->
<!-- Eleven pull requests; the last two batches merged 9 and 11 work pull requests. -->
<!-- Each entry carries a `Refined` line of 2026-10-14 with its Done when. -->
<!-- Bundles, one pull request each: DEBT-035 with DEBT-046 (its point 1; point 3 is -->
<!-- a pull request of its own, after it); TODO-019 with -->
<!-- DEBT-057. -->
<!-- Slices: DEBT-045, rule R4 only; DEBT-046, points 1 (with DEBT-035) and 3 only; -->
<!-- DEBT-043, the two form validators only. The rest of each entry stays open. -->
<!-- Order: DEBT-056 before TODO-019, which it clears a site for; FLOW-020 after FLOW-019 -->
<!-- (the same E2E tree), kept with the application work against "tools first". -->
<!-- Left for the batch after: FLOW-056, FLOW-058, FLOW-063 to FLOW-068 (the six open -->
<!-- issues), DEBT-052, TODO-018, FLOW-031, FLOW-032 (first slice: the fund and fund -->
<!-- payment reconciliation contracts), FLOW-054 (after FLOW-073 is decided). -->

- FLOW-069
- FLOW-019
- DEBT-042
- DEBT-045
- DEBT-035
- DEBT-046
- DEBT-056
- TODO-019
- DEBT-057
- DEBT-011
- DEBT-043
- FLOW-020

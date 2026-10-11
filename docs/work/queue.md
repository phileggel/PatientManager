# Queue

Owned by the human (`docs/workflow.md` § 2): the entries of one batch, in the order to
work them. Written once per batch, in `/plan-queue`, as the human validated it; no pull
request that ships an entry touches it. `just queue` says what has shipped.

<!-- One reference per line, as a plain list: `- TODO-NNN`, `- DEBT-NNN`, `- FLOW-NNN`, -->
<!-- or `- gh#NN` for a Dependabot pull request. -->

<!-- Validated by the owner on 2026-10-11, for the batch after 0.24.4: the tools first. -->
<!-- Eleven references on seven lines, about seven pull requests; the batch before had -->
<!-- eleven work pull requests of 23 merged. -->
<!-- Refined before it was queued (owner, 2026-10-11): each entry carries a `Refined` -->
<!-- line with what reading the code found and its Done when. An entry not refined is -->
<!-- not queued. -->
<!-- Bundles, one pull request each: FLOW-049 with FLOW-057 and FLOW-053 (the audit's -->
<!-- figures); FLOW-059 with FLOW-060, FLOW-061 and FLOW-062 (four decisions of -->
<!-- 2026-10-11 written into the guides, which are at their ceiling). -->
<!-- Order: gh#242 before FLOW-052, because it moves the pin of the reviewer action that -->
<!-- FLOW-052 has to read. -->
<!-- Left for the batch after, to refine first: FLOW-051 (after the owner's edit of the -->
<!-- settings), FLOW-054, FLOW-056, FLOW-058, FLOW-063 to FLOW-068, DEBT-056, DEBT-058, -->
<!-- and the application work carried over twice: TODO-018, TODO-019, DEBT-011, -->
<!-- DEBT-052, FLOW-020, FLOW-031, FLOW-032, DEBT-043, TODO-008. -->

- FLOW-050
- gh#242
- FLOW-052
- FLOW-055
- FLOW-049
- FLOW-057
- FLOW-053
- FLOW-059
- FLOW-060
- FLOW-061
- FLOW-062
- DEBT-060

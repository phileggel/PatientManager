# Queue

Owned by the human (`docs/workflow.md` § 2): the entries of one batch, in the order to
work them. Written once per batch, in `/plan-queue`, as the human validated it; no pull
request that ships an entry touches it; the audit's pull request empties the list and
its notes. `just queue` says what has shipped.

<!-- One reference per line, as a plain list: `- TODO-NNN`, `- DEBT-NNN`, `- FLOW-NNN`, -->
<!-- or `- gh#NN` for a Dependabot pull request. -->

<!-- Validated by the owner on 2026-10-17, for the batch after 0.24.7: twelve work pull -->
<!-- requests (thirteen if TODO-018 needs a third); the last two batches merged 13 and 9. -->
<!-- The owner set the range at 10 to 15. Ends with a release: DEBT-062 is a `fix`. -->
<!-- Each entry carries a `Refined` line of 2026-10-17 with its Done when. -->
<!-- Bundles, one pull request each: FLOW-079 with FLOW-068; FLOW-074 with FLOW-066 and -->
<!-- FLOW-067; FLOW-063 with FLOW-064 and FLOW-065; FLOW-056 with FLOW-058; DEBT-048 with -->
<!-- DEBT-061 and DEBT-065's slice. -->
<!-- Slices: FLOW-054, contradictions 1, 2 and 4; DEBT-065, its three 🔵. TODO-018 is two -->
<!-- pull requests: the fund-payment use cases, then the bank ones and the corrections. -->
<!-- Order: FLOW-078 first, since every question of the batch then goes through the tool; -->
<!-- DEBT-062 second against "tools first", so the owner sees its mock while the guides -->
<!-- are worked. -->
<!-- Cut (owner, 2026-10-17): TODO-018, its methods now refuse transitions (a spec -->
<!-- interview first); it opens the next batch. -->
<!-- Left for the batch after: FLOW-054 slice 2, FLOW-031, TODO-020, DEBT-043, the banked -->
<!-- flow entries of 2026-10-17. FLOW-032 superseded by FLOW-079 (owner, 2026-10-17). -->

- FLOW-078
- DEBT-062
- FLOW-079
- FLOW-068
- FLOW-074
- FLOW-066
- FLOW-067
- FLOW-063
- FLOW-064
- FLOW-065
- FLOW-054
- FLOW-056
- FLOW-058
- DEBT-057
- DEBT-048
- DEBT-061
- DEBT-065
- DEBT-052

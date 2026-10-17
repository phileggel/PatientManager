# FLOW-073 — The guide ceilings count lines, and the guides grew in words

- Kind: quality
- Size: S
- Observed: (`flow-auditor`, audit of the 0.24.5 batch) 4 746 lines at both tags;
  39 256 → 39 692 words. `reviewer-guides` +18 % on 33 lines; #274's CI noted a run-on
  line there. Cuts made to fit: #273 Rule 2 lost two conditions (🔴); #275 lost three
  shell rules with a cut section (🟡).
- Proposal: owner's call (§ 5 is the owner's rule of 2026-10-11): ceilings in words, or a
  line-length cap in `just rule-homes`; and a cut for a ceiling is named in the pull
  request with the conditions it moves.
- Costs: re-recording 39 ceilings; a word ceiling still forces cuts. Protects: a ceiling
  that measures what it means to.
- Re-checked 2026-10-17 (audit of the 0.24.7 batch, `flow-auditor`): no Decision. +71 words on +1 line. #284 named its cut — the proposal's second half. Left.
- Decision (owner, 2026-10-17): a line-length cap in `just rule-homes`, and a cut for a ceiling named in its pull request (banked).

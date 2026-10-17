# FLOW-072 — A CI lane passes a text in one round and fails it in the next, and fixes go out unread

- Kind: quality (and speed)
- Size: S
- Observed: (`flow-auditor`, audit of the 0.24.5 batch) 8 criticals only CI found, was 2,
  causing 11 of the 21 rounds beyond the first. At least 3 were on text the same lane had
  passed before: #273 `gh run rerun` at 617e8e3 and cc9eb8d; #275 round 3 at 4e6a773; #274
  one commit, two attempts, two different criticals. The session agent says four second
  pushes and e296aa0 were pushed with no lane reading them (rule 1 of the audit). #275
  (47 lines) took 4 CI guides rounds and five local passes.
- Proposal: owner's call. First, the existing rule is kept: no push until a lane has read
  the fix, a fix of a warning included, and one push per fix. Then either (a) the guides
  and infra lanes run on a stronger model than `sonnet`, locally and in CI; or (b) after a
  CI 🔴, the local lane re-reads the whole changed guide, not the delta, and is asked for
  every 🔴 at once.
- Costs: a few minutes per red round; (a) more of the CI account's usage limit (FLOW-055's
  history). Protects: rounds that each find one more critical that was there from the
  start, and 14 cancelled runs.
- Re-checked 2026-10-17 (audit of the 0.24.7 batch, `flow-auditor`): no Decision. Criticals only CI found 2, was 8; #284 again had "a new 🔴 on text earlier ones passed". Left.

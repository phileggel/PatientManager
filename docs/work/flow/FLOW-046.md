# FLOW-046 — A production fault was diagnosed from its log, not from its input

- Kind: quality
- Observed: on 2026-10-10 a statement could not be validated in 0.24.1. From the log (an
  error code and two negative amounts) the agent stated the cause — "a group made only of
  negative lines, with a negative total" — designed a fix for it with the owner, and
  merged it (#224, nine reviews, about two hours). The parser could not produce a negative
  total: the real cause was a total line it skipped. The release sweep's `spec-checker`
  found it; the original statement, asked for only then, confirmed it in ten minutes, and
  the fix was one character and a test (#231). Two rules existed and were not applied:
  a statement about the code names what was read (`CLAUDE.md`, merged that day), and
  `spec-checker` runs before an entry with spec rules is closed (`docs/workflow.md` § 7).
- Proposal: for a fault met in production, `docs/workflow.md` § 3 asks for the input that
  shows it before any fix is designed, and for a failing test that reproduces it — the
  acceptance test of the fix; when the input holds patient data, the agent says what it
  needs from it and how little. `/run-entry` runs `spec-checker` itself before closing an
  entry that touched a spec, as a step, not a rule to remember.
- Costs: a question to the owner at the start of a production fix; one more agent on the
  entries that carry spec rules. Protects: a fix for the wrong cause, shipped to a user
  who is still blocked.
- Decision (owner, 2026-10-11): accepted; ships with FLOW-042, which rewrites the skill it changes.

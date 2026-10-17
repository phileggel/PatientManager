# FLOW-058 — A CI report is overwritten by the next round, and a finding on a green lane is graded nowhere

- Kind: quality
- Size: S
- Observed: (`flow-auditor`, audit of the 0.24.3 batch) the two critical reports of #252 survive only in the author's summary; the second had to be asked of the session. Five CI findings (2 warnings, 3 suggestions) on #247, #252, #255 and #256 have no line: #255 `reviewer-backend` (the log guard misses a field written without a sigil), #252 `reviewer-guides` (line 9 of the setup document), #247 (one size pattern in three scripts), #256 (two).
- Proposal: each round's report is kept (a comment per round, or the file as an artifact); `/run-entry` reads every lane's comment before `just merge`, green or not, and grades it in a comment, not by editing the description.
- Costs: more comments per pull request, a minute before each merge.
- Decision (owner, 2026-10-11): accepted, for the next queue (banked, FLOW-062).
- Re-checked 2026-10-13 (audit of the 0.24.5 batch, `flow-auditor`): 5 ungraded CI suggestions, was 5. The criticals of #270 and #273–#275 survive only in the authors' summaries. Left.
- Re-checked 2026-10-17 (audit of the 0.24.7 batch, `flow-auditor`): banked, left out of the queue. Ungraded CI findings 4, was 5. The earlier rounds' reports survive in GitHub's comment edit history; reading it meets part of "each round's report is kept". Left.

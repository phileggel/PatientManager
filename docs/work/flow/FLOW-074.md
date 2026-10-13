# FLOW-074 — A fix added after the release sweep to make a release possible ships unswept

- Kind: quality
- Size: S
- Observed: (`flow-auditor`, audit of the 0.24.5 batch) the session agent says
  `just release -y` refused at 18:31 UTC on 2026-10-12 ("No releasable commits"); the
  owner then named DEBT-039 so the release would carry a line. #280 merged after the sweep
  (#278 at 3938adb), and the owner was told "ready" again at about 19:20 with no sweep
  after it. v0.24.4: no sweep on record after #267. § 3 says nothing of a batch without
  `feat` or `fix`.
- Proposal: § 3 says what a batch of chores does: no release, or `just release --version`
  on the owner's word, never a fix picked to fill the changelog. The sweep's pull request
  states the commit it read (#278 does). `just release` warns when `main` has application
  commits past that commit, and "ready" waits for a sweep that covers them.
- Costs: a check in `scripts/release.py` (the owner's tool), one more sweep when a fix
  lands late, and a rule the owner writes. Protects: the release-sweep guarantee for the
  release's own fixes, and the queue against work chosen for the release tool's sake.

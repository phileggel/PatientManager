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
- Re-checked 2026-10-17 (audit of the 0.24.7 batch, `flow-auditor`): no Decision, and it recurred: #299, a `chore`, needed a release; the session agent says the owner asked for "a small ticket" so the release would carry a line, and DEBT-063 was picked; no sweep ran after #299 and #300. Its proposal (`just release --version` on the owner's word, never a fix picked to fill the changelog) meets the owner's own request this time. Left, flagged for the owner.
- Decision (owner, 2026-10-17): ending a batch and releasing a version are two things. Every batch ends, released or not, with the same ceremony: the closing brief, the release sweep, a batch marker — an annotated tag that is not a version (`batch/<date>`) — then `/flow-audit` on the range it closes. A version is released only when users get something: a batch with a `feat` or `fix` runs `just release`; after a tag that could not release, the next version carries its unpublished fixes and its notes say so (FLOW-081); a chore-only batch publishes no version, its chores ride in the next release. A fix is never picked to fill a changelog. With FLOW-079, a queue with no TODO is announced at `/plan-queue` as a batch that ends without a release. Costs: `flow-audit.py` accepts a batch marker as a range end, and § 3 Release describes the two endings. "a balance here: if we dont release a chore release ... our workflow is somehow incomplete (no end ceremony). however delivering a no-change as a release, is a lie as well" — "split works".

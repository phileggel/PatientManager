# FLOW-076 — After a hand rebase, just merge can only finish with a force push the agent may not run

- Kind: speed
- Size: S
- Observed: on 2026-10-14, `just merge` on PR #289 stopped on a rebase conflict (`DEBT-046.md`,
  edited by #288 and #289) and said to rebase by hand and re-run. After the hand rebase it
  refused again: the remote branch still held the pre-rebase commits, and its only way on
  was `git push --force-with-lease`, which `CLAUDE.md` rule 1 forbids the agent by hand.
  The agent pushed the rebased commits to a new branch, opened PR #291 and closed #289 —
  one more pull request and one more CI round for the same change.
- Proposal: `scripts/merge.py` resolves this case itself, as it already force-pushes with
  lease for the folded commit (FLOW-056): after a hand rebase whose tree holds every commit
  of the remote branch, it pushes with lease and goes on. Or `merge.py` leaves the rebase
  conflict to a merge commit of `main` into the branch, which pushes without force.
- Costs: a branch in `merge.py` and a test. Protects: a closed pull request and a CI round
  each time two pull requests of a batch edit the same entry file.
- Re-checked 2026-10-17 (audit of the 0.24.7 batch, `flow-auditor`): no Decision. Added cause: slices of one entry, prepared side by side, write the same entry file — reopening what § 2's "one file each, deleted when shipped" closed. An alternative to the tool fix: a slice's record goes in its pull request body, and the entry file is edited by a filing pull request or at the last slice. Left.

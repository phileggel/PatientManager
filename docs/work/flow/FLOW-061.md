# FLOW-061 — The release sweep's pull request does not say what each lane read

- Kind: quality
- Size: S
- Observed: (`flow-auditor`, audit of the 0.24.3 batch) #262 reports "Security, architecture, frontend, E2E — nothing that was not already filed" and "no lane found a critical fault in the application's code". The session agent says the eight lanes were launched together and returned after about 6 s (frontend), 14 s (E2E), 19 s (security), 31 s (architecture), 49 s (backend), 125 s (infra), 167 s (guides) and 192 s (migrations), and that the frontend, E2E and security lanes say they read the diff since v0.24.2 or grepped, not every file. None of this is in #262. The setup line gives `reviewer-security` "the whole code before a release".
- Proposal: owner's call on what a sweep reads — the whole surface, or the batch's diff. Either way each lane's report states the files it read, and the sweep's pull request repeats it beside "nothing found".
- Costs: a whole-code sweep takes minutes per lane and more of the usage limit; a diff-only sweep is what CI already did on each pull request.
- Decision (owner, 2026-10-11): accepted — `reviewer-security` reads the whole command surface before every
  release; the other lanes read what changed since the last release. Every lane states the files
  it read, and the sweep's pull request repeats it.
- Refined (2026-10-11, before queuing): Done when: `docs/workflow.md` § Release sweep and `CLAUDE.md` say that `reviewer-security` reads the whole command surface before every release and the other lanes what changed since the last one; `review-protocol.md` asks every sweep report to end with the files read in full and those only searched; `/run-queue` Step 4 repeats it in the sweep's pull request. Ships in the guides bundle of FLOW-059.

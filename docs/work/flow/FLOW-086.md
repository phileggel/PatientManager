# FLOW-086 — A merged pull request's closed run cancels main's push runs

- Kind: quality
- Size: S
- Observed: (`flow-auditor`, audit of the v0.24.8 batch) after #313, d25e342's Quality, Codec Gate and E2E push runs and a3937ae's Quality were cancelled 2–3 s after starting (runs 39069286584, 39069286597, 39069286591, 39069570258); 240bbf1, with no pull request, ran. #313's 23 CI reviews and the sweep did not raise it.
- Proposal: key each concurrency group on the pull request (`github.event.pull_request.number || github.ref`), so a `closed` run joins only its pull request's group; a script test that every workflow listening to `closed` keys its group that way; the release preparation reads `main`'s last push runs.
- Costs: one line in 6 workflows and a test. Protects: `main`'s push runs, the coverage base, and § 3's "`main` green".

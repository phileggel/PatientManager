# FLOW-039 — Every merge sends the other open pull requests through one more CI round

- Kind: speed
- Observed: on 2026-10-10 up to four pull requests were open at once (#220 to #223). Each
  merge moved `main`, so `just merge` rebased the next one and its checks ran again:
  #221, #222, #223 and #224 each took one extra round of about 8 minutes that tested no
  change of their own. Opening them in parallel saved the writing time, not the waiting.
  Record files alone are exempt (`RECORD_DIRS`); a docs or prompt change is not.
- Proposal: owner's call. Keep it (the rebased tree is what lands, and it is tested), or
  let `just merge` skip the re-run when the commits that arrived on `main` touch no path
  the branch's checks read — the scope script already knows the layers.
- Costs: a rule that decides when two changes cannot affect each other; wrong once, it
  merges an untested combination. Protects: about 8 minutes per open pull request per
  merge, in a batch of small pull requests.

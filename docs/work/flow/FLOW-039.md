# FLOW-039 — Every merge sends the other open pull requests through one more CI round

- Kind: speed
- Size: S
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
- Re-measured 2026-10-11 (audit of the 0.24.3 batch, `flow-auditor`): 0 rounds from a merge moving `main`, was about 6; nothing in the tool
  changed, only one pull request was open at a time.
- Re-checked 2026-10-13 (audit of the 0.24.5 batch, `flow-auditor`): 0 rounds from a moving `main`, second batch running. Proposal for the owner: close with "keep".
- Re-checked 2026-10-17 (audit of the 0.24.7 batch, `flow-auditor`): 2 rounds from a rebase alone, was 0; up to four pull requests open at once around 18:00 UTC on 2026-10-14. Its "close with keep" still waits on the owner. Left.

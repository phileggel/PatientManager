# FLOW-060 — DEBT-050 was sized M and took two pull requests and 1 414 added lines

- Kind: effort
- Size: S
- Observed: (`flow-auditor`, audit of the 0.24.3 batch) #256 says "reading the code showed that only two of the six writes … had a writer". The decision scan of #244 read DEBT-051's code (seven calls, not three) and not DEBT-050's. The entry was deleted still marked M; #261 passed the split threshold of § 11 (1 246 hand-written backend lines in one pull request).
- Proposal: the decision scan checks each queued size against the code the entry names and corrects it on the entry before the branch; a size that changes during the work is written on the entry before it is closed.
- Costs: reading time at the scan. Protects: the audit's only comparison of size.
- Decision (owner, 2026-10-11): accepted, for the next queue (banked, FLOW-062).

# FLOW-070 — A size written on the entry before its closure is invisible to the audit

- Kind: quality
- Size: S
- Observed: on 2026-10-12, writing FLOW-060 into `docs/workflow.md` § 3 (PR #275): "a size
  that changes during the work is written on the entry before it is closed". The entry's
  file is deleted by `just queue close` in the same pull request, which lands as one
  commit; `entry_size` in `scripts/flow-audit.py` reads a deleted entry from the commit
  before the one that deleted it — on `main`, the previous merge — so a size corrected in
  the closing pull request is never the one the audit compares. Seen while sizing DEBT-060.
- Proposal: `just queue close <id>` records the entry's last size where the audit can
  read it (a line in the pull request body with a fixed marker, or a ledger file), and
  `entry_size` reads that first; or the size correction is written in a filing pull request
  before the work's own.
- Costs: a few lines in two scripts and a test, or one more pull request per corrected size.
- Re-checked 2026-10-13 (audit of the 0.24.5 batch, `flow-auditor`): no corrected size in the batch to show it. The bundle point joins it: the entries figure counts a bundle's rounds once per entry (54 entry-rounds for 38 rounds). Left.
- Re-checked 2026-10-17 (audit of the 0.24.7 batch, `flow-auditor`): DEBT-043's corrected size went in a filing pull request (#295) before any work — the proposal's second option. No size was corrected in a closing pull request. Left.
- Decision (owner, 2026-10-17): closed: a size corrected goes in a filing pull request before the work (option 2, the practice). To close (banked).

---
name: flow-audit
description: After a batch ends (a release or a batch tag), runs the figures of the batch (`just flow-audit`), launches the `flow-auditor` agent on them with a fresh context, and writes what it returns — the measured section of docs/work/audits.md and the flow entries it proposes. Use once per batch, right after it ends.
---

# Skill — `flow-audit`

The flow is improved on figures, not on impressions (`docs/workflow.md` § 12). The
script counts; an auditor that did not run the batch judges; this session only carries.
The audit proposes entries, which the owner queues or declines.

## When to use

- Once per batch, right after it ends; any session can: the audit reads the records.
- Never during a batch: nothing here runs while work is in progress, and a half-run
  batch measures nothing comparable.

## Step 1 — Measure

```bash
just flow-audit <start> <end> --previous <previous> --pretty > logs/flow-audit.json
```

`<end>`, `<start>`, `<previous>`: the three lines `just batch-ends 3` prints, in that order.
The file is local, never committed; `scripts/flow-audit.py` says what each figure is. If the script fails, say so and stop: figures gathered by
hand are not comparable.

## Step 2 — Launch the auditor

Launch `flow-auditor` with the three tags by label (`previous=`, `start=`,
`end=`) and the path of the figures file, and nothing else: no summary of the batch, no
cause, no conclusion.

When its reply ends with `## Questions`, send the answers to the same agent once — the
fact asked, one line each, "not known" where this session cannot tell — and take its
revised reply, which is final.

## Step 3 — Write what the auditor returned

- Its `## Measured` section goes at the top of `docs/work/audits.md`, as returned. Keep
  the section of the batch before; remove older ones — git keeps them. Its
  `## Not in the records` list goes under it.
- Each entry it says is settled: `just queue close FLOW-NNN`. Each watch: its re-check,
  added to the entry.
- Each entry it proposes is filed with `/file-entry`, in its words.
- Then empty `logs/usage.log` (local, never committed): its figures are recorded, and
  the list of `docs/work/queue.md`, its header kept.

This session corrects a figure only against the script's output, and says so in the
pull request. A finding it disagrees with stays as written; the disagreement goes in
the pull request body, for the owner.

## Step 4 — Hand over

One pull request, docs only: its closing brief lists the figures that moved, the
entries proposed and the emptied queue.

## Rules

1. **The script counts, the auditor judges, the session carries.** No figure in the
   measured section that the script did not print or the auditor did not count.
2. **The owner decides.** Never edit the queue but to empty it; never apply a proposal in
   the audit's own pull request.

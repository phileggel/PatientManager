---
name: flow-audit
description: After a release, measures how the batch moved (pull requests, time to merge, CI rounds and failures, tools used, dead paths in the documents, length of the prompts) against the release before, writes the measured section of docs/work/audits.md, and proposes flow entries only where a figure moved or a rule was not followed. Use once per release, right after it is published.
---

# Skill — `flow-audit`

The flow is improved on figures, not on impressions (`docs/workflow.md` § 12). The
script counts; the skill judges. It decides nothing for the owner: it proposes entries,
which the owner queues or declines.

## When to use

- Once per release, right after it is published, in the session that ran its batch: the
  judging needs that session's context.
- Never during a batch: nothing here runs while work is in progress, and a half-run
  batch measures nothing comparable.

## Step 1 — Measure

```bash
just flow-audit <previous-release> <this-release> --previous <the-one-before> --pretty
```

For the batch that led to `v0.24.1`: `just flow-audit v0.24.0 v0.24.1 --previous v0.23.0
--pretty`. One JSON document:

- `current` beside `previous` — `pull_requests` (merged, first and last number, closed
  without merging, lines added, mean and median minutes from opening to merging, the
  count by commit type) and `ci` (rounds, branches, rounds beyond the first, failures and cancelled runs by
  workflow, the median duration of each workflow's green runs).
- `repository` — `usage` (runs and failures by tool in `logs/usage.log`, the tools it
  never saw, and its first line: a log that starts late covers part of the batch),
  `dangling_paths` (paths a document names that no longer exist), `guides` (the length
  of `CLAUDE.md`, the workflow, the rules docs and every prompt, beside the release
  before).
- `truncated` — what GitHub's lists cut short. When it names anything, the oldest
  figures are incomplete: say so beside them, or raise the limits in the script first.

Two bounds when reading: runs are matched to a pull request by its branch within the
window, so one opened before the window loses its earlier rounds; a failure is counted
per run, so failures can exceed rounds.

If the script fails, say so and stop: figures gathered by hand are not comparable.

## Step 2 — Count what the script cannot

From the session's transcript, for the batch only:

- what caused the rounds beyond the first: a rebase after another merge, a fix after a
  review or a failed check, a cancelled job;
- real defects the reviewers found before merge, each named in a few words, and the
  reviewer claims that were wrong;
- the questions put to the owner: how many, and which the reading before the work
  should have caught;
- every statement met in a document or a prompt that was false or contradicted another
  one: where it stands, and what it cost;
- the skills and agents launched, and those that were not.

State a count only when it was counted; otherwise write "not counted".

## Step 3 — Read the figures through five questions

The owner's questions for every audit (`docs/workflow.md` § 12). Each answer names its
figure or says "nothing to change":

1. **Conflicts** — pull requests closed and replaced, rounds a rebase cost: which layout
   or rule would have kept them apart?
2. **Speed** — where did the batch wait (time to merge, failures, workflow durations)?
   A proposal that buys speed says what it risks: never above quality.
3. **Simpler** — which rule, step, script or check could be folded into another or
   dropped?
4. **Unused** — each tool in `never_run`, each skill and agent not launched: keep, fold
   or remove. A tool only CI runs is never in the log; say so, do not remove it for that.
5. **Guides** — each dangling path (a real dead pointer, or a path created at run
   time?), each false or contradictory statement of Step 2, and each guide that grew:
   is the added text earning its place, or restating another document?

## Step 4 — Write the measured section

In `docs/work/audits.md`, add `## Measured — the <release> batch (<dates>)` at the top,
in the list format of the section before it, each figure beside the previous one
(`35, was 19`), then a "Reading" paragraph of three sentences: what the figures say, not
what was done. Keep the section of the batch before; remove older ones — git keeps them.
Then empty `logs/usage.log` (local, never committed): its figures are recorded.

## Step 5 — Re-read the open flow entries

For every file in `docs/work/flow/`:

- **settled** by a change of the batch → `just whats-next close FLOW-NNN`;
- a **watch** → state what the re-check found;
- a **proposal** neither decided nor declined → leave it, unless a figure now argues for
  or against it: then say so in its text.

## Step 6 — Propose entries

Add a flow entry only where a figure moved the wrong way, a rule of `docs/workflow.md`
or `CLAUDE.md` was not followed, a guide was wrong, or the owner corrected the flow
during the batch. `just whats-next next-id FLOW` gives its id; write the file before
asking for the next id. The format is `docs/workflow.md` § 12: Kind, Observed with its
figure, Proposal, Costs, Protects. "Keep" is a verdict; where nothing needs changing,
propose nothing.

## Step 7 — Hand over

One pull request, docs only. Its closing brief lists the figures that moved and the
entries proposed, for the owner to decide and queue in the next `/whats-next`.

## Rules

1. **The script counts, the skill judges.** No figure in the measured section that the
   script did not print or Step 2 did not count.
2. **Beside the previous release.** A figure alone says nothing.
3. **Quality first.** An entry that buys speed says what it risks; one that buys safety
   says what it costs.
4. **The owner decides.** Never edit the queue; never apply a proposal in the audit's
   own pull request.

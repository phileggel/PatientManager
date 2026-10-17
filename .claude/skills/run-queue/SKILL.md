---
name: run-queue
description: Runs a whole batch in chat — every remaining entry of the queue (docs/work/queue.md) through /run-entry, one after the other, then the batch's end (a release or a batch tag), then /flow-audit. Chains the existing skills and decides nothing new. Use when the owner says to run the queue.
---

# Skill — `run-queue`

A batch from its queue to its audit (`docs/workflow.md` § 3 and § 9). Every step below
is an existing skill or rule; this file only puts them in order, so the steps are loaded
and not remembered.

## Step 0 — Preconditions

Chat only. `git status --short` is empty and `main` is fresh (`git pull --ff-only`);
otherwise stop and report.

## Step 1 — Read the queue and show it

`just queue` prints the queue, what has shipped, what remains, and the notes of the
queue file: the bundles (several entries, one pull request) and the slices (the part of
a programme this batch takes). `TaskCreate` one task per remaining reference in order —
a bundle is one task — then "Closing brief and batch end" and "Flow audit". Mark each task
`in_progress` when it starts, `completed` once merged; `/run-entry` creates none under it.

## Step 2 — Ask first

For every remaining entry, before any of them starts: the decision scan of
`docs/workflow.md` § 3, and `/design-proposal` for each entry that changes what the user
sees and is not `validated`. Put the questions and the mocks to the owner one at a time;
write each answer into its entry. These land in one docs pull request before the first
task, so the queue then runs without waiting on the owner.

## Step 3 — Run the entries

For each remaining reference that is ready, in order: `/run-entry <ref>`, naming the
partners of a bundle and the slice of a programme as the notes give them. While a pull
request waits for its checks, the next task may be prepared on a branch not pushed yet
(`docs/workflow.md` § 11).

Stop, and say where, when `/run-entry` stops by its own rules (an open question, the
same gate red three times, the three-hour budget). An entry that is not ready is said
so and skipped.

## Step 4 — Say what the batch achieved, then end it

When `just queue remaining` prints nothing, the closing brief of the queue, before
anything else: what shipped (each entry with its pull request), what a user notices
(the `feat` and `fix` titles, or "nothing"), what was filed during the run, and what
was left — skipped, stopped or not ready — with why.

Then `/dep-audit`, the release sweep and `spec-checker` on every spec the batch touched
(`docs/workflow.md` § Release sweep); what they find is filed as debt, and the sweep's
pull request repeats what each lane read. Then the batch ends as `docs/workflow.md` § 3
says: with a `feat` or `fix`, tell the owner the release is ready, with what was filed;
without, `just batch-end` on a fresh `main`.

## Step 5 — Publish and audit

Once released and published (`docs/workflow.md` § 3), or tagged: `/flow-audit`, once.

## Rules

1. It chains; it decides nothing. A choice a step does not settle goes to the owner.
2. Never edit the queue (`/flow-audit` empties it), never run `just release`, never skip
   an entry silently.
3. One batch per invocation: it ends with the audit's pull request.

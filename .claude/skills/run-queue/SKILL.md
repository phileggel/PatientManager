---
name: run-queue
description: Runs a whole batch in chat — every remaining entry of the queue (docs/work/queue.md) through /next-todo, one after the other, then the release preparation, then /flow-audit once the release is published. Chains the existing skills and decides nothing new. Use when the owner says to run the queue.
---

# Skill — `run-queue`

A batch from its queue to its audit (`docs/workflow.md` § 3 and § 9). Every step below
is an existing skill or rule; this file only puts them in order, so the steps are loaded
and not remembered.

## Step 0 — Preconditions

Chat only. `git status --short` is empty and `main` is fresh (`git pull --ff-only`);
otherwise stop and report.

## Step 1 — Read the queue and show it

`just whats-next` prints the queue, what has shipped, what remains, and the notes of the
queue file: the bundles (several entries, one pull request) and the slices (the part of
a programme this batch takes). `TaskCreate` one task per remaining reference in order —
a bundle is one task — then "Prepare the release" and "Flow audit". Mark each task
`in_progress` when its work starts and `completed` when its pull request has merged.

## Step 2 — Ask first

For every remaining entry, before any of them starts: the decision scan of
`docs/workflow.md` § 3, and `/design-proposal` for each entry that changes what the user
sees and is not `validated`. Put the questions and the mocks to the owner one at a time;
write each answer into its entry. These land in one docs pull request before the first
task, so the queue then runs without waiting on the owner.

## Step 3 — Run the entries

For each remaining reference that is ready, in order: `/next-todo <ref>`, naming the
partners of a bundle and the slice of a programme as the notes give them. While a pull
request waits for its checks, the next task may be prepared on a branch not pushed yet
(`docs/workflow.md` § 11).

Stop, and say where, when `/next-todo` stops by its own rules (an open question, the
same gate red three times, the three-hour budget). An entry that is not ready is said
so and skipped.

## Step 4 — Prepare the release

When `just whats-next remaining` prints nothing: `/dep-audit`, the release sweep and
`spec-checker` on every spec the batch touched (`docs/workflow.md` § Release sweep);
what they find is filed as debt. Then tell the owner the release is ready, with what was
filed. The owner runs `just release`; this skill never does.

## Step 5 — Publish and audit

Once the owner has released: wait for the release workflow and `main` to be green,
publish the draft, and stop if anything is red (`docs/workflow.md` § 3). Then
`/flow-audit`, once.

## Rules

1. It chains; it decides nothing. A choice a step does not settle goes to the owner.
2. Never edit the queue, never run `just release`, never skip an entry silently.
3. One batch per invocation: it ends with the audit's pull request.

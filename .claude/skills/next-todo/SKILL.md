---
name: next-todo
description: Runs one task end to end under docs/workflow.md — branch, design gate, acceptance tests, implementation, harness, reviewers, PR, merge on green, closure. The task is the first ready entry of docs/todo.md § Next (headless, no argument), an entry the human names (TODO-NNN / DEBT-NNN), or a plain request typed in chat. One task per invocation.
argument-hint: "[TODO-NNN | DEBT-NNN | a request]"
---

# Skill — `next-todo`

One invocation, one task, to a merged pull request. The rules are `docs/workflow.md`;
this file is the checklist.

## Step 0 — Preconditions and mode

- `git status --short` is empty and `main` is fresh (`git pull --ff-only`). Otherwise
  stop and report; never work on a dirty tree.
- **Headless** (no argument): read `docs/todo.md` § Next and take the references in
  order. Nobody to ask: a question becomes a line in the entry's `**Open questions:**`.
- **Chat, named entry** (`TODO-NNN` / `DEBT-NNN`): load it (`## TODO-NNN — …` in
  `docs/todo.md`, `## … — DEBT-NNN — …` in `docs/techdebt.md`).
- **Chat, plain request**: the request is the task; no todo entry is created — the PR
  body is its record. Write its Done when into the opening brief.
- **Ready** = a Done when exists, `**Open questions:** none`, and `**Design:**` is
  `none` or `validated`. Headless: skip what is not ready; if nothing is, print which
  questions block which entries and stop. Chat: ask all open questions together, once,
  before anything else; write the answers into the entry (they land in the same PR).

## Step 1 — Opening brief, branch, task list

- Opening brief (chat: first message; headless: top of the PR body):
  **Task** — the entry or the request in one line · **Scope** — commit type and layers ·
  **Design** — none / validated / needed · **Touching** — the paths.
- `git checkout -b <type>/todo-NNN-<slug>` (`<type>/debt-NNN-<slug>`, or
  `<type>/<slug>` for a plain request), `<type>` being the commit type the change will
  carry.
- `TaskCreate` one task per step below; mark each `in_progress` / `completed`.

## Step 2 — Design gate

If the task changes anything the user sees and `Design` is not `validated`: run
`/design-proposal <id>`.

- Chat: show the mocks and ask. Nothing is built before a yes; on a yes, set the line
  to `validated` (it lands in the same PR). On a no, write what the human wants as an
  open question and stop.
- Headless: merge the proposal as a docs PR, then back to Step 0 for the next ready
  entry. Do not implement.

## Step 3 — Acceptance first

- Read the convention docs the layers require (CLAUDE.md § Mandatory pre-read).
- Every Done-when clause becomes a failing test: Rust for logic, Vitest for rendering,
  E2E for what a user does. Test names carry the id or the spec rule; a new business
  rule goes into `docs/spec/<feature>.md`, a changed command into the domain contract,
  in the same commit.
- Run the suites; confirm the new tests are red. A clause that cannot become a test is
  an open question: write it, commit, stop.

## Step 4 — Implement

Smallest change to green, the right way (`docs/workflow.md` § 6). No patient data in
logs, fixtures, commits or PR text.

## Step 5 — Harness

`just harness` until green. A coverage floor is met with tests, never by lowering
`coverage-gates.json`; an architecture violation is fixed in code, never by raising
`arch-allowlist.json`.

## Step 6 — Reviewers

Launch exactly the lanes `bash scripts/branch.sh files | bash scripts/review-lanes.sh`
prints, in one batch. Grade every finding (`docs/workflow.md` § 7) and apply the policy.
Run the lanes again on the fixes until no 🔴 remains.

## Step 7 — Evidence and commit

`/visual-proof` for every changed `.tsx` / `.css`. One commit, title only:
conventional, at most 72 characters; for `feat` / `fix` the title is the changelog line
and names what a user notices.

## Step 8 — Pull request and merge

- Push, `gh pr create --body-file`. Body under 20 lines: the task, each Done-when clause
  with the test that proves it, findings that changed something, techdebt filed,
  screenshots.
- Watch the checks with a `Monitor` on the head commit's check runs (newest run per
  name; flag a check stuck in `in_progress` with a completion time set).
- A red reviewer lane: read its sticky comment, grade, apply, push. A CI finding the
  local run missed also becomes a rule in that reviewer's prompt, same PR.
- Any other red: fix with `git commit --fixup <sha>` (never a new titled commit, never a
  force-push), push, watch again. The same gate red three times: open question, leave
  the PR open, stop.
- All green: `just merge` — it folds the fixups, so the task lands as one commit.

## Step 9 — Closure

In the same PR, before the merge: the entry removed from `docs/todo.md`, techdebt the
work resolved removed, `ARCHITECTURE.md` if a module appeared, design proposal images
deleted. Then the closing brief: what changed for the user (or "nothing — internal"),
what the project gained (tests, coverage); the PR number and where anything still owed
was filed.

## Rules

1. Headless never asks the human; questions are lines in the entry.
2. Never lower a floor, raise an allowlist, bypass a hook, force-push, push to `main`,
   touch the installed app's data, cut a release, edit a released changelog line,
   or edit Next.
3. One task per invocation. Stop after Step 9.
4. Three hours of wall clock per task; over that, open question and stop.

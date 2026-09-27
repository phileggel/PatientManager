---
name: design-proposal
description: Produces the design proposal required before anything the user sees changes — rendered mocks of the target state in light and dark under screenshots/design/, plus a five-line note — for a todo entry or a chat request. Invoked as `/design-proposal <id>` (TODO-NNN, DEBT-NNN, or a short slug for a chat request). The human validates; nothing visible is built before that.
argument-hint: "[TODO-NNN | DEBT-NNN | slug]"
---

# Skill — `design-proposal`

The proposal is what the human validates instead of the pull request (`docs/workflow.md`
§ 4). It shows the target state with the real components and tokens, so what they
approve is what ships.

## Step 1 — Read the task

Load the entry (`## TODO-NNN — …` in `docs/todo.md`, `## … — DEBT-NNN — …` in
`docs/techdebt.md`) or take the chat request. From it and its Done when, list the
screens and states that change: one state per distinct thing the human must see (the
row with the new column, the dialog with the moved buttons, the empty case if it
changes).

## Step 2 — Build the target state as a preview

Follow `/visual-proof` Steps 0 (config), 3 (write `preview.html` and
`src/__preview__/main.tsx`) and 4 (capture script and Playwright present), with one
difference: the preview renders the **proposed** component tree, not the current one.
Copy the current component into the preview where the change is layout-only, or compose
the target from existing `ui/` components with sample data for a new surface. Sample
data is invented, never copied from the installed app. Never modify the real component
for a proposal; the preview is disposable.

## Step 3 — Capture into the design folder

`/visual-proof` Step 5 with the output directory changed: start Vite in the background,
wait until the preview answers, capture, stop Vite.

```bash
VP_PORT={port} VP_HOST={host} VP_NAME={id} VP_STATES={state1,state2} VP_OUT_DIR=screenshots/design node scripts/visual-proof-capture.mjs
```

Produces `screenshots/design/{id}-{light|dark}-{state}.png`. Delete `preview.html` and
`src/__preview__/` afterwards.

## Step 4 — Write the note

`screenshots/design/{id}.md`, five lines at most: what moves, what is added, what is
removed, what stays the same, one open point if any.

## Step 5 — Ask, or record

- **Chat:** show the images and the note, and ask. On a yes, set the entry's line to
  `**Design:** validated` (a chat request has no entry: say so in the PR body) and
  continue the task; the images land in the same PR. On a no, write what the human
  wants as an open question and stop.
- **Headless:** set `**Design:** proposed (screenshots/design/{id}-*.png)`, commit the
  images, the note and the todo edit as one `docs:` commit, open the PR, merge on
  green. The human validates by editing the line to `validated`, or adds an open
  question.

## Rules

1. Real components and tokens only; no drawing tools, no hand-made images.
2. Both themes for every state.
3. The proposal never touches production code.
4. The proposal images are deleted in the closure commit of the work that ships them.

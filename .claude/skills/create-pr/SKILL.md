---
name: create-pr
description: Push the current feature branch and open a GitHub pull request. Drafts PR title from the branch name and commits; drafts body from branch commits and the feature plan doc if present. Requires gh CLI. Use at the end of any feature branch workflow.
tools: Bash, Read, AskUserQuestion
---

# Skill — `create-pr`

Invocation: `/create-pr`

---

## Step 1 — Pre-flight checks

Run in parallel:

```bash
git branch --show-current
```

```bash
git status --short
```

```bash
git log --oneline $(git merge-base HEAD main 2>/dev/null || echo "HEAD")..HEAD
```

```bash
gh auth status 2>&1 | head -3
```

- **On `main`**: stop — "You must be on a feature branch to create a PR."
- **Uncommitted changes**: list the files and stop — "Commit or stash changes before opening a PR."
- **No commits ahead of main**: stop — "No commits on this branch to open a PR for."
- **`gh` not authenticated**: stop — "Run `gh auth login` first, then retry `/create-pr`."

## Step 2 — Detect branch-name drift, then draft title (conventional commit format)

The PR title MUST be a conventional commit (`type(scope?): subject`). When the project uses GitHub's "Squash and merge", the PR title becomes the squash commit message on `main` — the local `commit-msg` hook does NOT run server-side, so this is the only gate. Validate before showing.

### Step 2a — Drift detection (active, not just advisory)

Parse the branch name's conventional type from the prefix (`feat/` → `feat`, etc.; default `chore` if no recognised prefix).

Parse each commit's conventional type from `git log --pretty=%s`. Group by type and pick the **dominant type** (most frequent).

Compare:

- **Match** — branch type == dominant commit type → continue silently.
- **Mismatch** — branch type ≠ dominant commit type → **challenge the user via AskUserQuestion** before drafting:

  > The branch is named `<branch>` (type: `<branch-type>`), but the dominant commit type is `<dominant-type>` (`<count>` of `<total>` commits).
  >
  > This usually means the work drifted during dev and the branch name no longer reflects what's in the PR.
  >
  > Options:
  > - **Rename branch** (recommended) — abort, the user runs `git branch -m <new-type>/<short-description>` then re-runs `/create-pr`.
  > - **Use dominant commit type for PR title** — proceed with `<dominant-type>` in the title; the branch name stays as-is (live with the inconsistency).
  > - **Keep branch type for PR title** — proceed with `<branch-type>`; the title will be one type while most commits are another.

- **Mixed types, no clear dominant** (e.g. 2 `feat:`, 2 `fix:`) — challenge the user: "Commits are mixed types (X `feat:`, Y `fix:`, …). A single PR should tell one story. Consider splitting, renaming the branch, or choosing the type that best describes the squash commit on `main`."

### Step 2b — Drafting algorithm

1. **Single commit ahead of main** — prefer the commit's message as the title (keep its conventional prefix intact; do NOT strip).
2. **Multiple commits** — derive from the branch name (using the resolved type from Step 2a):
   - The rest of the branch name (hyphens/underscores → spaces, lowercase) becomes the subject.
   - Compose: `<resolved-type>: <subject>`.

### Step 2c — Validation

- Title must match `^(feat|fix|chore|docs|refactor|test|ci)(\(.+\))?!?: .+`.
- Title length ≤ 72 chars.

If validation fails, do NOT show a broken candidate. Tell the user: "Couldn't draft a valid conventional title from this branch + commits. Please supply one." and require an Other-input.

Display the validated candidate:

> Draft title: `feat: add payment gateway` (27 chars)

## Step 3 — Draft body

1. Run `git log --oneline $(git merge-base HEAD main)..HEAD` and collect all commit messages.
2. Check for a plan doc: `Glob docs/plan/*-plan.md`. If one matches the branch domain, `Read` it and extract the feature description from the top section.
3. Produce a body in this format — keep it concise:

```
## Summary
{2–4 bullet points summarising what changed, derived from commits or plan}

## Commits
{one line per commit from git log, oldest first}

## Test plan
- [ ] {inferred from commit messages, plan doc, or reviewer steps completed}
- [ ] All checks pass (`just check-full`)
```

## Step 4 — Ask user to review title and body

Use **AskUserQuestion** (two questions in one call):

- **Q1** — "PR title — accept or edit?" pre-populate options with the draft title as Recommended; user selects or provides Other.
- **Q2** — "PR body — accept or edit?" options: Accept (Recommended) / Edit (user types replacement via Other).

## Step 5 — Confirm before pushing

Display:

> Ready to push `{branch}` to origin and open PR: `{title}`
> **This will make the branch and PR public.**

Use **AskUserQuestion** with Yes / Cancel. Stop if cancelled.

## Step 6 — Push and create PR

First, detect the default branch:

```bash
git remote show origin | grep 'HEAD branch' | grep -o '[^ ]*$'
```

Use the result as `{base}` (fall back to `main` if the command fails or returns empty).

```bash
git push -u origin HEAD
```

Pass the body via `--body-file` (write to a temp file first to avoid shell quoting issues):

```bash
BODY_FILE=$(mktemp)
printf '%s' '{body}' > "$BODY_FILE"
gh pr create --title "{title}" --base {base} --body-file "$BODY_FILE"
rm -f "$BODY_FILE"
```

## Step 7 — Show result

Output the PR URL returned by `gh pr create`. Done.

---

## Critical Rules

1. Never proceed if on `main`
2. Never proceed with uncommitted changes
3. Never push without explicit user confirmation (Step 5)
4. Never bypass `gh` authentication check

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

## Step 2 — Draft title

1. Take the current branch name (e.g. `feat/add-payment-gateway`).
2. Strip the prefix (`feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`, `ci/`).
3. Replace hyphens and underscores with spaces; capitalise the first letter.
4. If there is exactly one commit ahead of main, prefer its message (strip the conventional-commit type prefix: `feat: `, `fix: `, etc.) as the title instead.

Display the candidate:

> Draft title: `Add payment gateway` (19 chars)

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

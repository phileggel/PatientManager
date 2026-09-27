# Git hooks

Activate once after cloning:

```bash
git config core.hooksPath .githooks
```

The hooks are the fast local net. The full gate — tests with coverage, the
build, E2E — runs in CI on every pull request, and `just merge` refuses until it
is green. `just harness` runs that gate locally, scoped to what the branch
changed.

- **`pre-commit`** — refuses a commit on `main`; runs
  `scripts/privacy-check.py --staged`, then `scripts/scoped-checks.sh` on the
  staged files.
- **`commit-msg`** — conventional-commit title (`feat`, `fix`, `docs`, `test`,
  `chore`, `refactor`, `ci`), ≤ 72 characters, no trailing period; body ≤ 5
  lines; no `Co-Authored-By`; no SSN or IBAN in the message.
- **`pre-push`** — `scripts/scoped-checks.sh` on the files the pushed commits
  changed; a delete-only push is skipped.
- **`pre-merge-commit`** — refuses any merge commit (linear history).

`scripts/scoped-checks.sh` pays only for what a change touches
(`scripts/changed-scope.sh`): Prettier on Markdown, the script unit tests when
`scripts/` changed, and `check.py --fast` for the frontend, the backend, or
both. Docs and tooling changes pay no code check locally.

Bypassing a hook (`--no-verify`) is forbidden for the agent and meant for
emergencies only.

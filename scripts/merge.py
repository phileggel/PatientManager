#!/usr/bin/env python3
"""Fast-forward merge the current feature branch into main and delete it.

Refuses with a specific diagnostic + recovery command if FF is not safe.
The kit-shipped `just merge` is intentionally narrow: it handles the
fast-forward case only. Squash/rebase/divergence cases are surfaced as
explicit errors with the exact recovery commands to run.

If the project needs a different merge policy, override the `merge:` recipe
in the downstream `justfile`.
"""

from __future__ import annotations

import os
import subprocess
import sys
from typing import NoReturn

if os.environ.get("NO_COLOR"):
    RED = GREEN = BLUE = NC = ""
else:
    RED = "\033[0;31m"
    GREEN = "\033[0;32m"
    BLUE = "\033[0;34m"
    NC = "\033[0m"


def git(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["git", *args], capture_output=True, text=True, check=check)


def fail(msg: str, *recovery_lines: str) -> NoReturn:
    print(f"{RED}❌ {msg}{NC}", file=sys.stderr)
    for line in recovery_lines:
        print(f"{BLUE}   {line}{NC}", file=sys.stderr)
    sys.exit(1)


def main() -> int:
    branch = git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip()

    # Check 1 — not on main
    if branch == "main":
        fail(
            "Already on main — nothing to merge.",
            "Run `just merge` from a feature branch.",
        )

    # Check 2 — clean working tree (both staged and unstaged)
    if (
        git("diff", "--quiet", check=False).returncode != 0
        or git("diff", "--cached", "--quiet", check=False).returncode != 0
    ):
        fail(
            "Working tree has uncommitted changes.",
            "Commit or stash them, then re-run `just merge`.",
        )

    # Check 3 — local main in sync with origin/main (skipped if no GitHub remote)
    has_origin_main = (
        git("rev-parse", "--verify", "--quiet", "origin/main", check=False).returncode
        == 0
    )
    if has_origin_main:
        if git("fetch", "--quiet", "origin", "main", check=False).returncode != 0:
            fail(
                "Could not fetch origin/main (offline or unreachable).",
                "Check your network, then re-run `just merge`.",
            )
        local_main = git("rev-parse", "main").stdout.strip()
        remote_main = git("rev-parse", "origin/main").stdout.strip()
        if local_main != remote_main:
            fail(
                "Local main has drifted from origin/main.",
                "GitHub probably used squash-merge or rebase-merge —",
                "your branch's patch is on origin/main under a different SHA.",
                "`just merge` only handles the fast-forward case.",
                "",
                "To recover:",
                "  git checkout main && git reset --hard origin/main",
                f"  git branch -D {branch}",
            )
    else:
        print(
            f"{BLUE}ℹ No origin/main remote — skipping drift check.{NC}",
            file=sys.stderr,
        )

    # Check 4 — branch is fast-forwardable onto current main
    if git("merge-base", "--is-ancestor", "main", branch, check=False).returncode != 0:
        fail(
            f"`{branch}` is not a fast-forward of main — main has diverged since branch point.",
            "Rebase first: git rebase main && git push",
        )

    # All checks pass — do the merge
    git("checkout", "main")
    git("merge", "--ff-only", branch)
    git("branch", "-d", branch)
    print(
        f"{GREEN}✅ {branch} fast-forwarded into main and deleted.{NC}", file=sys.stderr
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

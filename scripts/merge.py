#!/usr/bin/env python3
"""Auto-rebase + fast-forward merge the current feature branch into a target branch.

Atomic "task done" shortcut: pull the target, rebase the branch onto it,
FF-merge into the target, push, and delete the feature branch both locally
and on origin. Fails fast with a clear recovery hint at any step that can't
proceed cleanly (rebase conflict, divergent push, dirty tree, etc.).

If your project needs a different merge policy (e.g. preserve merge commits,
no rebase), override the `merge` recipe in the downstream justfile.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path
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


def _git_dir() -> Path:
    return Path(git("rev-parse", "--git-dir").stdout.strip())


def _rebase_in_progress() -> bool:
    """True if a rebase was started but not yet finished or aborted."""
    gdir = _git_dir()
    return (gdir / "rebase-merge").is_dir() or (gdir / "rebase-apply").is_dir()


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "-t",
        "--target",
        default="main",
        help="Target branch to merge into (default: main).",
    )
    args = parser.parse_args()
    target = args.target

    branch = git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip()

    # Pre-flight 1 — not already on the target.
    if branch == target:
        fail(
            f"Already on {target} — nothing to merge.",
            f"Run from a feature branch (not {target}).",
        )

    # Pre-flight 2 — clean working tree (both staged and unstaged).
    if (
        git("diff", "--quiet", check=False).returncode != 0
        or git("diff", "--cached", "--quiet", check=False).returncode != 0
    ):
        fail(
            "Working tree has uncommitted changes.",
            "Commit or stash them, then re-run.",
        )

    # Pre-flight 3 — no rebase in progress (from a previous interrupted run).
    if _rebase_in_progress():
        fail(
            "A rebase is already in progress in this repo.",
            "Finish or abandon it first:",
            "  git rebase --continue   # after resolving conflicts",
            "  git rebase --abort      # to abandon",
            "Then re-run.",
        )

    # Pre-flight 4 — target branch exists locally.
    if git("rev-parse", "--verify", "--quiet", target, check=False).returncode != 0:
        fail(
            f"Target branch {target} does not exist locally.",
            f"Create or fetch it: git fetch origin {target}:{target}",
        )

    # Step 1 — sync local target with origin (skip if no GitHub remote).
    has_origin_target = (
        git(
            "rev-parse", "--verify", "--quiet", f"origin/{target}", check=False
        ).returncode
        == 0
    )
    git("checkout", target)
    if has_origin_target:
        result = git("pull", "--ff-only", "--quiet", "origin", target, check=False)
        if result.returncode != 0:
            fail(
                f"Could not fast-forward pull origin/{target}.",
                f"Local {target} has diverged from origin/{target}, or origin is unreachable.",
                f"Investigate: git fetch origin {target} && git log {target}..origin/{target}",
            )
    else:
        print(
            f"{BLUE}ℹ No origin/{target} remote — skipping pull.{NC}",
            file=sys.stderr,
        )

    # Step 2 — rebase the feature branch onto the (now-current) target.
    # On conflict, abort the rebase to restore the branch to its pre-rebase
    # state — `just merge` must stay "soft": never leave the user's branch in
    # a half-rewritten state. Conflict resolution is the user's job; we just
    # report cleanly and let them rebase manually.
    git("checkout", branch)
    result = git("rebase", target, check=False)
    if result.returncode != 0:
        git("rebase", "--abort", check=False)
        fail(
            f"Cannot merge `{branch}` into `{target}`: rebase has conflicts.",
            "Branch was restored to its original state (no rewrite).",
            "Resolve manually and re-run:",
            f"  git rebase {target}    # walk through the conflicts",
            "  # ...fix conflicting files, then git add + git rebase --continue",
            "  just merge              # finishes the merge",
        )

    # Step 3 — fast-forward merge target onto the rebased branch.
    # After step 2 this is guaranteed to FF; we still pass --ff-only for safety.
    git("checkout", target)
    result = git("merge", "--ff-only", branch, check=False)
    if result.returncode != 0:
        # Defensive — should be unreachable after a successful rebase.
        fail(
            f"Unexpected: FF-merge of `{branch}` into `{target}` failed after rebase.",
            "Investigate manually.",
        )

    # Step 4 — push target to origin (skip if no GitHub remote).
    if has_origin_target:
        result = git("push", "origin", target, check=False)
        if result.returncode != 0:
            fail(
                f"Could not push {target} to origin/{target}.",
                "Origin probably moved while merging.",
                f"Pull and re-run: git pull --ff-only origin {target}",
            )

    # Step 5 — delete the remote feature branch (if it exists).
    # Restores the "atomic shortcut" property: one command cleans up both
    # local and remote feature branches. Also removes the upstream reference
    # so Step 6's `git branch -d` falls back to the "merged-in-HEAD" check
    # (which passes after Step 3's FF-merge) instead of the stricter
    # "merged-in-upstream" check that would refuse if the feature branch was
    # ahead of its origin counterpart.
    #
    # Failure modes we distinguish:
    #   - Remote ref doesn't exist (race: someone else deleted it). Benign,
    #     fall through to local cleanup as if it had never been there.
    #   - Protected branch / pre-receive hook declined. The user needs to
    #     know — partial state on the remote, fix-forward required.
    #   - Network / auth failure. Same surface as the protected case.
    remote_state = "skipped"  # one of: skipped, deleted, gone, failed
    if has_origin_target:
        has_origin_branch = (
            git(
                "rev-parse", "--verify", "--quiet", f"origin/{branch}", check=False
            ).returncode
            == 0
        )
        if has_origin_branch:
            result = git("push", "--delete", "origin", branch, check=False)
            if result.returncode == 0:
                remote_state = "deleted"
            elif "remote ref does not exist" in (result.stderr or "").lower():
                remote_state = "gone"  # race — already removed elsewhere
            else:
                remote_state = "failed"
                stderr_excerpt = (result.stderr or "").strip().splitlines()
                detail = stderr_excerpt[-1] if stderr_excerpt else "no stderr"
                print(
                    f"{RED}❌ Failed to delete origin/{branch}: {detail}{NC}",
                    file=sys.stderr,
                )
                print(
                    f"{BLUE}   Retry manually once unblocked: "
                    f"git push --delete origin {branch}{NC}",
                    file=sys.stderr,
                )

    # Step 6 — delete the local branch.
    result = git("branch", "-d", branch, check=False)
    if result.returncode != 0:
        fail(
            f"Could not delete local branch {branch}.",
            "The branch is merged into target, but git refused the delete —",
            f"most likely a stale upstream config. Inspect: git branch -vv | grep {branch}",
            f"Confirm the merge: git log {target}..{branch}",
            f"Force-delete if confirmed: git branch -D {branch}",
        )

    # Compose an accurate success summary. Each segment reflects observed state,
    # not assumed state — important because Step 5's failure path leaves the
    # remote branch behind and the user must see that in the success line.
    parts = ["local"]
    if remote_state == "deleted":
        parts.append("remote")
    elif remote_state == "failed":
        parts.append("remote delete failed — see above")
    suffix = ", pushed" if has_origin_target else ""
    print(
        f"{GREEN}✅ {branch} rebased + merged into {target}{suffix}, "
        f"and deleted ({' + '.join(parts)}).{NC}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
